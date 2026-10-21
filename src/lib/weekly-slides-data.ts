// 2026/10/20新設(案2・週刊ブリーフのPDFスライド): スライドに差し込むデータを、DBから組み立てる。
// ・数字・日付・社名・スコアは、すべてDB(ipo_companies)の値をコードで入れる。
// ・AIが書くのは、ひとこと解説(commentary)だけ。数字が元データに無い場合は、その解説を使わず、コードで作った文に差し替える。
// ・公開前の自動チェック(verifySlidesData)で、計算の食い違い・空の項目などを見つける。
import { todayJst, shortDate, jpDate, yen, priceRangeText, pctText } from "@/lib/jp-format";
import { loadBriefData } from "@/lib/weekly-brief";
import { pickTheme } from "@/lib/weekly-slides-themes";
import { isTrustedScore } from "@/lib/score-template";
import { generateWithGemini } from "@/lib/gemini";
import type {
  SlidesData, SlideFeatured, SlideResultRow, SlideScheduleRow, SlideLockupRow,
} from "@/lib/weekly-slides-types";

const AXIS_ORDER = ["float", "lockup", "timing", "valuation", "vc_sell", "growth", "management", "unit_econ", "competitor"];
const AXIS_SHORT: Record<string, string> = {
  float: "需給", lockup: "ロックアップ", timing: "タイミング", valuation: "バリュエ", vc_sell: "VC売圧",
  growth: "成長性", management: "経営陣", unit_econ: "収益性", competitor: "競合",
};
const GRADE_ORDER: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, E: 1 };

const COMPANY_FIELDS =
  "id,name,ticker,exchange,sector,listing_date,listing_date_confirmed,price_range_min,price_range_max,ipo_price,initial_price,price_change_rate,bb_start_date,apply_start_date,lockup_90_date,lockup_180_date,analysis_summary,analysis_axes_short,analysis_axes_mid,analysis_axes_long,analysis_market";

function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// 文章の先頭から、n文までを取り出す(強調記号は外す)
function firstSentences(text: unknown, n: number, max: number): string {
  const t = String(text ?? "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const parts = t.split(/(?<=。)/).filter(Boolean);
  let out = parts.slice(0, n).join("");
  if (out.length > max) {
    const cut = out.slice(0, max);
    const i = cut.lastIndexOf("。");
    out = i > 20 ? cut.slice(0, i + 1) : cut + "…";
  }
  return out;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// 上場前に付けたAI評価だけを使う(上場後に作り直した評価で「当たった」ように見えるのを防ぐ)
function preListingGrade(c: any): { grade: string | null; score: number | null } {
  const s = c.analysis_summary;
  const g = s?.grade ?? null;
  // 点数を作り直した日(rescored_at)があれば、その日を評価の日とする(上場後に採点し直した評価を「上場前の評価」に入れない)
  const at: string | undefined = s?.rescored_at ?? s?.generated_at;
  if (!g || !at || !c.listing_date) return { grade: null, score: null };
  // プロンプトの例の数字のコピーだった評価(2026/10/20に判明した不具合)は使わない
  if (!isTrustedScore(s)) return { grade: null, score: null };
  if (at.slice(0, 10) >= c.listing_date) return { grade: null, score: null };
  return { grade: g, score: typeof s.total_score === "number" ? s.total_score : null };
}

function verdictOf(grade: string | null, rate: number | null): SlideResultRow["verdict"] {
  if (!grade || rate == null) return "-";
  if (grade === "C") return "中立";
  if (grade === "A" || grade === "B") return rate > 0 ? "一致" : "不一致";
  return rate < 0 ? "一致" : "不一致";
}

function buildFeatured(c: any): SlideFeatured {
  const s = c.analysis_summary ?? {};
  const flat: any[] = [
    ...Object.values(c.analysis_axes_short ?? {}),
    ...Object.values(c.analysis_axes_mid ?? {}),
    ...Object.values(c.analysis_axes_long ?? {}),
  ];
  const axes = AXIS_ORDER.map((id) => {
    const f = flat.find((x) => x?.id === id);
    return f && typeof f.score === "number" ? { label: AXIS_SHORT[id], score: Math.max(0, Math.min(100, Math.round(f.score))), raw: f } : null;
  }).filter(Boolean) as { label: string; score: number; raw: any }[];

  let caution: SlideFeatured["caution"] = null;
  const valid = axes.filter((a) => a.score > 0);
  if (valid.length > 0) {
    const low = valid.reduce((m, a) => (a.score < m.score ? a : m));
    caution = {
      title: String(low.raw?.title ?? low.label),
      score: low.score,
      text: firstSentences(low.raw?.verdict || low.raw?.description, 1, 70),
    };
  }

  const insights: any[] = Array.isArray(s.insights) ? s.insights : [];
  const points = insights.slice(0, 2).map((i) => ({
    title: String(i?.title ?? "").trim(),
    text: firstSentences(i?.desc || i?.body || i?.detail, 1, 70),
  })).filter((p) => p.title);

  const range = priceRangeText(c.price_range_min, c.price_range_max);
  const facts: [string, string][] = [];
  if (c.listing_date) facts.push(["上場日", `${jpDate(c.listing_date)}${c.listing_date_confirmed ? "" : "（予定）"}`]);
  if (range) facts.push(["仮条件", range]);
  if (c.ipo_price) facts.push(["公募価格", yen(c.ipo_price)]);
  if (c.bb_start_date) facts.push(["BB開始日", jpDate(c.bb_start_date)]);
  if (c.apply_start_date) facts.push(["申込開始日", jpDate(c.apply_start_date)]);
  const lk: string[] = [];
  if (c.lockup_90_date) lk.push(`90日：${jpDate(c.lockup_90_date)}`);
  if (c.lockup_180_date) lk.push(`180日：${jpDate(c.lockup_180_date)}`);
  if (lk.length) facts.push(["ロックアップ解除", lk.join(" ／ ")]);
  const uw = c.analysis_market?.lead_underwriter;
  if (uw) facts.push(["主幹事", String(uw)]);

  return {
    name: c.name, ticker: c.ticker ?? null, exchange: c.exchange ?? null, sector: c.sector ?? null,
    grade: s.grade ?? null, score: typeof s.total_score === "number" ? s.total_score : null,
    ultra: s.ultra_short_grade ?? null, short: s.short_grade ?? null, long: s.long_grade ?? null,
    facts, summary: firstSentences(s.summary, 2, 150),
    axes: axes.map(({ label, score }) => ({ label, score })),
    points, caution,
  };
}

export async function loadSlidesData(supabase: any): Promise<SlidesData> {
  const brief = await loadBriefData(supabase);
  const today = brief.today;
  const sel = (q: any) => q.select(COMPANY_FIELDS);

  // 直近の地合い(上場済みで公募価格比がある直近12社)
  const marketQ = await sel(supabase.from("ipo_companies"))
    .not("price_change_rate", "is", null).lte("listing_date", today)
    .order("listing_date", { ascending: false }).limit(12);
  const marketRows: any[] = marketQ.data ?? [];
  const rates = marketRows.map((c) => Number(c.price_change_rate)).filter((n) => Number.isFinite(n));
  const market = {
    items: marketRows.filter((c) => Number.isFinite(Number(c.price_change_rate))).map((c) => ({ name: c.name as string, value: Number(c.price_change_rate), date: c.listing_date as string })),
    avg: rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null,
    median: median(rates),
    up: rates.filter((r) => r > 0).length,
    n: rates.length,
  };

  // 答え合わせ(直近4週間に上場した銘柄のうち、上場前のAI評価があるもの)
  const checkQ = await sel(supabase.from("ipo_companies"))
    .not("price_change_rate", "is", null).gte("listing_date", addDays(today, -28)).lte("listing_date", today)
    .order("listing_date", { ascending: false });
  const toRow = (c: any): SlideResultRow => {
    const g = preListingGrade(c);
    const rate = c.price_change_rate != null && Number.isFinite(Number(c.price_change_rate)) ? Number(c.price_change_rate) : null;
    return {
      name: c.name, ticker: c.ticker ?? null, listing_date: c.listing_date,
      ipo_price: c.ipo_price ?? null, initial_price: c.initial_price ?? null, rate,
      grade: g.grade, score: g.score, verdict: verdictOf(g.grade, rate),
    };
  };
  const check = ((checkQ.data ?? []) as any[]).map(toRow).filter((r) => r.grade);
  const results = brief.results.map((c) => toRow(c));

  // 申込スケジュール(来週と再来週に、BB開始または申込開始がある銘柄)
  const from = brief.nextMon, to = addDays(brief.nextMon, 13);
  const [bbQ, apQ] = await Promise.all([
    sel(supabase.from("ipo_companies")).gte("bb_start_date", from).lte("bb_start_date", to),
    sel(supabase.from("ipo_companies")).gte("apply_start_date", from).lte("apply_start_date", to),
  ]);
  const schedMap = new Map<string, any>();
  [...(bbQ.data ?? []), ...(apQ.data ?? [])].forEach((c: any) => schedMap.set(c.id, c));
  const schedule: SlideScheduleRow[] = [...schedMap.values()]
    .sort((a, b) => String(a.bb_start_date ?? a.apply_start_date).localeCompare(String(b.bb_start_date ?? b.apply_start_date)))
    .map((c) => ({
      name: c.name, ticker: c.ticker ?? null, exchange: c.exchange ?? null,
      range: priceRangeText(c.price_range_min, c.price_range_max), ipo_price: yen(c.ipo_price) || "-",
      bb: shortDate(c.bb_start_date), apply: shortDate(c.apply_start_date), listing: shortDate(c.listing_date),
    }));

  // ロックアップ解除(今後30日)
  const lockTo = addDays(today, 30);
  const [l90, l180] = await Promise.all([
    sel(supabase.from("ipo_companies")).gte("lockup_90_date", today).lte("lockup_90_date", lockTo),
    sel(supabase.from("ipo_companies")).gte("lockup_180_date", today).lte("lockup_180_date", lockTo),
  ]);
  const lockups: SlideLockupRow[] = [
    ...((l90.data ?? []) as any[]).map((c) => ({ c, kind: "90日", d: c.lockup_90_date as string })),
    ...((l180.data ?? []) as any[]).map((c) => ({ c, kind: "180日", d: c.lockup_180_date as string })),
  ].sort((a, b) => a.d.localeCompare(b.d)).map(({ c, kind, d }) => ({
    name: c.name, ticker: c.ticker ?? null, kind, date: shortDate(d), listing: shortDate(c.listing_date),
  }));

  // 注目銘柄(来週に上場・BB開始・申込開始があり、分析がある銘柄のうち、AI評価の高い順に最大3社)
  const coreIds = Array.from(new Set(brief.events.filter((e) => ["上場日", "BB開始", "申込開始"].includes(e.label)).map((e) => e.company.id)));
  let featured: SlideFeatured[] = [];
  if (coreIds.length > 0) {
    const fq = await sel(supabase.from("ipo_companies")).in("id", coreIds);
    const rows = ((fq.data ?? []) as any[]).filter((c) => c.analysis_summary?.grade);
    rows.sort((a, b) =>
      (GRADE_ORDER[b.analysis_summary.grade] ?? 0) - (GRADE_ORDER[a.analysis_summary.grade] ?? 0) ||
      (Number(b.analysis_summary.total_score) || 0) - (Number(a.analysis_summary.total_score) || 0));
    featured = rows.slice(0, 3).map(buildFeatured);
  }

  const count = (label: string) => new Set(brief.events.filter((e) => e.label.startsWith(label)).map((e) => e.company.id)).size;
  const friDay = Number(brief.thisFri.slice(8, 10));
  const issueLabel = `${brief.thisFri.slice(0, 4)}年${Number(brief.thisFri.slice(5, 7))}月 第${Math.ceil(friDay / 7)}週号`;

  const data: SlidesData = {
    issueLabel, asOf: todayJst(),
    thisMon: brief.thisMon, thisFri: brief.thisFri, nextMon: brief.nextMon, nextSun: brief.nextSun,
    points: brief.points,
    counts: { listing: count("上場"), bb: count("BB"), apply: count("申込"), lockup: count("ロックアップ") },
    events: brief.events.map((e) => ({ date: e.date, label: e.label, color: e.color, name: e.company.name, ticker: e.company.ticker })),
    market, results, check, schedule, lockups, featured,
    theme: pickTheme(brief.thisMon),
    commentary: {},
  };
  data.commentary = await buildCommentary(data);
  return data;
}

// ───────── ひとこと解説(AIが書く部分)。数字は元データと照合する ─────────
function allowedNumbers(data: unknown): Set<string> {
  const set = new Set<string>();
  const addTokens = (str: string) => (str.match(/\d+(?:\.\d+)?/g) ?? []).forEach((t) => set.add(t));
  const walk = (v: any) => {
    if (v == null) return;
    if (typeof v === "number" && Number.isFinite(v)) {
      set.add(String(v)); set.add(v.toFixed(1)); set.add(String(Math.round(v))); set.add(String(Math.abs(v)));
      set.add(Math.abs(v).toFixed(1)); set.add(String(Math.abs(Math.round(v))));
    } else if (typeof v === "string") addTokens(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(data);
  return set;
}

const BANNED = /確実|必ず|絶対|最高|最大|圧倒|買うべき|売るべき|おすすめ|お勧め|間違いなく|儲か|稼げ/;

export function validateCommentary(text: string, allowed: Set<string>): boolean {
  const t = text.trim();
  if (!t || t.length > 100) return false;
  if (BANNED.test(t)) return false;
  if (/未定|不明/.test(t)) return false;
  for (const sentence of t.split("。")) if ((sentence.match(/、/g) ?? []).length > 1) return false;
  for (const tok of t.match(/\d+(?:\.\d+)?/g) ?? []) if (!allowed.has(tok)) return false;
  return true;
}

async function buildCommentary(d: SlidesData): Promise<SlidesData["commentary"]> {
  const fallback: SlidesData["commentary"] = {};
  if (d.market.n > 0 && d.market.avg != null) {
    fallback.market = `直近${d.market.n}社の公募価格比の平均は${pctText(d.market.avg)}で、${d.market.up}社が公募価格を上回りました。`;
  }
  fallback.outlook = d.counts.listing > 0 ? `来週は${d.counts.listing}社が上場を予定しています。` : "来週に上場を予定している銘柄は、登録されていません。";
  fallback.check = d.check.length > 0 && d.check.length < 6 ? "件数が少ないため、傾向を示すものではありません。" : "";

  if (d.market.n === 0 || !process.env.GEMINI_API_KEY) return fallback;
  try {
    const facts = {
      直近の初値: { 社数: d.market.n, 公募価格比の平均: pctText(d.market.avg), 中央値: pctText(d.market.median), 公募価格を上回った社数: d.market.up },
      来週: { 上場: d.counts.listing, BB開始: d.counts.bb, 申込開始: d.counts.apply, ロックアップ解除: d.counts.lockup },
    };
    const prompt = `
あなたは、日本の個人投資家向けIPO分析サイトの編集者です。週刊スライドの「ひとこと解説」を2つ書いてください。

# 事実(この数字だけを使う)
${JSON.stringify(facts, null, 1)}

# 出力(JSONのみ。前置きや説明は不要)
{"market":"直近の地合いについての解説(80文字以内)","outlook":"来週の予定についての解説(60文字以内)"}

# ルール(厳守)
- 事実にある数字だけを使う。事実にない数字・社名・日付は書かない
- 「です・ます」調。一文の中の読点「、」は1つまで
- 「確実」「必ず」「絶対」「最高」「最大」など、断定・最上級の表現は使わない
- 売買の助言(「買うべき」「売るべき」「おすすめ」等)は書かない
- 「未定」「不明」という言葉は使わない
`;
    const raw = await generateWithGemini(prompt);
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return fallback;
    const parsed = JSON.parse(m[0]);
    const allowed = allowedNumbers({ facts, d: { counts: d.counts, market: d.market } });
    const out = { ...fallback };
    if (typeof parsed.market === "string" && validateCommentary(parsed.market, allowed)) out.market = parsed.market.trim();
    if (typeof parsed.outlook === "string" && validateCommentary(parsed.outlook, allowed)) out.outlook = parsed.outlook.trim();
    return out;
  } catch (e) {
    console.error("スライドのひとこと解説の生成に失敗(コードで作った文を使います):", e);
    return fallback;
  }
}

// ───────── 公開前の自動チェック ─────────
export interface SlidesCheckResult { ok: boolean; issues: string[] }

export function verifySlidesData(d: SlidesData): SlidesCheckResult {
  const issues: string[] = [];
  if (d.points.length === 0) issues.push("今週の要点が空です");

  // 公募価格比が、公募価格と初値からの計算と合っているか
  const checkRate = (name: string, ipo: number | null, ini: number | null, rate: number | null) => {
    if (ipo != null && ini != null && rate != null && ipo > 0) {
      const calc = (ini / ipo - 1) * 100;
      if (Math.abs(calc - rate) > 0.3) issues.push(`${name}: 公募価格比が計算と合いません(登録値${rate}% / 計算値${calc.toFixed(1)}%)`);
    }
  };
  d.check.forEach((r) => checkRate(r.name, r.ipo_price, r.initial_price, r.rate));
  d.results.forEach((r) => checkRate(r.name, r.ipo_price, r.initial_price, r.rate));

  // 来週の予定が、対象の週に入っているか
  d.events.forEach((e) => {
    if (e.date < d.nextMon || e.date > d.nextSun) issues.push(`${e.name}: 予定日(${e.date})が来週の範囲外です`);
  });

  // 注目銘柄の中身
  d.featured.forEach((f) => {
    if (!f.grade || f.score == null) issues.push(`${f.name}: AI評価が空です`);
    if (f.axes.length < 9) issues.push(`${f.name}: 9軸のスコアが${f.axes.length}件しかありません`);
    if (f.points.length === 0) issues.push(`${f.name}: 注目点が空です`);
  });
  if (d.featured.length === 0) issues.push("注目銘柄がありません(来週に分析済みの銘柄が無い場合は、正常なこともあります)");

  // 「undefined」「NaN」が文字として入っていないか
  let bad = false;
  const walk = (v: unknown) => {
    if (typeof v === "string") { if (/\bundefined\b|\bNaN\b|\bnull\b/.test(v)) bad = true; }
    else if (typeof v === "number") { if (!Number.isFinite(v)) bad = true; }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(d);
  if (bad) issues.push("データに undefined・NaN・null の文字、または数値でない値が含まれています");

  // 初値のある銘柄が、まだ上場していない日付になっていないか
  d.check.forEach((r) => { if (r.listing_date > d.asOf) issues.push(`${r.name}: 上場日が未来なのに初値があります`); });

  return { ok: issues.length === 0, issues };
}

export { shortDate };
