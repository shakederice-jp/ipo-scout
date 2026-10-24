// 2026/10/21改訂(週刊PDFスライド・第2版): スライドに差し込むデータを、DBから組み立てる。
// 方針:
//  ・結論 → 根拠の順。結論の一文は、すべてコード(ルール)で作る。AIには書かせない(数字の誤りや断定語を防ぐため)。
//  ・数字・日付・社名・スコアは、DB(ipo_companies)の値をそのまま使う。
//  ・AI評価は「信頼できる評価」(例の数字のコピーでないもの)だけを出す(src/lib/score-template.ts)。
//  ・過去の初値の実績(同じ市場・主幹事・業種)は、自社DBの上場済み銘柄から集計する。
import { todayJst, shortDate, jpDate, yen, priceRangeText, pctText } from "@/lib/jp-format";
import { loadBriefData } from "@/lib/weekly-brief";
import { isTrustedScore, gradeFromScore } from "@/lib/score-template";
import { buildRevenueChartData, parseYenToOku } from "@/lib/ipo-revenue-chart";
import type {
  SlidesData, CompanyCard, CompStat, Holder, GanttRow, RankRow, Tone, TrackPoint,
} from "@/lib/weekly-slides-types";

const AXIS_ORDER = ["float", "lockup", "timing", "valuation", "vc_sell", "growth", "management", "unit_econ", "competitor"];
const AXIS_SHORT: Record<string, string> = {
  float: "需給", lockup: "ロックアップ", timing: "タイミング", valuation: "バリュエ", vc_sell: "VC売圧",
  growth: "成長性", management: "経営陣", unit_econ: "収益性", competitor: "競合",
};
const STRONG: Record<string, string> = {
  float: "需給が良好", lockup: "ロックアップが手厚く", timing: "上場のタイミングが追い風", valuation: "価格に割安感",
  vc_sell: "VCの売り圧力が小さく", growth: "成長性が強み", management: "経営陣の評価が高く", unit_econ: "収益性が高く", competitor: "競合環境が良好",
};
const WEAK: Record<string, string> = {
  float: "需給に懸念", lockup: "ロックアップが弱め", timing: "上場のタイミングが逆風", valuation: "価格が割高",
  vc_sell: "VCの売り圧力が重い", growth: "成長性に課題", management: "経営陣に不安", unit_econ: "収益性に課題", competitor: "競合が厳しい",
};
const GRADE_ORDER: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, E: 1 };
const GRADE_LABEL: Record<string, string> = { A: "強気", B: "やや強気", C: "中立", D: "やや弱気", E: "弱気" };
const COLORS = { listing: "#15803d", bb: "#0369a1", apply: "#d97706" };

const COMPANY_FIELDS =
  "id,name,ticker,exchange,sector,biz_type,listing_date,listing_date_confirmed,price_range_min,price_range_max,ipo_price,bb_start_date,apply_start_date,lockup_90_date,lockup_180_date,analysis_summary,analysis_market,structured_data";
const LITE_FIELDS =
  "id,name,ticker,exchange,listing_date,listing_date_confirmed,price_range_min,price_range_max,ipo_price,bb_start_date,apply_start_date";

function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function firstSentences(text: unknown, n: number, max: number): string {
  const t = String(text ?? "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const parts = t.split(/(?<=。)/).filter(Boolean);
  let out = parts.slice(0, n).join("");
  if (out.length > max) {
    const cut = out.slice(0, max);
    const i = cut.lastIndexOf("。");
    out = i > 15 ? cut.slice(0, i + 1) : cut + "…";
  }
  return out;
}

const num = (v: unknown): number | null => { const n = Number(v); return v != null && v !== "" && Number.isFinite(n) ? n : null; };
const r1 = (n: number) => Math.round(n * 10) / 10;

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// "43.9%" "推定20%程度" → 数値
function parsePct(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const m = raw.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*[%％]/);
  return m ? Number(m[1]) : null;
}
// "公募100,000株・売出1,200,000株" から、キーワードの直後の株数を取り出す(構造化の処理と同じ考え方)
function parseShares(text: unknown, keyword?: string): number | null {
  if (typeof text !== "string" || !text) return null;
  const re = keyword ? new RegExp(keyword + "[^0-9]{0,5}([0-9,]+)\\s*株") : /([0-9,]+)\s*株/;
  const m = text.match(re);
  return m ? parseInt(m[1].replace(/,/g, ""), 10) : null;
}

// ───────── 過去の初値の実績(自社DB) ─────────
interface PoolRow {
  id: string; name: string; exchange: string | null; sector: string | null; date: string; rate: number;
  uw: string[]; grade: string | null; total: number | null; evalAt: string | null; axes: any;
}

function splitUw(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  return raw.split(/[、,，・／/]/).map((s) => s.replace(/\(.*?\)|（.*?）/g, "").replace(/株式会社/g, "").trim()).filter(Boolean);
}

async function loadPool(supabase: any, today: string): Promise<PoolRow[]> {
  const rich = await supabase.from("ipo_companies")
    .select("id,name,exchange,sector,listing_date,price_change_rate,lead_uw:analysis_market->>lead_underwriter,s_grade:analysis_summary->>grade,s_total:analysis_summary->>total_score,s_at:analysis_summary->>generated_at,s_resc:analysis_summary->>rescored_at,s_axes:analysis_summary->axes_scores")
    .not("price_change_rate", "is", null).lte("listing_date", today).order("listing_date", { ascending: false });
  let rows: any[] = rich.data ?? [];
  if (rich.error) {
    console.error("週刊スライド: 過去実績の取得(詳細)に失敗。簡易版で続行します:", rich.error.message);
    const simple = await supabase.from("ipo_companies").select("id,name,exchange,sector,listing_date,price_change_rate")
      .not("price_change_rate", "is", null).lte("listing_date", today).order("listing_date", { ascending: false });
    rows = simple.data ?? [];
  }
  return rows
    .filter((r) => num(r.price_change_rate) != null && r.listing_date)
    .map((r) => ({
      id: r.id, name: r.name, exchange: r.exchange ?? null, sector: r.sector ?? null, date: r.listing_date,
      rate: Number(r.price_change_rate), uw: splitUw(r.lead_uw),
      grade: r.s_grade ?? null, total: num(r.s_total), evalAt: r.s_resc ?? r.s_at ?? null, axes: r.s_axes ?? null,
    }));
}

function binOf(v: number): number {
  return v < -10 ? 0 : v < 0 ? 1 : v < 10 ? 2 : v < 30 ? 3 : v < 60 ? 4 : v < 100 ? 5 : 6;
}

function stat(label: string, rows: PoolRow[]): CompStat | null {
  if (rows.length === 0) return null;
  const rates = rows.map((r) => r.rate);
  const bins = [0, 0, 0, 0, 0, 0, 0];
  rates.forEach((v) => bins[binOf(v)]++);
  return {
    label, n: rates.length,
    avg: r1(rates.reduce((a, b) => a + b, 0) / rates.length),
    median: r1(median(rates) as number),
    winRate: Math.round((rates.filter((v) => v > 0).length / rates.length) * 100),
    lossRate: Math.round((rates.filter((v) => v < 0).length / rates.length) * 100),
    bins,
  };
}

function rank(rows: PoolRow[], keyOf: (r: PoolRow) => string[], minN: number): RankRow[] {
  const map = new Map<string, number[]>();
  for (const r of rows) for (const k of keyOf(r)) { if (!k) continue; (map.get(k) ?? map.set(k, []).get(k)!).push(r.rate); }
  return [...map.entries()]
    .filter(([, v]) => v.length >= minN)
    .map(([label, v]) => ({ label, n: v.length, avg: r1(v.reduce((a, b) => a + b, 0) / v.length), winRate: Math.round((v.filter((x) => x > 0).length / v.length) * 100) }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 8);
}

// ───────── 1社ぶんのカード ─────────
function buildCard(c: any, pool: PoolRow[]): CompanyCard {
  const s = c.analysis_summary ?? {};
  const trusted = isTrustedScore(s);
  const sd = c.structured_data ?? {};
  const ipo = sd.ipo_details ?? {};
  const uw: string | null = c.analysis_market?.lead_underwriter ? String(c.analysis_market.lead_underwriter) : null;

  const axes = trusted
    ? AXIS_ORDER.map((id) => ({ id, label: AXIS_SHORT[id], score: Math.max(0, Math.min(100, Math.round(Number(s.axes_scores[id])))) }))
    : [];

  // 結論の一文(ルールで作る。売買の助言にならない、評価の言葉だけを使う)
  let headline = "AI評価を更新中のため、事実情報のみを掲載しています";
  if (trusted && axes.length === 9) {
    const best = axes.reduce((m, a) => (a.score > m.score ? a : m));
    const worst = axes.reduce((m, a) => (a.score < m.score ? a : m));
    const strong = best.score >= 65 ? STRONG[best.id] : "";
    const weak = worst.score <= 55 ? WEAK[worst.id] : "";
    headline = strong && weak ? `${strong}の一方で、${weak}`
      : strong ? `${strong}。大きな弱点は見当たりません`
      : weak ? `突出した強みは少なく、${weak}`
      : "強みと弱みが拮抗した中立的な評価です";
  }

  const insights: any[] = Array.isArray(s.insights) ? s.insights : [];
  const points = insights.slice(0, 2).map((i) => ({
    title: String(i?.title ?? "").trim(),
    text: firstSentences(i?.desc || i?.body || i?.detail, 1, 62),
  })).filter((p) => p.title);

  const sevOrder: Record<string, number> = { 高: 0, 中: 1, 低: 2 };
  let risks = (Array.isArray(sd.risks) ? sd.risks : [])
    .map((r: any) => ({ title: String(r?.title ?? "").trim().slice(0, 26), severity: String(r?.severity ?? "").trim(), text: String(r?.description ?? "").trim().slice(0, 46) }))
    .filter((r: any) => r.title)
    .sort((a: any, b: any) => (sevOrder[a.severity] ?? 3) - (sevOrder[b.severity] ?? 3))
    .slice(0, 3);
  if (risks.length === 0 && axes.length === 9) {
    risks = [...axes].sort((a, b) => a.score - b.score).slice(0, 2)
      .map((a) => ({ title: `${a.label}の評価が低め`, severity: "", text: `9軸スコア ${a.score}点` }));
  }

  const financials = buildRevenueChartData(sd.key_metrics, 5).filter((p) => p.label).map((p) => ({ label: p.label, revenue: p.value, profit: p.profit }));

  // 価格・必要資金
  const basis: number | null = c.ipo_price ?? c.price_range_max ?? c.price_range_min ?? null;
  const price = {
    range: priceRangeText(c.price_range_min, c.price_range_max),
    ipo: yen(c.ipo_price),
    basisLabel: c.ipo_price ? "公募価格" : "仮条件の上限",
    basis,
    need100: basis ? basis * 100 : null,
  };

  // 需給
  const existing = parseShares(ipo.total_shares);
  const newShares = parseShares(ipo.public_shares, "公募");
  const soldShares = parseShares(ipo.public_shares, "売出");
  const oaShares = parseShares(ipo.overallotment);
  const post = existing && newShares ? existing + newShares : null;
  const floatRatio = parsePct(ipo.float_ratio);
  const fundraisingOku = parseYenToOku(ipo.fundraising_amount, false);

  const holders: Holder[] = (Array.isArray(sd.shareholders) ? sd.shareholders : [])
    .map((h: any) => ({
      name: String(h?.name ?? "").replace(/株式会社/g, "").trim(),
      ratio: parsePct(h?.ratio) ?? 0,
      type: String(h?.type ?? "その他"),
      lockup: /有/.test(String(h?.lockup ?? "")) ? true : /無/.test(String(h?.lockup ?? "")) ? false : null,
    }))
    .filter((h: Holder) => h.name && h.ratio > 0)
    .sort((a: Holder, b: Holder) => b.ratio - a.ratio)
    .slice(0, 8);
  const hasLockInfo = holders.some((h) => h.lockup !== null);
  const lockupCover = hasLockInfo ? r1(holders.filter((h) => h.lockup === true).reduce((a, h) => a + h.ratio, 0)) : null;
  const vc = holders.filter((h) => /VC|ベンチャー|ファンド|キャピタル/.test(h.type));
  const vcRatio = holders.length > 0 ? r1(vc.reduce((a, h) => a + h.ratio, 0)) : null;

  const supply = {
    postIpoShares: post, newShares, soldShares, oaShares,
    floatRatio,
    fundraisingOku,
    marketCapOku: basis && post ? r1((basis * post) / 1e8) : null,
    absorbOku: basis && (newShares || soldShares || oaShares) ? r1((basis * ((newShares ?? 0) + (soldShares ?? 0) + (oaShares ?? 0))) / 1e8) : null,
    lockupPeriod: ipo.lockup_period ? String(ipo.lockup_period) : null,
    lockupCover, vcRatio,
  };

  // 需給の結論の一文
  const tone = floatRatio == null ? null : floatRatio < 20 ? "流通株が少なく、需給は引き締まり気味" : floatRatio >= 35 ? "流通株が多く、需給は緩め" : "需給は標準的";
  const extra = vcRatio != null && vcRatio >= 30 ? `。VC等の保有が${vcRatio}%と大きく、売り圧力に注意` : lockupCover != null && lockupCover >= 70 ? `。ロックアップ対象が${lockupCover}%と手厚い` : "";
  const supplyHeadline = tone ? `${tone}です${extra}` : holders.length > 0 ? `株主構成と過去の実績を確認できます${extra}` : "需給に関する情報は、目論見書の公開後に追加されます";

  // 過去の初値の実績
  const others = pool.filter((p) => p.id !== c.id);
  const uwList = splitUw(uw);
  const comps = {
    market: c.exchange && others.filter((p) => p.exchange === c.exchange).length >= 5
      ? stat(`${c.exchange}市場`, others.filter((p) => p.exchange === c.exchange)) : null,
    underwriter: uwList.length > 0 && others.filter((p) => p.uw.some((u) => uwList.includes(u))).length >= 3
      ? stat(`同じ主幹事（${uwList.join("・")}）`, others.filter((p) => p.uw.some((u) => uwList.includes(u)))) : null,
    sector: c.sector && others.filter((p) => p.sector === c.sector).length >= 5
      ? stat(`同じ業種（${c.sector}）`, others.filter((p) => p.sector === c.sector)) : null,
  };

  const facts: [string, string][] = [];
  if (c.listing_date) facts.push(["上場日", `${jpDate(c.listing_date)}${c.listing_date_confirmed ? "" : "（予定）"}`]);
  if (price.ipo) facts.push(["公募価格", price.ipo]);
  else if (price.range) facts.push(["仮条件", price.range]);
  if (c.bb_start_date) facts.push(["BB開始日", jpDate(c.bb_start_date)]);
  if (c.apply_start_date) facts.push(["申込開始日", jpDate(c.apply_start_date)]);
  if (uw) facts.push(["主幹事", uw]);

  return {
    id: c.id, name: c.name, ticker: c.ticker ?? null, exchange: c.exchange ?? null, sector: c.sector ?? null,
    grade: trusted ? s.grade ?? null : null,
    score: trusted ? Number(s.total_score) : null,
    ultra: trusted ? s.ultra_short_grade ?? null : null,
    short: trusted ? s.short_grade ?? null : null,
    long: trusted ? s.long_grade ?? null : null,
    headline, supplyHeadline, axes: axes.map(({ label, score }) => ({ label, score })),
    points, risks, financials, facts, underwriter: uw,
    dates: { bb: c.bb_start_date ?? null, apply: c.apply_start_date ?? null, listing: c.listing_date ?? null, lock90: c.lockup_90_date ?? null, lock180: c.lockup_180_date ?? null, listingConfirmed: !!c.listing_date_confirmed },
    price, supply, holders, comps,
  };
}

// ───────── 全体 ─────────
export async function loadSlidesData(supabase: any): Promise<SlidesData> {
  const brief = await loadBriefData(supabase);
  const today = brief.today;
  const pool = await loadPool(supabase, today);

  // 地合い(直近20社)
  const recent = pool.slice(0, 20).reverse();
  const rates = recent.map((r) => r.rate);
  const avg = rates.length ? r1(rates.reduce((a, b) => a + b, 0) / rates.length) : null;
  const up = rates.filter((r) => r > 0).length;
  const win = rates.length ? Math.round((up / rates.length) * 100) : 0;
  let mTone: Tone = "neutral", mLabel = "中立";
  if (avg != null) {
    if (avg >= 20 && win >= 70) { mTone = "good"; mLabel = "良好"; }
    else if (avg <= 0 || win < 50) { mTone = "warn"; mLabel = "軟調"; }
  }
  const market = {
    items: recent.map((r) => ({ name: r.name, value: r.rate, date: r.date })),
    avg, median: median(rates) != null ? r1(median(rates) as number) : null, up, n: rates.length,
    best: rates.length ? Math.max(...rates) : null, worst: rates.length ? Math.min(...rates) : null,
    tone: mTone, toneLabel: mLabel,
  };

  // 行動ボード(今週〜再来週の21日間)
  const gFrom = brief.thisMon, gTo = addDays(brief.thisMon, 20);
  const win3 = (col: string) => supabase.from("ipo_companies").select(LITE_FIELDS).gte(col, gFrom).lte(col, gTo);
  const [gb, ga, gl] = await Promise.all([win3("bb_start_date"), win3("apply_start_date"), win3("listing_date")]);
  const gmap = new Map<string, any>();
  [...(gb.data ?? []), ...(ga.data ?? []), ...(gl.data ?? [])].forEach((c: any) => gmap.set(c.id, c));
  const gRows = [...gmap.values()]
    .filter((c) => !c.listing_date || c.listing_date >= today)
    .sort((a, b) => String(a.bb_start_date ?? a.apply_start_date ?? a.listing_date).localeCompare(String(b.bb_start_date ?? b.apply_start_date ?? b.listing_date)))
    .slice(0, 10);
  const ganttRows: GanttRow[] = gRows.map((c) => {
    const basis = c.ipo_price ?? c.price_range_max ?? c.price_range_min ?? null;
    return {
      name: c.name, ticker: c.ticker ?? null, exchange: c.exchange ?? null,
      need100: basis ? basis * 100 : null,
      bb: c.bb_start_date ?? null, apply: c.apply_start_date ?? null, listing: c.listing_date ?? null,
      listingConfirmed: !!c.listing_date_confirmed,
    };
  });

  // これから先の期日(直近5件)
  const agenda = gRows.flatMap((c) => [
    c.bb_start_date ? { date: c.bb_start_date as string, label: "BB開始", color: COLORS.bb, name: c.name as string } : null,
    c.apply_start_date ? { date: c.apply_start_date as string, label: "申込開始", color: COLORS.apply, name: c.name as string } : null,
    c.listing_date ? { date: c.listing_date as string, label: "上場日", color: COLORS.listing, name: c.name as string } : null,
  ]).filter((x): x is { date: string; label: string; color: string; name: string } => !!x && x.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);

  // ロックアップ解除(今後30日)
  const lockTo = addDays(today, 30);
  const [l90, l180] = await Promise.all([
    supabase.from("ipo_companies").select("name,ticker,lockup_90_date").gte("lockup_90_date", today).lte("lockup_90_date", lockTo),
    supabase.from("ipo_companies").select("name,ticker,lockup_180_date").gte("lockup_180_date", today).lte("lockup_180_date", lockTo),
  ]);
  const lockups = [
    ...((l90.data ?? []) as any[]).map((c) => ({ name: c.name as string, ticker: (c.ticker ?? null) as string | null, kind: "90日", raw: c.lockup_90_date as string })),
    ...((l180.data ?? []) as any[]).map((c) => ({ name: c.name as string, ticker: (c.ticker ?? null) as string | null, kind: "180日", raw: c.lockup_180_date as string })),
  ].sort((a, b) => a.raw.localeCompare(b.raw)).map((x) => ({ name: x.name, ticker: x.ticker, kind: x.kind, date: shortDate(x.raw) }));

  // 注目銘柄(来週に上場・BB開始・申込開始がある銘柄。信頼できるAI評価の高い順に最大3社)
  const coreIds = Array.from(new Set(brief.events.filter((e) => ["上場日", "BB開始", "申込開始"].includes(e.label)).map((e) => e.company.id)));
  let companies: CompanyCard[] = [];
  if (coreIds.length > 0) {
    const fq = await supabase.from("ipo_companies").select(COMPANY_FIELDS).in("id", coreIds);
    const cards = ((fq.data ?? []) as any[]).map((c) => buildCard(c, pool));
    cards.sort((a, b) => (GRADE_ORDER[b.grade ?? ""] ?? 0) - (GRADE_ORDER[a.grade ?? ""] ?? 0) || (b.score ?? 0) - (a.score ?? 0));
    companies = cards.slice(0, 3);
  }

  const count = (label: string) => new Set(brief.events.filter((e) => e.label.startsWith(label)).map((e) => e.company.id)).size;
  const counts = { listing: count("上場"), bb: count("BB"), apply: count("申込"), lockup: count("ロックアップ") };

  // 今週の結論(3つ)
  const bullets: SlidesData["bullets"] = [];
  const first = agenda[0];
  bullets.push({
    text: `来週は上場${counts.listing}社・BB開始${counts.bb}社・申込開始${counts.apply}社です。${first ? `最初の期日は${shortDate(first.date)}の${first.label}（${first.name}）です。` : ""}`,
    tone: "neutral",
  });
  const rated = companies.filter((c) => c.grade && c.score != null);
  if (rated.length > 0) {
    const t = rated[0];
    const second = rated[1];
    bullets.push({
      text: `来週の注目銘柄でAI評価が最も高いのは${t.name}（${t.grade}・${t.score}点）です。${second ? `次いで${second.name}（${second.grade}・${second.score}点）です。` : ""}`,
      tone: GRADE_ORDER[t.grade as string] >= 4 ? "good" : "neutral",
    });
  } else if (companies.length > 0) {
    bullets.push({ text: `来週の注目銘柄は${companies.map((c) => c.name).join("・")}です。AI評価は更新中のため、事実情報を掲載しています。`, tone: "neutral" });
  }
  if (market.n > 0 && avg != null) {
    bullets.push({
      text: `直近${market.n}社の初値は公募価格比で平均${pctText(avg)}・勝率${win}%（${up}/${market.n}社）で、地合いは${mLabel}です。`,
      tone: mTone,
    });
  }
  const headline = `地合いは${mLabel}。来週は上場${counts.listing}社・申込開始${counts.apply}社`;

  // 過去実績の一覧
  const rankUnderwriter = rank(pool, (r) => r.uw, 3);
  const rankSector = rank(pool, (r) => (r.sector ? [r.sector] : []), 3);

  // AI評価の累計成績(上場前に付けた、信頼できる評価だけ。5件未満なら出さない)
  const trackPts: TrackPoint[] = pool
    .filter((r) => r.grade && r.total != null && r.evalAt && r.evalAt.slice(0, 10) < r.date && isTrustedScore({ total_score: r.total, axes_scores: r.axes }))
    .map((r) => ({ name: r.name, score: r.total as number, grade: r.grade as string, rate: r.rate }));
  let track: SlidesData["track"] = null;
  if (trackPts.length >= 5) {
    const gm = new Map<string, number[]>();
    trackPts.forEach((p) => (gm.get(p.grade) ?? gm.set(p.grade, []).get(p.grade)!).push(p.rate));
    track = {
      points: trackPts,
      byGrade: [...gm.entries()].sort((a, b) => (GRADE_ORDER[b[0]] ?? 0) - (GRADE_ORDER[a[0]] ?? 0))
        .map(([grade, v]) => ({ grade, n: v.length, avg: r1(v.reduce((a, b) => a + b, 0) / v.length) })),
    };
  }

  const friDay = Number(brief.thisFri.slice(8, 10));
  return {
    issueLabel: `${brief.thisFri.slice(0, 4)}年${Number(brief.thisFri.slice(5, 7))}月 第${Math.ceil(friDay / 7)}週号`,
    asOf: today, thisMon: brief.thisMon, thisFri: brief.thisFri, nextMon: brief.nextMon, nextSun: brief.nextSun,
    headline, bullets: bullets.slice(0, 3), counts, agenda,
    events: brief.events.map((e) => ({ date: e.date, label: e.label, color: e.color, name: e.company.name, ticker: e.company.ticker })),
    gantt: { from: gFrom, days: 21, rows: ganttRows },
    lockups, companies, market, rankUnderwriter, rankSector, track,
  };
}

// ───────── 公開前の自動チェック ─────────
export interface SlidesCheckResult { ok: boolean; issues: string[] }

export function verifySlidesData(d: SlidesData): SlidesCheckResult {
  const issues: string[] = [];
  if (d.bullets.length === 0) issues.push("今週の結論が空です");
  d.events.forEach((e) => {
    if (e.date < d.nextMon || e.date > d.nextSun) issues.push(`${e.name}: 予定日(${e.date})が来週の範囲外です`);
  });
  if (d.companies.length === 0) issues.push("注目銘柄がありません(来週に該当の銘柄が無い場合は、正常なこともあります)");
  d.companies.forEach((c) => {
    if (!c.grade) issues.push(`${c.name}: 信頼できるAI評価がありません(評価を更新してください)`);
    else if (c.axes.length < 9) issues.push(`${c.name}: 9軸のスコアが${c.axes.length}件しかありません`);
    if (c.financials.length < 2) issues.push(`${c.name}: 財務の推移が2期ぶん未満です(グラフを省略します)`);
    if (c.holders.length > 0) {
      const sum = c.holders.reduce((a, h) => a + h.ratio, 0);
      if (sum > 100.5) issues.push(`${c.name}: 株主の保有比率の合計が${r1(sum)}%で、100%を超えています`);
    }
    if (c.supply.floatRatio != null && (c.supply.floatRatio <= 0 || c.supply.floatRatio > 100)) issues.push(`${c.name}: 流通比率(${c.supply.floatRatio}%)が範囲外です`);
    if (!c.comps.market) issues.push(`${c.name}: 過去の同市場の実績が5社に満たないため、分布を省略します`);
  });
  if (d.market.n < 5) issues.push("直近の上場実績が5社未満です(地合いの集計は参考値です)");

  let bad = false;
  const walk = (v: unknown) => {
    if (typeof v === "string") { if (/\bundefined\b|\bNaN\b|\bnull\b/.test(v)) bad = true; }
    else if (typeof v === "number") { if (!Number.isFinite(v)) bad = true; }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(d);
  if (bad) issues.push("データに undefined・NaN・null の文字、または数値でない値が含まれています");

  return { ok: issues.length === 0, issues };
}

export { gradeFromScore, GRADE_LABEL };
