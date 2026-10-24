import { createClient } from "@supabase/supabase-js";
import { notifyAdmin } from "./notify-admin";
import { TERM_GROUPS } from "./ipo-terms";
import { buildMarketTrendsHashtags } from "./market-trends-hashtags";
import {
  SITE_URL,
  type EmailSlot,
  analysisUrlFor,
  classifyTrend,
  composePost,
  condenseForEmail,
  displayTitle,
  fitLength,
  lookupTickerByName,
  resolveTrendLink,
  sendXPostEmail,
  withXUtm,
} from "./x-email";

// ===== 2026/10/18全面改修: X自動投稿(API投稿)をやめ、「メール送信方式」に切り替えた =====
// X APIでの自動投稿は費用がかかるため、投稿用の原稿はすべてマイケルさん宛のメールで届け、
// メール内の「この原稿で投稿する」ボタン(Xの投稿画面が原稿入りで開く)から投稿する方式にした。
// 送信は 朝6時の便・夕16時の便 の1日2回(スロット名は morning / evening)。
// 2026/10/24: 配信は平日(月〜金)のみ(土日は配信しない)。実行日の制御は .github/workflows/cron.yml のスケジュール側で行う。
// 月曜朝の便は、金曜夕〜月曜朝の間に残った未送信分を、予備(FALLBACK_FRESH_DAYS=7日以内)や新情報(36時間以内)で拾う。
//
// 【何をメールで送るか】(件数が重なる場合も、1件につき1通。まとめない)
//  ① 新情報(新しく出たもの): すべて個別のメールで送る。
//      ・新規IPO承認ドラフト/IPO再掲ドラフト(x_post_drafts)…新規IPOの分析ができたとき等に作られる
//      ・マーケットトレンド記事(market_trends)…generate-x-drafts cronが毎朝作る記事(答え合わせ・
//        ロックアップ・IPOカレンダー・直近IPOの新情報 等)
//    「前日16時以降に出た新情報は朝6時の便、当日6時以降に出た新情報は夕16時の便」は、
//    送信済みの記録(下記)により自然にそうなる(6時の便は前夜〜朝の分、16時の便は日中の分が未送信で残っているため)。
//  ② ①が1通も無かった便は、必ず中身のある予備のメールを1通送る(連載の続き→深掘り連載の新規開始→
//    未送信の古めの記事→IPO用語ワンポイント の順)。「6時・16時に何も届かない/スキップ通知だけ届く」を無くすため。
//
// 【送信済みの記録】市場トレンド記事は market_trends.posted_to_x_at、ドラフトは x_post_drafts.included_in_digest。
// 送る前にこの記録を「先に」付けて(取り合い防止)、メール送信に失敗したら元に戻す。
// 以前の「投稿可能時間帯」ガードは廃止した(GitHub Actionsの定時実行は遅れることがあり、時間帯を過ぎると
// 「スキップ」通知だけが届いていたため)。遅れて実行されても、その時点で未送信のものを必ず送る。
//
// 週次金曜18時のツイート(cron/notify)は今までどおりX APIで自動投稿のままで、このファイルは触れない。

const supabaseForAutoPost = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type AutoPostSlot = EmailSlot;

export interface SentItem {
  kind: string;
  title: string;
  ok: boolean;
  error?: string;
}

export interface AutoPostOutcome {
  sent: number;
  failed: number;
  items: SentItem[];
  usedFallback: boolean;
  reason?: string;
}

interface TrendRow {
  id: string; // market_trends.idはuuid
  title: string;
  content: string;
  source_links: { title: string; url: string; source: string }[] | null;
  sector: string | null;
  image_url: string | null;
}

const DEEP_DIVE_TITLE_PREFIX = "ビジネスモデル・ストーリー・競合との違い";
// 「新規IPO紹介」記事は、同じ内容が新規IPO承認ドラフト(x_post_drafts)でも届くため、二重にならないよう対象外にする。
const NEW_IPO_INTRO_PREFIX = "新規IPO紹介";

const NEW_INFO_FRESH_HOURS = 36; // 新情報として扱う記事の鮮度(前日夕方〜当日の分が入る長さ)
const DRAFT_FRESH_DAYS = 4; // ドラフトは取りこぼしたくないので長めに見る
const FALLBACK_FRESH_DAYS = 7; // 予備として使う、未送信の古めの記事

const TREND_COLUMNS = "id, title, content, source_links, sector, image_url";

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

// market_trendsのcontentには保存時にサイトリンク付きのフッター(区切り線+担当表記+URL)と
// ハッシュタグが機械的に追記されている(generate-x-drafts/route.tsのsaveThemeArticle参照)。
// 要約し直す元テキストとしては不要なため、区切り線より前だけを取り出す。
function stripFooter(content: string): string {
  const sep = "─".repeat(20);
  const idx = content.indexOf(sep);
  return (idx >= 0 ? content.slice(0, idx) : content).trim();
}

// 深掘り3部作(💼儲けの仕組み/📖上場までのストーリー/⚖️競合との違い)の記事本文を、
// 見出し絵文字を目印に3パートへ分割する。
function splitDeepDiveSections(rawBody: string): { part1: string; part2: string; part3: string } | null {
  // 締めの一文(「くわしい企業分析は、解説ページにて一部無料で公開中です。」等)は
  // AIが言い回しを変えることがあるため、「公開中」を含む最後の行を締めの一文とみなして取り除く。
  const lines = rawBody.split("\n");
  let cut = lines.length;
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 4); i--) {
    if (/公開中/.test(lines[i])) {
      cut = i;
      break;
    }
  }
  const body = lines.slice(0, cut).join("\n").trim();

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

function extractCompanyName(title: string): string | null {
  const match = title.match(/\(([^()]+)\)\s*$/);
  return match ? match[1] : null;
}

// 単一銘柄の記事であれば「会社名・上場日ラベル」の形の見出し文字列を返す(無ければnull)。
// 2026/9/19の要望(銘柄を取り上げる場合は上場予定日○/○、または○/○上場済みも添える)を引き継いでいる。
async function fetchListingDateLabel(companyId: string): Promise<string | null> {
  const bySlug = await supabaseForAutoPost.from("ipo_companies").select("listing_date").eq("ticker", companyId).maybeSingle();
  let listing = bySlug.data?.listing_date as string | null | undefined;
  if (!listing) {
    const byId = await supabaseForAutoPost.from("ipo_companies").select("listing_date").eq("id", companyId).maybeSingle();
    listing = byId.data?.listing_date as string | null | undefined;
  }
  if (!listing) return null;
  const todayJst = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const parts = String(listing).slice(0, 10).split("-");
  if (parts.length !== 3) return null;
  const md = `${Number(parts[1])}/${Number(parts[2])}`;
  return String(listing).slice(0, 10) <= todayJst ? `${md}上場済み` : `上場予定日${md}`;
}

async function buildCompanyLabel(
  title: string,
  sourceLinks: { title: string; url: string; source: string }[] | null
): Promise<string | null> {
  if (sourceLinks && sourceLinks.length === 1) {
    const m = sourceLinks[0].url.match(/\/analysis\/([^/?#]+)/);
    if (m) {
      const name = sourceLinks[0].title.replace(/の詳細分析ページ$/, "");
      const dateLabel = await fetchListingDateLabel(m[1]).catch(() => null);
      return dateLabel ? `${name}・${dateLabel}` : name;
    }
  }
  return extractCompanyName(title);
}

// ---------- 送信済みの記録(取り合い防止: 先に記録→送信→失敗したら戻す) ----------

async function claimTrend(id: string): Promise<boolean> {
  const { data, error } = await supabaseForAutoPost
    .from("market_trends")
    .update({ posted_to_x_at: new Date().toISOString() })
    .eq("id", id)
    .is("posted_to_x_at", null)
    .select("id");
  return !error && !!data && data.length > 0;
}

async function releaseTrend(id: string): Promise<void> {
  await supabaseForAutoPost.from("market_trends").update({ posted_to_x_at: null }).eq("id", id);
}

async function claimDraft(id: any): Promise<boolean> {
  const { data, error } = await supabaseForAutoPost
    .from("x_post_drafts")
    .update({ included_in_digest: true })
    .eq("id", id)
    .eq("included_in_digest", false)
    .select("id");
  return !error && !!data && data.length > 0;
}

async function releaseDraft(id: any): Promise<void> {
  await supabaseForAutoPost.from("x_post_drafts").update({ included_in_digest: false }).eq("id", id);
}

// ---------- ① 新情報: マーケットトレンド記事 ----------

async function fetchNewTrends(): Promise<TrendRow[]> {
  const { data, error } = await supabaseForAutoPost
    .from("market_trends")
    .select(TREND_COLUMNS)
    .is("posted_to_x_at", null)
    .eq("is_theme_article", true)
    .not("title", "like", `${DEEP_DIVE_TITLE_PREFIX}%`)
    .not("title", "like", `${NEW_IPO_INTRO_PREFIX}%`)
    .gte("fetched_at", hoursAgoIso(NEW_INFO_FRESH_HOURS))
    .order("fetched_at", { ascending: true });
  if (error || !data) return [];
  return data as TrendRow[];
}

// マーケットトレンド記事1本を、300〜500字・語りかけ口調に整え、リンクを付けて1通のメールで送る。
// 呼び出し側で先にclaimTrend済みであること。失敗した場合はエラーを投げず、okをfalseにして返す(記録は呼び出し側で戻す)。
async function emailTrendRow(row: TrendRow, slot: AutoPostSlot): Promise<SentItem> {
  const kind = classifyTrend(row.title);
  // 件名の「種類｜タイトル」が同じ言葉の繰り返しにならないよう、括弧付きでないタイトル(IPOカレンダー等)は日付を添える
  const todayLabel = new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" });
  const baseTitle = displayTitle(row.title);
  const shownTitle = baseTitle === row.title ? `${todayLabel}分` : baseTitle;
  try {
    const raw = stripFooter(row.content);
    const body = await condenseForEmail(raw, { title: row.title });
    const companyLabel = await buildCompanyLabel(row.title, row.source_links);
    const labeled = companyLabel && kind.page === "company" ? `【${companyLabel}】\n${body}` : body;
    const link = await resolveTrendLink(kind, row.source_links);
    const hashtags = buildMarketTrendsHashtags(row.title, row.sector);
    const postText = composePost(labeled, link, hashtags);
    const r = await sendXPostEmail({
      slot,
      kindLabel: kind.label,
      title: shownTitle,
      postText,
      linkUrl: link.url,
      imageUrl: row.image_url,
    });
    return { kind: kind.label, title: shownTitle, ok: r.ok, error: r.error };
  } catch (e: any) {
    return { kind: kind.label, title: shownTitle, ok: false, error: e?.message ?? String(e) };
  }
}

async function processTrend(row: TrendRow, slot: AutoPostSlot): Promise<SentItem | null> {
  if (!(await claimTrend(row.id))) return null; // 他の実行が先に処理した
  const item = await emailTrendRow(row, slot);
  if (!item.ok) await releaseTrend(row.id);
  return item;
}

// ---------- ① 新情報: 新規IPO承認ドラフト・IPO再掲ドラフト ----------

interface DraftRow {
  id: any;
  content: string;
  image_url: string | null;
  source_note: string | null;
  theme_label: string;
}

async function fetchPendingDrafts(): Promise<DraftRow[]> {
  const { data, error } = await supabaseForAutoPost
    .from("x_post_drafts")
    .select("id, content, image_url, source_note, theme_label, created_at")
    .eq("theme_number", 0)
    .in("theme_label", ["新規IPO承認", "IPO再掲"])
    .eq("included_in_digest", false)
    .gte("created_at", hoursAgoIso(DRAFT_FRESH_DAYS * 24))
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  // IPO再掲ドラフトは、以前のメール(旧方式)では送信済みの記録が付かなかったため、切り替え直後に
  // 過去分が再送されないよう、直近36時間に作られたものだけを対象にする。
  const reFresh = Date.now() - NEW_INFO_FRESH_HOURS * 60 * 60 * 1000;
  return (data as any[]).filter(
    (d) => d.theme_label !== "IPO再掲" || new Date(d.created_at).getTime() >= reFresh
  ) as DraftRow[];
}

// 文末のハッシュタグ行を切り分ける
function splitHashtagTail(text: string): { body: string; tags: string } {
  const m = text.trim().match(/^([\s\S]*?)\s*((?:#[^\s#]+[ \t]*)+)$/);
  return m ? { body: m[1].trim(), tags: m[2].trim() } : { body: text.trim(), tags: "" };
}

async function emailDraft(d: DraftRow, slot: AutoPostSlot): Promise<SentItem> {
  const isRepost = d.theme_label === "IPO再掲";
  const kindLabel = isRepost ? "IPO再掲" : "新規IPO承認";
  const content = d.content ?? "";
  // 銘柄名: source_note「IPO分析システム由来(会社名)」→無ければ本文2行目
  const nameFromNote = (d.source_note ?? "").match(/\(([^()]+)\)\s*$/)?.[1];
  const name = nameFromNote || content.split("\n")[1]?.trim() || "";
  const tickerFromText = content.match(/コード[：:]\s*([0-9A-Z]{4})/)?.[1] ?? null;
  const shownTitle = `${name}${tickerFromText ? `(${tickerFromText})` : ""}` || kindLabel;
  try {
    const slug = tickerFromText ?? (name ? await lookupTickerByName(name) : null);
    const campaign = isRepost ? "ipo-repost" : "ipo-approved";
    const linkUrl = slug ? await analysisUrlFor(slug, campaign) : withXUtm(`${SITE_URL}/schedule`, campaign);

    const { body: rawBody, tags } = splitHashtagTail(content);
    // 「続きは大手町調査室９課公式HPで読む」は、分析ページへのリンクに置き換える。
    // 値が無い行(「市場:不明」「コード:未定」等)は出さない(2026/8/29の方針)。
    let body = rawBody
      .replace(/\n*続きは大手町調査室[９9]課公式HPで読む\s*$/, "")
      .split("\n")
      .filter((line) => !/^・[^：:\n]+[：:]\s*(不明|未定)\s*$/.test(line.trim()))
      .join("\n")
      .trim();
    if (body.length > 650) {
      body = await condenseForEmail(body, { title: `${kindLabel} ${shownTitle}` });
    }
    const postText = composePost(body, { url: linkUrl, cta: "詳しい分析はこちら👇" }, tags || "#IPO #新規上場");
    const r = await sendXPostEmail({ slot, kindLabel, title: shownTitle, postText, linkUrl, imageUrl: d.image_url });
    return { kind: kindLabel, title: shownTitle, ok: r.ok, error: r.error };
  } catch (e: any) {
    return { kind: kindLabel, title: shownTitle, ok: false, error: e?.message ?? String(e) };
  }
}

async function processDraft(d: DraftRow, slot: AutoPostSlot): Promise<SentItem | null> {
  if (!(await claimDraft(d.id))) return null;
  const item = await emailDraft(d, slot);
  if (!item.ok) await releaseDraft(d.id);
  return item;
}

// ---------- ② 予備: 深掘り連載 ----------

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

async function getInProgressSeriesIds(): Promise<string[]> {
  const { data } = await supabaseForAutoPost.from("x_series_progress").select("market_trend_id");
  return (data ?? []).map((r: any) => r.market_trend_id);
}

async function findDeepDiveRowToStart(): Promise<TrendRow | null> {
  const excludeIds = await getInProgressSeriesIds();
  const { data, error } = await supabaseForAutoPost
    .from("market_trends")
    .select(TREND_COLUMNS)
    .is("posted_to_x_at", null)
    .eq("is_theme_article", true)
    .like("title", `${DEEP_DIVE_TITLE_PREFIX}%`)
    .order("fetched_at", { ascending: true })
    .limit(5);
  if (error || !data) return null;
  const fresh = data.filter((r: any) => !excludeIds.includes(r.id));
  return (fresh[0] as TrendRow) ?? null;
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

// 連載の1回分を送る。送る前に「次の回」へ進めて取り合いを防ぎ、送信に失敗したら元の回に戻す。
async function sendSeriesPart(marketTrendId: string, part: number, slot: AutoPostSlot, progressId: number): Promise<SentItem | null> {
  const { data: row, error } = await supabaseForAutoPost
    .from("market_trends")
    .select(TREND_COLUMNS)
    .eq("id", marketTrendId)
    .maybeSingle();
  if (error || !row) return { kind: "深掘り連載", title: "(記事の取得に失敗)", ok: false, error: "シリーズ元記事の取得に失敗しました" };
  const trend = row as TrendRow;
  const shownTitle = displayTitle(trend.title);

  const sections = splitDeepDiveSections(stripFooter(trend.content));
  if (!sections) {
    // 想定外のフォーマットで3分割できない場合は、連載を諦めて通常の1本記事として送る
    await supabaseForAutoPost.from("x_series_progress").delete().eq("id", progressId);
    if (!(await claimTrend(trend.id))) return null;
    const item = await emailTrendRow(trend, slot);
    if (!item.ok) await releaseTrend(trend.id);
    return item;
  }

  const isFinal = part >= 3;
  // 取り合い防止の「先に記録」
  if (isFinal) {
    if (!(await claimTrend(trend.id))) return null;
  } else {
    const { data: bumped } = await supabaseForAutoPost
      .from("x_series_progress")
      .update({ next_part: part + 1, updated_at: new Date().toISOString() })
      .eq("id", progressId)
      .eq("next_part", part)
      .select("id");
    if (!bumped || bumped.length === 0) return null;
  }

  const revert = async () => {
    if (isFinal) await releaseTrend(trend.id);
    else await supabaseForAutoPost.from("x_series_progress").update({ next_part: part }).eq("id", progressId);
  };

  try {
    const partText = part === 1 ? sections.part1 : part === 2 ? sections.part2 : sections.part3;
    let body = partText;
    if (body.length < 250 || body.length > 600) {
      body = await condenseForEmail(partText, { title: trend.title, part: { n: part, total: 3 } });
    }
    const companyLabel = await buildCompanyLabel(trend.title, trend.source_links);
    const partLabel = companyLabel ? `【${companyLabel}】(${part}/3)` : `(${part}/3)`;
    const tail = isFinal ? "" : "\n\n🔜 続きはまた後日";
    const kind = classifyTrend(trend.title);
    const link = await resolveTrendLink(kind, trend.source_links);
    const hashtags = buildMarketTrendsHashtags(trend.title, trend.sector);
    const postText = composePost(`${partLabel}\n${body}${tail}`, link, hashtags);
    const r = await sendXPostEmail({
      slot,
      kindLabel: kind.label,
      title: shownTitle,
      postText,
      linkUrl: link.url,
      imageUrl: null,
      seriesLabel: `${part}/3`,
    });
    if (!r.ok) {
      await revert();
      return { kind: kind.label, title: shownTitle, ok: false, error: r.error };
    }
    if (isFinal) await supabaseForAutoPost.from("x_series_progress").delete().eq("id", progressId);
    return { kind: kind.label, title: `${shownTitle}(${part}/3)`, ok: true };
  } catch (e: any) {
    await revert();
    return { kind: "深掘り連載", title: shownTitle, ok: false, error: e?.message ?? String(e) };
  }
}

// ---------- ② 予備: 未送信の古めの記事 ----------

async function findGenericFallbackRow(): Promise<TrendRow | null> {
  const excludeIds = await getInProgressSeriesIds();
  const { data, error } = await supabaseForAutoPost
    .from("market_trends")
    .select(TREND_COLUMNS)
    .is("posted_to_x_at", null)
    .eq("is_theme_article", true)
    .not("title", "like", `${DEEP_DIVE_TITLE_PREFIX}%`)
    .not("title", "like", `${NEW_IPO_INTRO_PREFIX}%`)
    .gte("fetched_at", hoursAgoIso(FALLBACK_FRESH_DAYS * 24))
    .order("fetched_at", { ascending: true })
    .limit(10);
  if (error || !data) return null;
  const fresh = data.filter((r: any) => !excludeIds.includes(r.id));
  return (fresh[0] as TrendRow) ?? null;
}

// ---------- ② 予備: IPO用語ワンポイント(材料が何も無い便の最後の砦。必ず送れる) ----------

function pickGlossaryTerm(slot: AutoPostSlot) {
  const all = TERM_GROUPS.flatMap((g) => g.terms);
  const dayIndex = Math.floor((Date.now() + 9 * 60 * 60 * 1000) / 86400000);
  return all[(dayIndex * 2 + (slot === "morning" ? 0 : 1)) % all.length];
}

async function sendGlossaryPost(slot: AutoPostSlot): Promise<SentItem> {
  const t = pickGlossaryTerm(slot);
  const shownTitle = t.term;
  const kindLabel = "IPO用語ワンポイント";
  const linkUrl = withXUtm(`${SITE_URL}/glossary#${t.id}`, "glossary");
  let body: string;
  try {
    body = await condenseForEmail(`用語: ${t.term}${t.reading ? `(${t.reading})` : ""}\n説明: ${t.def}`, {
      title: `IPO用語ワンポイント(${t.term})`,
      extra:
        "# 補足\nこれはIPO用語の解説投稿です。元の説明に沿って、初心者にも分かる一般的な説明や身近なたとえを補ってよい。ただし、制度の細かい数値や例外など、断定できないことは書かない。",
    });
  } catch {
    // AIが使えない場合は、用語集の説明文をそのまま使う
    body = fitLength(`「${t.term}」という言葉を、聞いたことはありますか?\n\n${t.def}\n\nほかにも気になるIPO用語はありませんか?`);
  }
  const postText = composePost(body, { url: linkUrl, cta: "ほかのIPO用語もこちらで確認できます👇" }, "#IPO #新規上場 #IPO用語 #株式投資");
  const r = await sendXPostEmail({ slot, kindLabel, title: shownTitle, postText, linkUrl });
  return { kind: kindLabel, title: shownTitle, ok: r.ok, error: r.error };
}

// ---------- 本体 ----------

// 同時に走らせる件数を絞りながら実行する(Geminiへの同時リクエストを増やしすぎないため)。
// 関数の実行時間の上限が近づいたら、新しい件には着手しない(未着手の分は未送信のまま残り、次の便で送られる)。
async function runLimited<T>(jobs: (() => Promise<T>)[], limit: number, deadlineMs: number): Promise<T[]> {
  const results: T[] = [];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      if (Date.now() > deadlineMs) return;
      const i = next++;
      results.push(await jobs[i]());
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
  return results;
}

export async function runAutoPost(slot: AutoPostSlot, _opts: { force?: boolean } = {}): Promise<AutoPostOutcome> {
  const started = Date.now();
  const deadline = started + 85 * 1000; // maxDuration(120秒)に余裕を持たせる
  const items: SentItem[] = [];

  // ① 新情報: 承認・再掲ドラフトを先に、続けてマーケットトレンド記事。1件につき1通。
  const [drafts, trends] = await Promise.all([fetchPendingDrafts(), fetchNewTrends()]);
  const jobs: (() => Promise<SentItem | null>)[] = [
    ...drafts.map((d) => () => processDraft(d, slot)),
    ...trends.map((r) => () => processTrend(r, slot)),
  ];
  const done = await runLimited(jobs, 3, deadline);
  for (const r of done) if (r) items.push(r);

  let usedFallback = false;
  const okCount = () => items.filter((i) => i.ok).length;

  // ② 新情報が1通も送れなかった便は、必ず中身のある予備のメールを1通送る
  // (送信に失敗した新情報があった場合は、同じ不具合で予備も失敗しやすいので予備には進まない)
  if (okCount() === 0 && items.length === 0) {
    usedFallback = true;
    const tiers: (() => Promise<SentItem | null>)[] = [
      async () => {
        const s = await findInProgressSeries();
        return s ? await sendSeriesPart(s.marketTrendId, s.nextPart, slot, s.progressId) : null;
      },
      async () => {
        const row = await findDeepDiveRowToStart();
        if (!row) return null;
        const progressId = await startSeries(row.id);
        return await sendSeriesPart(row.id, 1, slot, progressId);
      },
      async () => {
        const row = await findGenericFallbackRow();
        return row ? await processTrend(row, slot) : null;
      },
      async () => await sendGlossaryPost(slot),
    ];
    for (const tier of tiers) {
      try {
        const item = await tier();
        if (!item) continue;
        items.push(item);
        if (item.ok) break;
      } catch (e: any) {
        console.error("予備メールの送信でエラー:", e);
      }
    }
  }

  const failed = items.filter((i) => !i.ok);
  if (failed.length > 0) {
    // 送れなかった原稿があれば、理由をまとめて1通だけ知らせる(送信済みの記録は元に戻してあるので、次の便で再送される)
    await notifyAdmin(
      `X投稿メール: 送信できなかった原稿(${failed.length}件)`,
      failed.map((f) => `・${f.kind}｜${f.title}\n  理由: ${f.error ?? "不明"}`).join("\n") +
        "\n\n次の便(朝6時/夕16時)で自動的にもう一度送ります。続く場合はVercelのFunction Logsを確認してください。",
      "warn"
    ).catch(() => {});
  }

  const sent = okCount();
  return {
    sent,
    failed: failed.length,
    items,
    usedFallback,
    reason: sent === 0 && failed.length === 0 ? "送れる原稿がありませんでした" : undefined,
  };
}
