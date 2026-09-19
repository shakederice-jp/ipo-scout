import { createClient } from "@supabase/supabase-js";
import { generateWithGemini } from "./gemini";
import { postToX } from "./post-to-x";

// ===== 2026/9/19追加: X自動投稿(3回/日・本実装) =====
// これまでの「generate-x-drafts」cron(1日1回・06:00 JST)は market_trends に下書き記事を
// 溜めるだけで、実際にXへ投稿するのは別途、週次(金曜18時)の cron/notify のみだった。
// このファイルは、その溜まった下書き記事の中から時間帯(スロット)ごとに1件選び、
// 500〜800字程度に要約し直した上で実際にpostToX()を呼んでXへ投稿する「本実装」部分。
//
// 優先順位(runAutoPost内で実装):
//  Tier A: 深掘り3部作(ビジネスモデル・ストーリー・競合との違い)の連載が進行中なら、
//          時間帯を問わずその続きを最優先で投稿する(「続きはまた後日」を回収する)
//  Tier B: スロットごとの優先テーマ(朝=初値・その後の値動き、夜=直近のIPO銘柄に関する新情報)
//  Tier C: 優先テーマの在庫が無い日は、深掘り3部作の新規連載を開始する
//  Tier D: それも無ければ、最も古い未投稿の下書き記事で穴埋めする(「他のテーマで埋める」)
//
// 週次金曜18時の既存ツイート(cron/notify)とは完全に独立しており、このファイルは一切触れない。

const supabaseForAutoPost = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type AutoPostSlot = "morning" | "evening1" | "evening2";

export interface AutoPostOutcome {
  posted: boolean;
  reason?: string;
  tweetId?: string;
  sourceTitle?: string;
  charLength?: number;
}

interface MarketTrendRow {
  id: string; // market_trends.idはuuid(他の主要テーブルと同じ命名規則)
  title: string;
  content: string;
  source_links: { title: string; url: string; source: string }[] | null;
}

const DEEP_DIVE_TITLE_PREFIX = "ビジネスモデル・ストーリー・競合との違い";
const PRICE_CHECKPOINT_TITLE_PREFIX = "初値・その後の値動き";
const RECENT_NEWS_TITLE_PREFIX = "直近のIPO銘柄に関する新情報";

// CTA(プロフィール誘導文)は本文の500〜800字とは別枠で末尾に付与する(2026/9/19の相談で決定)。
// 2種類をスロット・日付に応じて機械的にローテーションするだけで、AIには生成させない
// (毎回表現が微妙にブレるのを避け、確実に両方とも一定頻度で露出させるため)。
const CTA_VARIANTS = [
  "詳しくはプロフィール欄のアドレスをクリックすると詳細をご覧いただけます",
  "プロフィール欄のアドレスをクリックして紹介特典をゲット",
];
const CLIFFHANGER_CTA = "🔜 続きはまた後日";

function pickCta(slot: AutoPostSlot): string {
  const dayOfMonth = new Date().getDate();
  const slotOffset = slot === "morning" ? 0 : slot === "evening1" ? 1 : 2;
  return CTA_VARIANTS[(dayOfMonth + slotOffset) % CTA_VARIANTS.length];
}

// market_trendsのcontentには保存時にサイトリンク付きのフッター(区切り線+担当表記+URL)と
// ハッシュタグが機械的に追記されている(generate-x-drafts/route.tsのsaveThemeArticle参照)。
// 自動投稿用に要約し直す元テキストとしては不要なため、区切り線より前だけを取り出す。
function stripFooter(content: string): string {
  const sep = "─".repeat(20);
  const idx = content.indexOf(sep);
  return (idx >= 0 ? content.slice(0, idx) : content).trim();
}

// 自動投稿(3回/日)専用のフォーマット指示。既存のSTYLE_GUIDE(1000〜1500字・/trendsページ用)
// とは長さ・構成のルールが異なるため、フィールド流用を避けて別定義にしている
// (「1つのフィールドを複数の目的で使い回さない」という本プロジェクトの既定方針に沿う)。
const AUTO_POST_STYLE_GUIDE = `
# 自動投稿(3回/日)専用フォーマット(通常のマーケットトレンド記事とは別ルール・厳守)
- 冒頭1行を「見出し」とし、絵文字+要点を体言止めで簡潔に書く
- 続けて1〜2文の「リード文」で背景・要旨を説明する
- その後、根拠・数値・詳細を箇条書き(▼や・などの記号)で2〜4項目、改行を入れて書く
- 「です・ます」調は使わず、体言止め・IR速報風で統一する
- 全体で500〜800文字程度に収める(この文字数に収まるよう、元の内容を要約・凝縮すること)
- URLやハッシュタグ、末尾の宣伝文・プロフィール誘導文は一切含めない(別途システム側で付与するため)
- 個別銘柄への売買助言(「買うべき」「今が売り時」等)は書かないこと
`;

async function condenseForAutoPost(rawContent: string): Promise<string> {
  const prompt = `
あなたは日本の個人投資家向けメディアの編集者です。以下は既存の特集記事の本文です。この内容を要約・凝縮し、X(旧Twitter)本投稿用の短い記事に書き直してください。

# 元の記事本文
${rawContent}

${AUTO_POST_STYLE_GUIDE}

投稿文のみを出力してください。前置きや説明は不要です。
`;
  return (await generateWithGemini(prompt)).trim();
}

// 深掘り3部作(💼儲けの仕組み/📖上場までのストーリー/⚖️競合との違い)の記事本文を、
// 見出し絵文字を目印に3パートへ分割する。DEEP_DIVE_TREND_STYLE(x-post-themes.ts)が
// この3つの絵文字見出しを必ず立てるよう指示しているため、これを分割の目印として使う。
function splitDeepDiveSections(rawBody: string): { part1: string; part2: string; part3: string } | null {
  const closingMarker = "くわしくは分析ページで無料公開中です";
  const closingIdx = rawBody.indexOf(closingMarker);
  const body = (closingIdx >= 0 ? rawBody.slice(0, closingIdx) : rawBody).trim();

  const idx1 = body.indexOf("💼");
  const idx2 = body.indexOf("📖");
  const idx3 = body.indexOf("⚖️");
  if (idx1 < 0 || idx2 < 0 || idx3 < 0 || !(idx1 < idx2 && idx2 < idx3)) return null;

  return {
    part1: body.slice(idx1, idx2).trim(),
    part2: body.slice(idx2, idx3).trim(),
    part3: body.slice(idx3).trim(),
  };
}

// 2026/9/19追加: 連載投稿(1/3・2/3・3/3)だけを見ても、深掘り3要素の本文自体には
// 銘柄名が明記されないことがあり、「どの銘柄の続きか分からない」との指摘があった。
// market_trends.titleは「ビジネスモデル・ストーリー・競合との違い(会社名)」の形式で
// 必ず銘柄名を末尾の括弧に含んでいる(x-post-themes.ts・generate-x-drafts/route.ts参照)ため、
// そこから銘柄名を取り出して各パートの投稿文に明記する。
function extractCompanyName(title: string): string | null {
  const match = title.match(/\(([^()]+)\)\s*$/);
  return match ? match[1] : null;
}

// 2026/9/19追加: 「銘柄を取り上げる場合は上場予定日○/○、または○/○上場済みも添えてほしい」
// との要望を受けて追加。x-post-themes.tsの単一銘柄テーマ(初値・その後の値動き/直近IPO新情報/
// 深掘り3要素/ロックアップ解除カウントダウン/競合決算比較 等)は例外なく、source_linksに
// 「{会社名}の詳細分析ページ」というtitleと「.../analysis/{company_id}」というurlを
// 1件だけ設定している。複数銘柄をまとめて扱うテーマ(IPOカレンダー等)はsource_linksが
// 複数件になるため、件数が1件かどうかで「単一銘柄の記事か」も同時に判定できる
// (複数銘柄記事は各銘柄の上場日が既に本文中に書かれているため、あえて付与しない)。
function extractSingleCompanyFromSourceLinks(
  sourceLinks: { title: string; url: string; source: string }[] | null
): { id: string; name: string } | null {
  if (!sourceLinks || sourceLinks.length !== 1) return null;
  const link = sourceLinks[0];
  const match = link.url.match(/\/analysis\/([^/?#]+)/);
  if (!match) return null;
  const name = link.title.replace(/の詳細分析ページ$/, "");
  return { id: match[1], name };
}

// 上場日が今日(JST)以前なら「○/○上場済み」、まだ先なら「上場予定日○/○」を返す。
// listing_date未設定(手動登録直後等)の銘柄はnullを返し、呼び出し側は日付ラベル無しで続行する。
async function fetchListingDateLabel(companyId: string): Promise<string | null> {
  const { data, error } = await supabaseForAutoPost
    .from("ipo_companies")
    .select("listing_date")
    .eq("id", companyId)
    .maybeSingle();
  if (error || !data?.listing_date) return null;
  const todayJst = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const parts = String(data.listing_date).slice(0, 10).split("-");
  if (parts.length !== 3) return null;
  const md = `${Number(parts[1])}/${Number(parts[2])}`;
  return String(data.listing_date).slice(0, 10) <= todayJst ? `${md}上場済み` : `上場予定日${md}`;
}

// 単一銘柄の記事であれば「会社名・上場日ラベル」の形の見出し文字列を返す(無ければnull)。
// source_linksからの抽出を優先し、取れなければmarket_trends.titleの末尾括弧から会社名だけ
// フォールバックで拾う(この場合は上場日ラベルは付けない)。
async function buildCompanyLabel(
  title: string,
  sourceLinks: { title: string; url: string; source: string }[] | null
): Promise<string | null> {
  const company = extractSingleCompanyFromSourceLinks(sourceLinks);
  if (company) {
    const dateLabel = await fetchListingDateLabel(company.id);
    return dateLabel ? `${company.name}・${dateLabel}` : company.name;
  }
  return extractCompanyName(title);
}

async function findInProgressSeries(): Promise<{ progressId: number; marketTrendId: string; nextPart: number } | null> {
  const { data, error } = await supabaseForAutoPost
    .from("x_series_progress")
    .select("id, market_trend_id, next_part")
    .gt("next_part", 1)
    .lte("next_part", 3)
    .order("updated_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return { progressId: data.id, marketTrendId: data.market_trend_id, nextPart: data.next_part };
}

async function getInProgressOrDoneSeriesIds(): Promise<string[]> {
  const { data } = await supabaseForAutoPost.from("x_series_progress").select("market_trend_id");
  return (data ?? []).map((r: any) => r.market_trend_id);
}

async function findFreshRowByPrefix(titlePrefix: string): Promise<MarketTrendRow | null> {
  const { data, error } = await supabaseForAutoPost
    .from("market_trends")
    .select("id, title, content, source_links")
    .is("posted_to_x_at", null)
    .eq("is_theme_article", true)
    .like("title", `${titlePrefix}%`)
    .order("fetched_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as MarketTrendRow;
}

async function findFreshDeepDiveRow(): Promise<MarketTrendRow | null> {
  const excludeIds = await getInProgressOrDoneSeriesIds();
  const { data, error } = await supabaseForAutoPost
    .from("market_trends")
    .select("id, title, content, source_links")
    .is("posted_to_x_at", null)
    .eq("is_theme_article", true)
    .like("title", `${DEEP_DIVE_TITLE_PREFIX}%`)
    .order("fetched_at", { ascending: true })
    .limit(5);
  if (error || !data) return null;
  const fresh = data.filter((r: any) => !excludeIds.includes(r.id));
  return (fresh[0] as MarketTrendRow) ?? null;
}

async function findGenericFallbackRow(): Promise<MarketTrendRow | null> {
  const excludeIds = await getInProgressOrDoneSeriesIds();
  const { data, error } = await supabaseForAutoPost
    .from("market_trends")
    .select("id, title, content, source_links")
    .is("posted_to_x_at", null)
    .eq("is_theme_article", true)
    .not("title", "like", `${DEEP_DIVE_TITLE_PREFIX}%`)
    .order("fetched_at", { ascending: true })
    .limit(10);
  if (error || !data) return null;
  const fresh = data.filter((r: any) => !excludeIds.includes(r.id));
  return (fresh[0] as MarketTrendRow) ?? null;
}

async function postPlainRow(row: MarketTrendRow, slot: AutoPostSlot): Promise<AutoPostOutcome> {
  const rawBody = stripFooter(row.content);
  let condensed: string;
  try {
    condensed = await condenseForAutoPost(rawBody);
  } catch (e) {
    console.error("自動投稿: 要約生成に失敗", e);
    return { posted: false, reason: "要約生成に失敗しました" };
  }
  const companyLabel = await buildCompanyLabel(row.title, row.source_links);
  const finalText = `${companyLabel ? `【${companyLabel}】\n` : ""}${condensed}\n\n${pickCta(slot)}`;

  const postResult = await postToX(finalText);
  if (!postResult.success) {
    return { posted: false, reason: postResult.error || "X投稿に失敗しました" };
  }

  const { error: updateError } = await supabaseForAutoPost
    .from("market_trends")
    .update({ posted_to_x_at: new Date().toISOString(), x_post_id: postResult.id ?? null })
    .eq("id", row.id);
  if (updateError) console.error("自動投稿: posted_to_x_at更新失敗", updateError.message);

  return { posted: true, tweetId: postResult.id, sourceTitle: row.title, charLength: finalText.length };
}

async function startSeries(marketTrendId: string): Promise<number> {
  const { data, error } = await supabaseForAutoPost
    .from("x_series_progress")
    .insert({ market_trend_id: marketTrendId, next_part: 1 })
    .select("id")
    .single();
  if (error || !data) throw new Error(`シリーズ開始の記録に失敗: ${error?.message}`);
  return data.id;
}

async function postSeriesPart(marketTrendId: string, part: number, slot: AutoPostSlot, progressId: number): Promise<AutoPostOutcome> {
  const { data: row, error } = await supabaseForAutoPost
    .from("market_trends")
    .select("id, title, content, source_links")
    .eq("id", marketTrendId)
    .maybeSingle();
  if (error || !row) return { posted: false, reason: "シリーズ元記事の取得に失敗しました" };

  const sections = splitDeepDiveSections(stripFooter(row.content));
  if (!sections) {
    // 想定外のフォーマットで3分割できない場合は、連載を諦めて通常の1本記事として投稿する
    await supabaseForAutoPost.from("x_series_progress").delete().eq("id", progressId);
    return await postPlainRow(row as MarketTrendRow, slot);
  }

  const partText = part === 1 ? sections.part1 : part === 2 ? sections.part2 : sections.part3;
  const isFinal = part >= 3;
  const cta = isFinal ? pickCta(slot) : CLIFFHANGER_CTA;
  const companyLabel = await buildCompanyLabel(row.title, row.source_links);
  const partLabel = companyLabel ? `【${companyLabel}】(${part}/3)` : `(${part}/3)`;
  const finalText = `${partLabel}\n${partText}\n\n${cta}`;

  const postResult = await postToX(finalText);
  if (!postResult.success) {
    return { posted: false, reason: postResult.error || "X投稿に失敗しました" };
  }

  if (isFinal) {
    await supabaseForAutoPost.from("x_series_progress").delete().eq("id", progressId);
    await supabaseForAutoPost
      .from("market_trends")
      .update({ posted_to_x_at: new Date().toISOString(), x_post_id: postResult.id ?? null })
      .eq("id", marketTrendId);
  } else {
    await supabaseForAutoPost
      .from("x_series_progress")
      .update({ next_part: part + 1, updated_at: new Date().toISOString() })
      .eq("id", progressId);
    await supabaseForAutoPost
      .from("market_trends")
      .update({ x_post_id: postResult.id ?? null })
      .eq("id", marketTrendId);
  }

  return { posted: true, tweetId: postResult.id, sourceTitle: `${row.title}(${part}/3)`, charLength: finalText.length };
}

export async function runAutoPost(slot: AutoPostSlot): Promise<AutoPostOutcome> {
  // Tier A: 深掘り3部作の連載が進行中なら、時間帯を問わず最優先で続きを投稿する
  const inProgress = await findInProgressSeries();
  if (inProgress) {
    return await postSeriesPart(inProgress.marketTrendId, inProgress.nextPart, slot, inProgress.progressId);
  }

  // Tier B: スロットごとの優先テーマ(朝=答え合わせ、夜=直近の新情報)
  const priorityPrefix = slot === "morning" ? PRICE_CHECKPOINT_TITLE_PREFIX : RECENT_NEWS_TITLE_PREFIX;
  const priorityRow = await findFreshRowByPrefix(priorityPrefix);
  if (priorityRow) {
    return await postPlainRow(priorityRow, slot);
  }

  // Tier C: 優先テーマの在庫が無い日は、深掘り3部作の新規連載を開始する
  const deepDiveRow = await findFreshDeepDiveRow();
  if (deepDiveRow) {
    const progressId = await startSeries(deepDiveRow.id);
    return await postSeriesPart(deepDiveRow.id, 1, slot, progressId);
  }

  // Tier D: それも無ければ、最も古い未投稿の下書き記事で穴埋めする
  const fallbackRow = await findGenericFallbackRow();
  if (fallbackRow) {
    return await postPlainRow(fallbackRow, slot);
  }

  return { posted: false, reason: "投稿できる未使用の記事がありませんでした" };
}
