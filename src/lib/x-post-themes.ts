import { generateWithGemini } from "./gemini";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { parseYenToOku } from "./ipo-revenue-chart";
import { fetchCompetitorFinancials } from "./competitor-financials";

// 2026/9/2追加: 「②経済指標・イベント速報」テーマで、economic_eventsテーブルに
// 実績値が保存されていない(日付・種類・ラベルのみ)ため、Claude Haiku + web検索で
// 実際の発表結果を調べる。src/app/api/cron/market-snapshot/route.ts や
// src/app/api/market/route.ts のSTEP2と同じ「Haiku+web_search」パターンを再利用している
// (新たな課金要素ではない)。
const anthropicForThemes = new Anthropic();

const STYLE_GUIDE = `
# 文体ルール(厳守)
- 「です・ます」「である」調は使わない。体言止め・IR速報風のレポート様式で統一する
- タイトル・見出し・箇条書きには番号や記号(▼①②③・など)を付けて項目立てする
- 絵文字マーカー(📣📝▼など)を要所に使う
- 意味段落のまとまりごとに改行・一行空けを入れ、詰め込みすぎない
- - 全体で1000〜1500文字程度で、背景・根拠・数値・今後の見通しまで具体的に書き込む
- URLは含めない
- 見本のイメージ:「6273 SMC [決算]」→「📣半導体需要回復で大幅増収増益」→「📝売上高2,709億円(+35.4%)」のような形式
`;

export interface ThemedPostResult {
  content: string;
  sourceLinks: { title: string; url: string; source: string }[];
}

const supabaseForThemes = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// テーマ: IPOカレンダー(自社DB由来)
export async function generateIpoCalendarPost(): Promise<ThemedPostResult | null> {
  const today = new Date();
  const twoWeeksLater = new Date();
  twoWeeksLater.setDate(today.getDate() + 14);

  const { data, error } = await supabaseForThemes
    .from("ipo_companies")
    .select("id, ticker, name, exchange, sector, biz_type, listing_date, price_range_min, price_range_max")
    .gte("listing_date", today.toISOString().split("T")[0])
    .lte("listing_date", twoWeeksLater.toISOString().split("T")[0])
    .order("listing_date", { ascending: true });

  if (error || !data || data.length === 0) {
    console.error("IPOカレンダー取得失敗またはデータなし:", error);
    return null;
  }

  const listBlock = data
    .map((c) => {
      const price =
        c.price_range_min && c.price_range_max
          ? `想定価格帯${c.price_range_min}〜${c.price_range_max}円`
          : "価格未定";
      return `- ${c.name}(${c.ticker || "コード未定"}・${c.exchange || ""}・${c.sector || c.biz_type || "業種不明"}) 上場日:${c.listing_date} ${price}`;
    })
    .join("\n");

  const prompt = `
あなたは日本の個人投資家向けメディアの編集者です。以下は今後2週間以内に上場予定のIPO銘柄一覧です。この情報をもとに、X(旧Twitter)投稿を1本作成してください。

# 今後のIPOカレンダー
${listBlock}

# 記載構成のルール(重要・無料公開する内容を絞り込むため必ず守ること)
- 会社概要や直近の業績(実績・予想)、注目ポイントなど、事実として分かっている情報は具体的に書いてよい
- ただし「成長ドライバー・強み」にあたる部分と「投資判断のポイント・懸念点」にあたる部分は、それぞれ一言(1文)だけに留めること。理由や具体的な数値、複数の論点を並べて詳しく説明しないこと
- この2箇所は、読んだ人が「もっと詳しく知りたい」と感じる、興味を引く書き方(フック)にすること。結論や詳細な分析そのものは書かず、続きは分析レポートページで読めることを示唆するに留めること
- 対象銘柄が複数ある場合も、銘柄ごとに同じ考え方で簡潔にまとめること

${STYLE_GUIDE}
- 投稿の最後に「さらに詳しい分析は、プロフィール欄のリンクから特設ページでご覧いただけます」といった一文を必ず加え、分析レポートページへ誘導してください

投稿文のみを出力してください。前置きや説明は不要です。
`;

  const content = await generateWithGemini(prompt);
  const sourceLinks = data.map((c: any) => ({
    title: c.name,
    url: `https://ipo.finance-tower.com/analysis/${c.id}`,
    source: "自社DB",
  }));
  return { content, sourceLinks };
}

// テーマ: 週内の重要経済指標カレンダー(自社DB由来)
export async function generateEconomicCalendarPost(): Promise<ThemedPostResult | null> {
  const today = new Date();
  const oneWeekLater = new Date();
  oneWeekLater.setDate(today.getDate() + 7);

  const { data, error } = await supabaseForThemes
    .from("economic_events")
    .select("event_date, event_type, label")
    .gte("event_date", today.toISOString().split("T")[0])
    .lte("event_date", oneWeekLater.toISOString().split("T")[0])
    .order("event_date", { ascending: true });

  if (error || !data || data.length === 0) {
    console.error("経済指標カレンダー取得失敗またはデータなし:", error);
    return null;
  }

  const listBlock = data
    .map((e) => `- ${e.event_date} ${e.event_type}:${e.label}`)
    .join("\n");

  const prompt = `
あなたは日本の個人投資家向けメディアの編集者です。以下は今週(7日以内)に予定されている重要経済指標・イベントの一覧です。この情報をもとに、X(旧Twitter)投稿を1本作成してください。

# 今週の経済指標カレンダー
${listBlock}

# 記載のポイント
- 各イベントが株式相場にどう影響しうるか、一般的な知識をもとに一言添えてください(記載のない詳細な数値予想などは書かないこと)
- 個人投資家が「今週、何に注目すればいいか」がひと目で分かるようにしてください

${STYLE_GUIDE}

投稿文のみを出力してください。前置きや説明は不要です。
`;

  const content = await generateWithGemini(prompt);
  const sourceLinks: { title: string; url: string; source: string }[] = [];
  return { content, sourceLinks };
}

// テーマ: 直近承認銘柄のスコア傾向分析(自社DB由来)
// 直近2週間にAI分析が完了したIPO銘柄のスコアを集計する。
// このアプリ独自の分析データベースがないと書けない記事にするのが狙い。
export async function generateScoreTrendPost(): Promise<ThemedPostResult | null> {
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  const { data, error } = await supabaseForThemes
    .from("ipo_companies")
    .select("id, name, sector, listing_date, created_at, analysis_summary")
    .gte("created_at", twoWeeksAgo.toISOString())
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.error("スコア傾向分析: 取得失敗", error);
    return null;
  }

  const scored = data
    .map((c: any) => ({
      id: c.id,
      name: c.name,
      sector: c.sector || "業種不明",
      listingDate: c.listing_date,
      totalScore: c.analysis_summary?.total_score,
      grade: c.analysis_summary?.grade,
    }))
    .filter((c) => typeof c.totalScore === "number");

  if (scored.length === 0) return null;

  const avg = Math.round(scored.reduce((s, c) => s + c.totalScore, 0) / scored.length);
  const sorted = [...scored].sort((a, b) => b.totalScore - a.totalScore);
  const top3 = sorted.slice(0, 3);

  const sectorCount: Record<string, number> = {};
  scored.forEach((c) => {
    sectorCount[c.sector] = (sectorCount[c.sector] ?? 0) + 1;
  });
  const topSectorEntry = Object.entries(sectorCount).sort((a, b) => b[1] - a[1])[0];

  const listBlock = scored
    .map((c) => `- ${c.name}(${c.sector}) ${c.totalScore}点・${c.grade}グレード・上場日:${c.listingDate || "未定"}`)
    .join("\n");

  const prompt = `
あなたは日本のIPO投資アナリストです。以下は直近2週間にAI分析が完了したIPO銘柄と、そのスコア(100点満点)・グレード(A〜E)の一覧です。この一覧をもとに、個人投資家向けのX(旧Twitter)投稿を1本作成してください。

# 直近のIPO銘柄スコア一覧(${scored.length}銘柄、平均${avg}点)
${listBlock}

# 記載のポイント
- 全体の平均スコア・スコア分布の傾向に触れること
- 特に評価が高い銘柄を具体的に挙げ、理由(業種や特徴)を一言添えること(一覧にない情報を憶測で追加しないこと)
- 業種別の傾向があれば触れること(例:${topSectorEntry ? topSectorEntry[0] : "特定業種"}が${topSectorEntry ? topSectorEntry[1] : ""}件で最多、など)
- 最後に、個人投資家として次に何を確認すべきか一言添えること

${STYLE_GUIDE}

投稿文のみを出力してください。前置きや説明は不要です。
`;

  const content = await generateWithGemini(prompt);
  const sourceLinks = top3.map((c) => ({
    title: c.name,
    url: `https://ipo.finance-tower.com/analysis/${c.id}`,
    source: "自社分析",
  }));

  return { content, sourceLinks };
}

// テーマ: ロックアップ解除カレンダー(自社DB由来)
// 上場前からの株主(VC・大株主など)が株式を売却できるようになる「ロックアップ解除日」が
// 今後30日以内に来る銘柄を一覧化する。個人投資家が自分では追いにくい情報。
export async function generateLockupCalendarPost(): Promise<ThemedPostResult | null> {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const in30Days = new Date();
  in30Days.setDate(today.getDate() + 30);
  const in30Str = in30Days.toISOString().slice(0, 10);

  const { data, error } = await supabaseForThemes
    .from("ipo_companies")
    .select("id, name, ticker, exchange, sector, listing_date, lockup_90_date, lockup_180_date, structured_data");

  if (error || !data) {
    console.error("ロックアップ解除カレンダー: 取得失敗", error);
    return null;
  }

  type LockupEvent = {
    id: string;
    name: string;
    sector: string;
    date: string;
    label: string;
    targets: string;
    floatRatio: string;
  };
  const events: LockupEvent[] = [];
  data.forEach((c: any) => {
    const targets = c.structured_data?.ipo_details?.lockup_targets || "不明";
    const floatRatio = c.structured_data?.ipo_details?.float_ratio || "不明";
    if (c.lockup_90_date && c.lockup_90_date >= todayStr && c.lockup_90_date <= in30Str) {
      events.push({ id: c.id, name: c.name, sector: c.sector || "業種不明", date: c.lockup_90_date, label: "90日ロックアップ", targets, floatRatio });
    }
    if (c.lockup_180_date && c.lockup_180_date >= todayStr && c.lockup_180_date <= in30Str) {
      events.push({ id: c.id, name: c.name, sector: c.sector || "業種不明", date: c.lockup_180_date, label: "180日ロックアップ", targets, floatRatio });
    }
  });

  if (events.length === 0) return null;
  events.sort((a, b) => a.date.localeCompare(b.date));

  const listBlock = events
    .map((e) => `- ${e.date} ${e.name}(${e.sector}) ${e.label}解除 対象:${e.targets} 流通比率:${e.floatRatio}`)
    .join("\n");

  const prompt = `
あなたは日本の個人投資家向けメディアの編集者です。以下は今後30日以内にロックアップ解除(上場前からの株主が株式を売却できるようになる日)を迎えるIPO銘柄の一覧です。この情報をもとに、X(旧Twitter)投稿を1本作成してください。

# 直近のロックアップ解除カレンダー
${listBlock}

# 記載のポイント
- ロックアップ解除が個人投資家にとってなぜ重要か(需給悪化=売り圧力増加の可能性)を簡潔に説明すること
- 対象株主(VC・大株主など)や流通比率の情報がある銘柄は、売り圧力の大きさの目安として触れること
- 一覧にない情報を憶測で追加しないこと
- 特に注意すべき銘柄を1〜2つ挙げること

${STYLE_GUIDE}

投稿文のみを出力してください。前置きや説明は不要です。
`;

  const content = await generateWithGemini(prompt);
  const sourceLinks = events.map((e) => ({
    title: e.name,
    url: `https://ipo.finance-tower.com/analysis/${e.id}`,
    source: "自社分析",
  }));

  return { content, sourceLinks };
}

// 2026/9/2追記: 「大株主・VC/PEの異動ウォッチ」(EDINET大量保有報告書ベース)テーマは、
// ユーザーの意向により廃止した(記事・カテゴリーとも今後は生成しない)。
// 旧実装(fetchEdinetDocumentsForThemes・generateShareholderMovementPosts)は削除済み。
// 既存の記事はSupabase側でSQL削除する運用とし、コード側では二度と生成しない。

// ===== ここから2026/9/2追加: 「初値・その後の値動き」答え合わせテーマ =====
// ユーザー要望: 上場2日目(初日は寄らない日があるため)・10日目・1ヶ月後の3チェックポイントで、
// 事前のAI分析(超短期軸・短期軸)と実際の値動きを突き合わせる記事を1日1回生成する。
// 該当する銘柄・チェックポイントが無い日は、下記の generateInvestingTipPost()(IPO投資
// ワンポイント講座)で埋める設計(呼び出し元 src/app/api/cron/generate-x-drafts/route.ts 側で
// ①が無ければ③、というフォールバック制御を行う)。
//
// 株価取得は、既存の初値取得cron(src/app/api/cron/detect-ipo-price/route.ts)と同じく
// Yahoo FinanceのチャートAPI(無料・無認証)を使う。ただしこちらは「対象日以降で最初に
// ついた終値」を取りたいため、直近5日固定ではなく直近3ヶ月分を取得し、対象日以降の
// 最初の取引日を探す専用の関数として実装している(既存のfetchStockPrice()とは別物)。
async function fetchPriceOnOrAfter(ticker: string, targetDateStr: string): Promise<{ price: number; date: string } | null> {
  const symbol = `${ticker}.T`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=3mo`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const timestamps: number[] = result.timestamp ?? [];
    const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
    const targetMs = new Date(`${targetDateStr}T00:00:00+09:00`).getTime();
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] == null) continue;
      const tradingMs = timestamps[i] * 1000;
      if (tradingMs >= targetMs) {
        return { price: Math.round(closes[i]!), date: new Date(tradingMs).toISOString().slice(0, 10) };
      }
    }
    return null; // 対象日以降の取引データがまだ無い(対象日をまだ迎えていない可能性が高い)
  } catch {
    return null;
  }
}

type CheckpointKey = "day2" | "day10" | "month1";

const CHECKPOINT_META: Record<CheckpointKey, { label: string; axisLabel: string; isFinal: boolean }> = {
  day2: { label: "上場2日目", axisLabel: "超短期(初値〜当日)", isFinal: true },
  day10: { label: "上場10日目", axisLabel: "短期(1〜3ヶ月)の経過観察", isFinal: false },
  month1: { label: "上場1ヶ月後", axisLabel: "短期(1〜3ヶ月)", isFinal: true },
};
const CHECKPOINT_ORDER: CheckpointKey[] = ["day2", "day10", "month1"];

async function buildPriceCheckpointPost(co: any, key: CheckpointKey, price: number, rate: number | null): Promise<ThemedPostResult> {
  const meta = CHECKPOINT_META[key];
  const summary = co.analysis_summary ?? {};
  const grade = key === "day2" ? summary.ultra_short_grade : summary.short_grade;
  const reason = key === "day2" ? summary.grade_reason?.ultra_short : summary.grade_reason?.short;
  const rateText = rate != null ? `${rate >= 0 ? "+" : ""}${rate}%` : "不明";

  const prompt = `
あなたは日本のIPO投資アナリストです。以下の銘柄について、上場後の実際の値動きと、上場前に自社が出したAI分析を突き合わせた「答え合わせ」記事をX(旧Twitter)投稿として1本作成してください。

# 実績データ
- 銘柄: ${co.name}(${co.ticker ?? ""})
- チェックポイント: ${meta.label}
- 公募価格: ${co.ipo_price ? `${co.ipo_price}円` : "不明"}
- ${meta.label}時点の株価: ${price}円
- 公募価格比: ${rateText}

# 事前のAI分析(上場前に生成したもの)
- ${meta.axisLabel}軸の判定: ${grade ? `${grade}グレード` : "不明"}
- 判定理由: ${reason || "記録なし"}

# 記載のポイント
- 実績(公募価格比${rateText})と、事前のAI判定・理由を両方とも事実として提示すること
- 実績が事前の判定とおおむね一致していそうか、乖離していそうかについて、断定はせず「〜という見方もできそうです」程度の柔らかい言い方で触れること
${meta.isFinal ? "" : "- このチェックポイントは短期軸の判定期間(1〜3ヶ月)の途中経過である旨も一言添えること\n"}- 個別銘柄への売買助言(「買うべき」「今が売り時」等)は一切書かないこと
- 最後に、「この結果は1銘柄の実績であり、AI分析の的中を保証するものではありません」という趣旨の一文を、押し付けがましくない自然な言い回しで必ず入れること

${STYLE_GUIDE}

投稿文のみを出力してください。前置きや説明は不要です。
`;
  const content = await generateWithGemini(prompt);
  return {
    content,
    sourceLinks: [{ title: `${co.name}の詳細分析ページ`, url: `https://ipo.finance-tower.com/analysis/${co.id}`, source: "自社分析" }],
  };
}

export interface PriceCheckpointResult {
  externalId: string;
  companyName: string;
  checkpointLabel: string;
  sector: string;
  result: ThemedPostResult;
}

// テーマ①: 「初値・その後の値動き」答え合わせ(自社DB+Yahoo Financeの株価)
// 上場2日目・10日目・1ヶ月後のいずれか、期日を迎えていてまだ記録していないチェックポイントの
// うち、最も期日の早いものから順に株価取得を試みる。記事生成まで成功した時点でDBの
// チェックポイント欄を確定させる(記事生成に失敗した場合は欄を埋めずに残し、翌日以降の
// cronで同じチェックポイントの記事生成を再試行できるようにするため)。
// 該当・取得できるチェックポイントが無ければnullを返し、呼び出し元で③にフォールバックする。
export async function generatePriceCheckpointPost(): Promise<PriceCheckpointResult | null> {
  const todayJst = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

  const { data: rows, error } = await supabaseForThemes
    .from("ipo_companies")
    .select("id, name, ticker, sector, listing_date, ipo_price, analysis_summary, price_day2, price_day10, price_month1")
    .not("ticker", "is", null)
    .not("analysis_summary", "is", null)
    .lte("listing_date", todayJst);

  if (error || !rows) {
    console.error("価格チェックポイント: 取得失敗", error);
    return null;
  }

  const candidates: { co: any; key: CheckpointKey; targetStr: string }[] = [];
  for (const co of rows) {
    if (!co.listing_date) continue;
    const listing = new Date(`${co.listing_date}T00:00:00+09:00`);
    for (const key of CHECKPOINT_ORDER) {
      if (co[`price_${key}`] != null) continue; // 記録済み。次のチェックポイントへ
      const target = new Date(listing);
      if (key === "day2") target.setDate(target.getDate() + 1);
      if (key === "day10") target.setDate(target.getDate() + 9);
      if (key === "month1") target.setMonth(target.getMonth() + 1);
      const targetStr = target.toISOString().slice(0, 10);
      if (targetStr <= todayJst) candidates.push({ co, key, targetStr });
      break; // この銘柄は最も早い未記録チェックポイントだけを候補にする(順序を飛ばさない)
    }
  }
  candidates.sort((a, b) => a.targetStr.localeCompare(b.targetStr));

  for (const c of candidates) {
    const priceData = await fetchPriceOnOrAfter(c.co.ticker, c.targetStr);
    if (!priceData) continue; // 株価データがまだ無い等。次の候補へ

    const rate = c.co.ipo_price
      ? Math.round(((priceData.price - c.co.ipo_price) / c.co.ipo_price) * 1000) / 10
      : null;

    try {
      const result = await buildPriceCheckpointPost(c.co, c.key, priceData.price, rate);
      const { error: updateError } = await supabaseForThemes
        .from("ipo_companies")
        .update({ [`price_${c.key}`]: priceData.price, [`price_${c.key}_rate`]: rate })
        .eq("id", c.co.id);
      if (updateError) console.error(`価格チェックポイント保存失敗(${c.co.name}/${c.key}):`, updateError.message);

      return {
        externalId: `price-checkpoint-${c.co.id}-${c.key}`,
        companyName: c.co.name,
        checkpointLabel: CHECKPOINT_META[c.key].label,
        sector: c.co.sector || "IPO値動き",
        result,
      };
    } catch (e) {
      console.error(`価格チェックポイント記事生成失敗(${c.co.name}/${c.key}):`, e);
      continue; // 次の候補があれば試す
    }
  }
  return null;
}

// ===== ここから2026/9/2追加: 「IPO投資ワンポイント講座」(①の穴埋め用、毎日必ずネタがある) =====
const INVESTING_TIPS_TOPICS = [
  "ロックアップとは何か、なぜIPO投資で重要なのか",
  "流通株式比率(浮動株比率)の見方",
  "オーバーアロットメント(OA)の仕組み",
  "主幹事証券会社の役割と見るべきポイント",
  "公募価格と初値の違い、なぜズレるのか",
  "目論見書の「事業等のリスク」欄の読み方",
  "グロース市場・スタンダード市場・プライム市場の違い",
  "VC(ベンチャーキャピタル)保有株の売却タイミングと株価への影響",
  "IPOの「仮条件」とはどう決まるのか",
  "赤字IPOの評価ポイント(成長投資か、収益化の遅れか)",
  "PER・PBRなど、IPO銘柄のバリュエーション指標の基礎",
  "IPOにおける「公募」と「売出」の違い",
  "上場承認から上場日までのスケジュールの流れ",
  "IPOにおける「需給」とは何か(株数・流通量が株価に与える影響)",
  "経常利益・営業利益・純利益の違いと、決算で見るべき数字",
];

// 日付(通算日)を使った決定的なローテーションで、DBに問い合わせなくても
// 「最近使ったテーマと被らない」順序で一巡させる(一巡したら最初に戻る)。
function pickTodaysInvestingTip(): string {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000);
  return INVESTING_TIPS_TOPICS[dayOfYear % INVESTING_TIPS_TOPICS.length];
}

// テーマ③: IPO投資ワンポイント講座(自社DB不要、毎日必ず生成できる)
// テーマ①(初値・その後の値動き)が該当なしの日の穴埋め用。
export async function generateInvestingTipPost(): Promise<ThemedPostResult> {
  const topic = pickTodaysInvestingTip();
  const prompt = `
あなたは日本の個人投資家向けメディアの編集者です。以下のテーマについて、IPO投資を始めたばかりの個人投資家向けに、分かりやすい解説記事をX(旧Twitter)投稿として1本作成してください。

# 今日のテーマ
${topic}

# 記載のポイント
- 専門用語は初心者にも分かるように噛み砕いて説明すること
- 抽象的な説明だけでなく、実際のIPO投資でこの視点を持つと何が見抜けるか、具体的に書くこと
- 断定的な投資助言(「買うべき」等)や、特定の銘柄名を名指しすることはしないこと(一般的な知識の解説に徹する)
- 最後に、「当メディアの個別銘柄の分析レポートでは、この観点も含めて銘柄ごとに詳しく解説しています」といった趣旨の一文を添えること

${STYLE_GUIDE}

投稿文のみを出力してください。前置きや説明は不要です。
`;
  const content = await generateWithGemini(prompt);
  return {
    content,
    sourceLinks: [{ title: "IPO投資の基礎知識ガイド", url: "https://ipo.finance-tower.com/ipo-guide", source: "自社ガイド" }],
  };
}

// ===== ここから2026/9/2追加: 3テーマ追加(ロックアップ解除カウントダウン・
// 経済指標イベント速報・IPO企業vs競合の決算比較) =====
// ユーザーからの提案(①②③)を受け、データの実態を確認した上で以下の方針で実装:
// ①ロックアップ解除カウントダウンは既存のlockup_90_date/180_dateをそのまま使える。
// ②economic_eventsには実績値のフィールドが無いため、Haiku+web検索で調べる方式にした。
// ③競合財務データ取得ツール(src/app/api/competitor/route.ts)は手動ボタン専用かつ
//   EDINETの誤ったホスト名バグで壊れていたため、共通関数化(src/lib/competitor-financials.ts)
//   ＋バグ修正＋その場での自動取得、という形にした。

// テーマ: ロックアップ解除カウントダウン解説(自社DB由来)
// 既存の「ロックアップ解除カレンダー」(30日以内の該当銘柄を一覧化するダイジェスト)とは別に、
// こちらは1銘柄にスポットを当てて「あと〇日で解除」という切り口で需給インパクトを解説する。
// 同じイベントを何度も取り上げないよう、銘柄×90日/180日の組み合わせごとに一度だけ生成する
// (external_idで永続的に重複防止。日付キーではない)。
export async function generateLockupCountdownPost(): Promise<{ externalId: string; companyName: string; sector: string; result: ThemedPostResult } | null> {
  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const windowEnd = new Date();
  windowEnd.setDate(windowEnd.getDate() + 45);
  const windowEndStr = windowEnd.toISOString().slice(0, 10);

  const { data: rows, error } = await supabaseForThemes
    .from("ipo_companies")
    .select("id, name, sector, lockup_90_date, lockup_180_date, structured_data");

  if (error || !rows) {
    console.error("ロックアップ解除カウントダウン: 取得失敗", error);
    return null;
  }

  type Candidate = { co: any; type: "90" | "180"; date: string };
  const candidates: Candidate[] = [];
  for (const co of rows) {
    if (co.lockup_90_date && co.lockup_90_date >= todayStr && co.lockup_90_date <= windowEndStr) {
      candidates.push({ co, type: "90", date: co.lockup_90_date });
    }
    if (co.lockup_180_date && co.lockup_180_date >= todayStr && co.lockup_180_date <= windowEndStr) {
      candidates.push({ co, type: "180", date: co.lockup_180_date });
    }
  }
  if (candidates.length === 0) return null;

  const candidateIds = candidates.map(c => `lockup-countdown-${c.co.id}-${c.type}`);
  const { data: existing } = await supabaseForThemes.from("market_trends").select("external_id").in("external_id", candidateIds);
  const existingSet = new Set((existing ?? []).map((r: any) => r.external_id));
  const fresh = candidates.filter(c => !existingSet.has(`lockup-countdown-${c.co.id}-${c.type}`));
  if (fresh.length === 0) return null;

  fresh.sort((a, b) => a.date.localeCompare(b.date));
  const chosen = fresh[0];
  const daysLeft = Math.round(
    (new Date(`${chosen.date}T00:00:00+09:00`).getTime() - new Date(`${todayStr}T00:00:00+09:00`).getTime()) / 86400000
  );

  const targets = chosen.co.structured_data?.ipo_details?.lockup_targets || "不明";
  const floatRatio = chosen.co.structured_data?.ipo_details?.float_ratio || "不明";

  const prompt = `
あなたは日本の個人投資家向けメディアの編集者です。以下のIPO銘柄について、間近に迫ったロックアップ解除(上場前からの株主が株式を売却できるようになる日)をテーマに、X(旧Twitter)投稿を1本作成してください。

# 対象銘柄
${chosen.co.name}(${chosen.co.sector || "業種不明"})
- ロックアップ解除まで: あと${daysLeft}日(${chosen.date}、${chosen.type}日ロックアップ)
- 対象株主: ${targets}
- 流通比率: ${floatRatio}

# 記載のポイント
- ロックアップ解除が個人投資家にとってなぜ重要か(需給悪化=売り圧力増加の可能性)を、この銘柄の具体的な数値(対象株主・流通比率)を交えて解説すること
- 一覧にない情報を憶測で追加しないこと
- 断定的な投資助言は書かないこと

${STYLE_GUIDE}

投稿文のみを出力してください。前置きや説明は不要です。
`;
  const content = await generateWithGemini(prompt);
  return {
    externalId: `lockup-countdown-${chosen.co.id}-${chosen.type}`,
    companyName: chosen.co.name,
    sector: chosen.co.sector || "IPO需給",
    result: {
      content,
      sourceLinks: [{ title: `${chosen.co.name}の詳細分析ページ`, url: `https://ipo.finance-tower.com/analysis/${chosen.co.id}`, source: "自社分析" }],
    },
  };
}

// テーマ: 経済指標・イベント速報(自社DB + AI Web検索)
// economic_eventsテーブルは日付・種類・ラベルのみで実績値を保存していないため、
// Claude Haiku + web_search で実際の発表結果と株式市場への影響を調べてから記事化する。
async function fetchEconEventResult(event: { event_type: string; label: string | null; event_date: string }): Promise<string> {
  const query = `${event.event_type}${event.label ? `「${event.label}」` : ""}(${event.event_date}頃)の実際の発表結果を検索してください。具体的な数値(実績値)、市場予想(コンセンサス)との比較、発表後の株式市場・特に日本の新興市場やグロース株への影響を教えてください。`;
  const res = await anthropicForThemes.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1500,
    tools: [{ type: "web_search_20250305", name: "web_search" } as any],
    messages: [{ role: "user", content: query }],
  });
  return (res.content as any[])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");
}

export async function generateEconEventResultPost(): Promise<{ externalId: string; label: string; sector: string; result: ThemedPostResult } | null> {
  const todayJst = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const fiveDaysAgo = new Date();
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
  const windowStart = fiveDaysAgo.toISOString().slice(0, 10);

  const { data: events, error } = await supabaseForThemes
    .from("economic_events")
    .select("id, event_date, event_type, label")
    .gte("event_date", windowStart)
    .lt("event_date", todayJst) // 今日はまだ結果が出ていない可能性が高いため対象外(前日まで)
    .order("event_date", { ascending: true });

  if (error || !events || events.length === 0) {
    if (error) console.error("経済指標・イベント速報: 取得失敗", error);
    return null;
  }

  const candidateIds = events.map((e: any) => `econ-result-${e.id}`);
  const { data: existing } = await supabaseForThemes.from("market_trends").select("external_id").in("external_id", candidateIds);
  const existingSet = new Set((existing ?? []).map((r: any) => r.external_id));
  const fresh = events.filter((e: any) => !existingSet.has(`econ-result-${e.id}`));
  if (fresh.length === 0) return null;

  const event = fresh[0]; // 日付が古い順の先頭 = 最も早く報じるべきもの(取りこぼし防止で順序を飛ばさない)

  let researchText = "";
  try {
    researchText = await fetchEconEventResult(event);
  } catch (e) {
    console.error("経済指標・イベント速報: web検索失敗", e);
    return null;
  }
  if (!researchText) return null;

  const prompt = `
あなたは日本の個人投資家向けメディアの編集者です。以下は${event.event_date}頃に発表された経済指標・イベントについての調査結果です。この情報をもとに、X(旧Twitter)投稿を1本作成してください。

# イベント
${event.event_type}${event.label ? `「${event.label}」` : ""}(${event.event_date})

# 調査結果
${researchText}

# 記載のポイント
- 実績値・市場予想との比較を、分かっている範囲で具体的に書くこと。分からない場合は無理に数値を作らないこと
- 発表後の株式市場、特に新興市場・グロース株への影響について、一般的な知識をもとに触れること
- 断定的な投資助言は書かないこと

${STYLE_GUIDE}

投稿文のみを出力してください。前置きや説明は不要です。
`;
  const content = await generateWithGemini(prompt);
  return {
    externalId: `econ-result-${event.id}`,
    label: `${event.event_type}${event.label ? `(${event.label})` : ""}`,
    sector: "マクロ経済",
    result: { content, sourceLinks: [] },
  };
}

// テーマ: IPO企業 vs 競合の決算比較(自社DB + EDINET競合財務データ)
// 分析済み銘柄のうち、STEP⑦(市場・競合情報収集)で競合他社が判明している銘柄を対象に、
// 競合の財務データ(EDINET有価証券報告書ベース)と自社の売上・利益(structured_data.key_metrics)を
// 比較する記事を生成する。競合財務データがまだ無い銘柄は、記事生成のタイミングで
// その場で自動取得する(従来の管理画面の手動ボタンに依存しない)。
// 銘柄ごとに一度だけ生成する(external_idで永続的に重複防止)。
export async function generateCompetitorComparisonPost(): Promise<{ externalId: string; companyName: string; sector: string; result: ThemedPostResult } | null> {
  const { data: rows, error } = await supabaseForThemes
    .from("ipo_companies")
    .select("id, name, sector, listing_date, analysis_summary, analysis_market, structured_data")
    .not("analysis_summary", "is", null);

  if (error || !rows) {
    console.error("競合決算比較: 取得失敗", error);
    return null;
  }

  const withCompetitors = rows.filter((c: any) => (c.analysis_market?.competitors?.length ?? 0) > 0);
  if (withCompetitors.length === 0) return null;

  const candidateIds = withCompetitors.map((c: any) => `competitor-comparison-${c.id}`);
  const { data: existing } = await supabaseForThemes.from("market_trends").select("external_id").in("external_id", candidateIds);
  const existingSet = new Set((existing ?? []).map((r: any) => r.external_id));
  const fresh = withCompetitors.filter((c: any) => !existingSet.has(`competitor-comparison-${c.id}`));
  if (fresh.length === 0) return null;

  // 直近に分析した銘柄(=ユーザーの関心が高いはず)を優先する
  fresh.sort((a: any, b: any) => (b.listing_date ?? "").localeCompare(a.listing_date ?? ""));

  // 財務データが1件も取れない銘柄はスキップし、次の候補を試す(EDINET上に情報が無い競合ばかりの場合等)
  for (const co of fresh) {
    let competitorFinancials: any[] = co.analysis_market?.competitor_financials ?? [];
    if (competitorFinancials.length === 0) {
      try {
        competitorFinancials = await fetchCompetitorFinancials(co.id, supabaseForThemes);
      } catch (e) {
        console.error(`競合決算比較: 財務データ取得失敗(${co.name}):`, e);
        continue;
      }
    }
    const validFinancials = (competitorFinancials ?? []).filter((f: any) => !f.error && f.revenue != null);
    if (validFinancials.length === 0) continue;

    const keyMetrics = co.structured_data?.key_metrics;
    const latest = Array.isArray(keyMetrics) && keyMetrics.length > 0 ? keyMetrics[keyMetrics.length - 1] : null;
    const ownRevenueOku = latest ? parseYenToOku(latest.revenue, false) : null;
    const ownProfitOku = latest ? parseYenToOku(latest.ordinary_profit, true) : null;

    const competitorBlock = validFinancials
      .map((f: any) => `- ${f.name}: 売上高${f.revenue}億円・営業利益${f.operating_profit ?? "不明"}億円(${f.fiscal_year || "決算期不明"})`)
      .join("\n");

    const prompt = `
あなたは日本のIPO投資アナリストです。以下の新規上場企業と、その競合他社の財務データを比較し、個人投資家向けのX(旧Twitter)投稿を1本作成してください。

# 対象企業(新規上場)
${co.name}(${co.sector || "業種不明"})
- 直近期売上高: ${ownRevenueOku != null ? `${ownRevenueOku}億円` : "不明"}
- 直近期利益: ${ownProfitOku != null ? `${ownProfitOku}億円` : "不明"}

# 競合他社の財務データ(EDINET・有価証券報告書ベース)
${competitorBlock}

# 記載のポイント
- 売上規模・利益率などの観点で、対象企業が競合他社と比べてどのような位置づけかを事実ベースで書くこと(例:規模では見劣りするが黒字化している、等)
- 数値に無い推測(将来の成長性の断定等)は書かないこと
- 断定的な投資助言は書かないこと

${STYLE_GUIDE}

投稿文のみを出力してください。前置きや説明は不要です。
`;
    try {
      const content = await generateWithGemini(prompt);
      return {
        externalId: `competitor-comparison-${co.id}`,
        companyName: co.name,
        sector: co.sector || "競合比較",
        result: {
          content,
          sourceLinks: [{ title: `${co.name}の詳細分析ページ`, url: `https://ipo.finance-tower.com/analysis/${co.id}`, source: "自社分析" }],
        },
      };
    } catch (e) {
      console.error(`競合決算比較: 記事生成失敗(${co.name}):`, e);
      continue;
    }
  }
  return null;
}

// 2026/9/4追加: テーマ「ビジネスモデル・ストーリー・競合との違い」
// (analysis_deep_dive、src/app/api/deep-dive/route.tsで生成済みのデータを使う)。
// 分析ページ上ではこの3要素を折りたたみ・無料公開の形で載せているが、
// マーケットトレンド用にはさらに短く、X投稿として読み切れる分量(500〜700字程度)に
// 凝縮した版を別途生成する(2026/9/3の相談で決定した方針)。新たなWeb検索・
// EDINET取得は行わず、既に生成済みのanalysis_deep_diveのテキストを要約するのみ
// のため、タイムアウトリスクは低い。
// 3要素すべてが揃っている銘柄のみを対象にする(銘柄ごとに一度だけ・external_idで重複防止)。
const DEEP_DIVE_TREND_STYLE = `
# 文体ルール(厳守)
- ですます調の読み物として書く(IR速報風の体言止めにはしない)
- 「💼儲けの仕組み」「📖上場までのストーリー」「⚖️競合との違い」の3つの見出しを立て、それぞれ2〜3文程度の短い段落でまとめる
- 全体で500〜700文字程度に収めること(元の文章を要約・凝縮すること)
- 「買うべき」「投資すべき」等の断定的な投資助言・煽り文句は書かないこと
- 最後に一行、「くわしくは分析ページで無料公開中です」という趣旨の一文を添えること(URLは含めない)
- URLは含めない
`;

export async function generateDeepDiveTrendPost(): Promise<{ externalId: string; companyName: string; sector: string; result: ThemedPostResult } | null> {
  const { data: rows, error } = await supabaseForThemes
    .from("ipo_companies")
    .select("id, name, sector, listing_date, analysis_deep_dive")
    .not("analysis_deep_dive", "is", null);

  if (error || !rows) {
    console.error("深掘り3要素トレンド: 取得失敗", error);
    return null;
  }

  const complete = rows.filter((c: any) =>
    c.analysis_deep_dive?.business_model && c.analysis_deep_dive?.story && c.analysis_deep_dive?.competitor_diff
  );
  if (complete.length === 0) return null;

  const candidateIds = complete.map((c: any) => `deep-dive-${c.id}`);
  const { data: existing } = await supabaseForThemes.from("market_trends").select("external_id").in("external_id", candidateIds);
  const existingSet = new Set((existing ?? []).map((r: any) => r.external_id));
  const fresh = complete.filter((c: any) => !existingSet.has(`deep-dive-${c.id}`));
  if (fresh.length === 0) return null;

  // 直近に分析した銘柄を優先する
  fresh.sort((a: any, b: any) => (b.listing_date ?? "").localeCompare(a.listing_date ?? ""));
  const co = fresh[0];
  const dd = co.analysis_deep_dive;

  const prompt = `
以下は、新規上場企業「${co.name}」(${co.sector || "業種不明"})について、①ビジネスモデル、②上場までのストーリー、③競合との違い、をそれぞれ解説した文章です。
これを個人投資家向けのX(旧Twitter)投稿1本に要約・凝縮してください。

# ①ビジネスモデル(儲けの仕組み)
${dd.business_model}

# ②上場までのストーリー
${dd.story}

# ③競合との違い
${dd.competitor_diff}

${DEEP_DIVE_TREND_STYLE}

投稿文のみを出力してください。前置きや説明は不要です。
`;
  try {
    const content = await generateWithGemini(prompt);
    return {
      externalId: `deep-dive-${co.id}`,
      companyName: co.name,
      sector: co.sector || "深掘り解説",
      result: {
        content,
        sourceLinks: [{ title: `${co.name}の詳細分析ページ`, url: `https://ipo.finance-tower.com/analysis/${co.id}`, source: "自社分析" }],
      },
    };
  } catch (e) {
    console.error(`深掘り3要素トレンド: 記事生成失敗(${co.name}):`, e);
    return null;
  }
}
