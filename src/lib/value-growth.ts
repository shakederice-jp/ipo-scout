// 2026/9/26新設: 独自AIナインクロスの独自試算(⑦バリュー×グロース・マップ、⑧長期投資家の視点の
// 追加バッジ、⑨コンセンサス指標)の計算ロジック。
// 仕様メモ: Projectの claude/2026-09-26-value-growth-idea.md / long-term-checklist-ideas.md /
// ai-potential-value-idea.md
//
// ここは計算だけを行う(AIは使わない)。入力は目論見書の構造化データ(structured_data)、
// 追加抽出データ(structured_data.extra_facts)、公募価格など、すでにDBにある数値のみ。
// 前提となる数字が足りない指標は、推測で埋めずに「判定不可」とし、その理由を
// 「赤字だから」か「目論見書から数値を確認できなかったから」かで区別して返す。
import type { ExtraFacts } from "./extra-facts";

export const NINE_CROSS_VERSION = 1;

export type NgReason = "deficit" | "no_data";

export type NineCrossBadge = { text: string; tone: "good" | "warn" | "neutral"; term: string };

export type NineCrossResult = {
  v: number;
  computed_at: string;
  value_score: number | null;
  growth_score: number | null;
  value_reason: NgReason | null;
  growth_reason: NgReason | null;
  quadrant: string | null;
  metrics: {
    cagr: number | null; // 売上の年平均成長率(%)
    yoy: number | null; // 直近期の増収率(%)
    margin: number | null; // 直近期の経常利益率(%)
    margin_trend: number | null; // 経常利益率の変化(ポイント)
    mcap_oku: number | null; // 公募価格ベースの時価総額(億円)
    per: number | null;
    psr: number | null;
    periods: number; // 計算に使った決算期の数
  };
  gvp: { status: "ok" | NgReason; growth: number | null; per: number | null; pass: boolean | null };
  r40: { status: "ok" | NgReason; value: number | null; pass: boolean | null };
  consensus: { pass: number; total: number; items: { key: string; label: string; pass: boolean }[] } | null;
  kari_range: { min: number; max: number } | null; // 仮条件(翌日以降も使えるよう保存しておく)
  demand: {
    kari: { min: number; max: number; pos: "上限" | "中間" | "下限" } | null;
    absorb_oku: number | null;
    mood: { avg: number; n: number } | null;
  };
  badges: { lockup?: NineCrossBadge; vc_sell?: NineCrossBadge; management?: NineCrossBadge; competitor?: NineCrossBadge };
  market_size?: { label: string; source: string; year: string; oku_yen: number } | null;
  peers: { name: string; v: number; g: number; self?: boolean }[];
};

// ===== 数値の読み取り =====
// 「1,234,567千円」「△101,946千円」「-36,319千円」「33,103百万円」→ 円
export function parseYenAmount(s: unknown): number | null {
  if (s == null) return null;
  if (typeof s === "number") return Number.isFinite(s) ? s * 1000 : null; // 単位なしの数値は千円とみなす(構造化の指示どおり)
  const t = String(s).normalize("NFKC").replace(/\s/g, "");
  if (!t || /記載なし|―|^-$|^—$/.test(t)) return null;
  const neg = /^[△▲\-−]/.test(t);
  const m = t.replace(/,/g, "").match(/([0-9]+(?:\.[0-9]+)?)/);
  if (!m) return null;
  let v = parseFloat(m[1]);
  if (t.includes("百万円")) v *= 1_000_000;
  else if (t.includes("千円")) v *= 1000;
  else if (t.includes("億円")) v *= 100_000_000;
  else if (t.includes("円")) v *= 1;
  else v *= 1000;
  return neg ? -v : v;
}

type Period = { label: string; revenue: number; ordinary: number | null; net: number | null };

// 主要な経営指標の推移から、連結/単体の混在を避けて1系列を取り出す(古い→新しい順)
export function pickSeries(keyMetrics: any[] | null | undefined): Period[] {
  const rows = (Array.isArray(keyMetrics) ? keyMetrics : [])
    .map((k: any) => ({
      label: String(k?.period ?? ""),
      revenue: parseYenAmount(k?.revenue),
      ordinary: parseYenAmount(k?.ordinary_profit),
      net: parseYenAmount(k?.net_profit),
    }))
    .filter((r) => r.revenue != null && (r.revenue as number) > 0) as Period[];
  const consolidated = rows.filter((r) => r.label.includes("連結"));
  const series = consolidated.length >= 2 ? consolidated : rows.filter((r) => !r.label.includes("連結"));
  const seen = new Set<string>();
  return series.filter((r) => (seen.has(r.label) ? false : (seen.add(r.label), true)));
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

// ===== 1社分の基礎指標 =====
export type BaseMetrics = {
  id: string;
  name: string;
  cagr: number | null;
  yoy: number | null;
  medianYoy: number | null;
  margin: number | null;
  marginTrend: number | null;
  mcap: number | null; // 円
  per: number | null;
  psr: number | null;
  psrg: number | null;
  rule40: number | null;
  latestNet: number | null;
  periods: number;
};

export function baseMetrics(co: any): BaseMetrics {
  const sd = co.structured_data ?? {};
  const ef: ExtraFacts | undefined = sd.extra_facts;
  const series = pickSeries(sd.key_metrics);
  const n = series.length;
  const last = n ? series[n - 1] : null;

  let cagr: number | null = null;
  let yoy: number | null = null;
  let medianYoy: number | null = null;
  let margin: number | null = null;
  let marginTrend: number | null = null;
  if (n >= 2 && last) {
    const span = Math.min(4, n - 1);
    const first = series[n - 1 - span];
    if (first.revenue > 0) cagr = (Math.pow(last.revenue / first.revenue, 1 / span) - 1) * 100;
    const prev = series[n - 2];
    yoy = (last.revenue / prev.revenue - 1) * 100;
    const yoys: number[] = [];
    for (let i = n - span; i < n; i++) yoys.push((series[i].revenue / series[i - 1].revenue - 1) * 100);
    medianYoy = median(yoys);
  }
  if (last && last.ordinary != null) {
    margin = (last.ordinary / last.revenue) * 100;
    const span = Math.min(4, n - 1);
    const first = n >= 2 ? series[n - 1 - span] : null;
    if (first && first.ordinary != null) marginTrend = margin - (first.ordinary / first.revenue) * 100;
  }

  // 時価総額 = 公募価格 × (上場前の発行済株式総数 + 公募株数)
  let mcap: number | null = null;
  const price = Number(co.ipo_price) || null;
  if (price && ef?.shares_before_ipo) {
    const post = ef.shares_before_ipo + (ef.new_shares ?? 0);
    const m = price * post;
    if (m >= 1e8 && m <= 1e13) mcap = m; // 1億〜10兆円の範囲外は読み取り誤りとみなして使わない
  }
  const latestNet = last?.net ?? null;
  const per = mcap && latestNet && latestNet > 0 ? mcap / latestNet : null;
  const psr = mcap && last ? mcap / last.revenue : null;
  const psrg = psr != null && cagr != null && cagr > 0 ? psr / cagr : null;
  const rule40 = cagr != null && margin != null ? cagr + margin : null;

  return {
    id: co.id,
    name: co.name,
    cagr: cagr != null ? round1(cagr) : null,
    yoy: yoy != null ? round1(yoy) : null,
    medianYoy: medianYoy != null ? round1(medianYoy) : null,
    margin: margin != null ? round1(margin) : null,
    marginTrend: marginTrend != null ? round1(marginTrend) : null,
    mcap,
    per: per != null ? round1(per) : null,
    psr: psr != null ? Math.round(psr * 100) / 100 : null,
    psrg,
    rule40: rule40 != null ? round1(rule40) : null,
    latestNet,
    periods: n,
  };
}

// 母集団の中での順位を0〜100点にする(higherIsBetter=falseなら小さいほど高得点)
function percentile(x: number | null, all: (number | null)[], higherIsBetter: boolean): number | null {
  if (x == null) return null;
  const vals = all.filter((v): v is number => v != null && Number.isFinite(v));
  if (vals.length < 5) return null; // 比較相手が少なすぎる場合は点数にしない
  let better = 0;
  let equal = 0;
  for (const v of vals) {
    if (v === x) equal++;
    else if (higherIsBetter ? v < x : v > x) better++;
  }
  return Math.round(((better + (equal - 1) / 2) / (vals.length - 1)) * 100);
}

function avg(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

function quadrantOf(v: number, g: number): string {
  if (v >= 50 && g >= 50) return "掘り出し物候補";
  if (v < 50 && g >= 50) return "期待先行型";
  if (v >= 50 && g < 50) return "堅実バリュー型";
  return "慎重に見極めたい";
}

const fmtYen = (n: number) => `${Math.round(n).toLocaleString("ja-JP")}円`;

// ===== 全社分をまとめて計算 =====
export function computeNineCross(
  companies: any[],
  opts: { kariByTicker?: Map<string, { min: number; max: number }>; today: string }
): Map<string, NineCrossResult> {
  const bases = companies.map(baseMetrics);
  const byId = new Map(bases.map((b) => [b.id, b]));
  const col = (k: keyof BaseMetrics) => bases.map((b) => b[k] as number | null);

  const perAll = col("per");
  const psrAll = col("psr");
  const psrgAll = col("psrg");
  const cagrAll = col("cagr");
  const myoyAll = col("medianYoy");
  const r40All = col("rule40");
  const mtAll = col("marginTrend");
  const perMedian = median(perAll.filter((x): x is number => x != null));
  const psrMedian = median(psrAll.filter((x): x is number => x != null));

  // IPO全体の地合い: 直近に上場した銘柄(最大10社)の上場日終値の公募価格比の平均
  const listed = companies
    .filter((c) => c.listing_date && String(c.listing_date) <= opts.today && c.price_change_rate != null)
    .sort((a, b) => String(b.listing_date).localeCompare(String(a.listing_date)))
    .slice(0, 10);
  const mood = listed.length >= 3
    ? { avg: round1(listed.reduce((s, c) => s + Number(c.price_change_rate), 0) / listed.length), n: listed.length }
    : null;

  const scores = new Map<string, { v: number | null; g: number | null }>();
  for (const b of bases) {
    const valueParts = [percentile(b.per, perAll, false), b.psrg != null ? percentile(b.psrg, psrgAll, false) : percentile(b.psr, psrAll, false)];
    const growthParts = [percentile(b.cagr, cagrAll, true), percentile(b.medianYoy, myoyAll, true), percentile(b.rule40, r40All, true), percentile(b.marginTrend, mtAll, true)];
    scores.set(b.id, { v: avg(valueParts), g: avg(growthParts) });
  }
  const peers = bases
    .map((b) => ({ id: b.id, name: b.name, v: scores.get(b.id)!.v, g: scores.get(b.id)!.g }))
    .filter((p): p is { id: string; name: string; v: number; g: number } => p.v != null && p.g != null);

  const out = new Map<string, NineCrossResult>();
  for (const co of companies) {
    const b = byId.get(co.id)!;
    const ef: ExtraFacts | undefined = co.structured_data?.extra_facts;
    const sc = scores.get(co.id)!;
    const deficit = b.latestNet != null && b.latestNet <= 0;
    const price = Number(co.ipo_price) || null;

    // 成長率 > PER 判定
    let gvp: NineCrossResult["gvp"];
    if (deficit) gvp = { status: "deficit", growth: b.cagr, per: null, pass: null };
    else if (b.per == null || b.cagr == null) gvp = { status: "no_data", growth: b.cagr, per: null, pass: null };
    else gvp = { status: "ok", growth: b.cagr, per: b.per, pass: b.cagr > b.per };

    // Rule of 40(経常利益率で計算)
    const r40: NineCrossResult["r40"] = b.rule40 != null
      ? { status: "ok", value: b.rule40, pass: b.rule40 >= 40 }
      : { status: "no_data", value: null, pass: null };

    // 定番指標の多数決
    const items: { key: string; label: string; pass: boolean }[] = [];
    if (b.per != null && perMedian != null) items.push({ key: "per", label: "PER", pass: b.per < perMedian });
    if (b.psr != null && psrMedian != null) items.push({ key: "psr", label: "PSR", pass: b.psr < psrMedian });
    if (gvp.status === "ok") items.push({ key: "gvp", label: "成長率>PER", pass: !!gvp.pass });
    if (r40.status === "ok") items.push({ key: "r40", label: "Rule of 40", pass: !!r40.pass });
    const consensus = items.length >= 2 ? { pass: items.filter((i) => i.pass).length, total: items.length, items } : null;

    // 公募価格が仮条件のどこで決まったか
    let kari: NineCrossResult["demand"]["kari"] = null;
    const k = co.price_range_min && co.price_range_max
      ? { min: Number(co.price_range_min), max: Number(co.price_range_max) }
      : co.ticker ? opts.kariByTicker?.get(co.ticker) ?? null : null;
    if (price && k && k.max >= k.min) {
      kari = { min: k.min, max: k.max, pos: price >= k.max ? "上限" : price <= k.min ? "下限" : "中間" };
    }

    // 吸収金額 = 公募価格 ×(公募+売出+OA)
    let absorb: number | null = null;
    if (price && ef && ef.new_shares != null && ef.secondary_shares != null) {
      absorb = round1((price * (ef.new_shares + ef.secondary_shares + (ef.overallotment_shares ?? 0))) / 1e8);
    }

    // 各軸の見出し横のバッジ(文字数を増やさないため短い表記のみ)
    const badges: NineCrossResult["badges"] = {};
    if (ef?.lockup_price_multiple) {
      badges.lockup = price
        ? { text: `🔓 解除株価 ${fmtYen(Math.ceil(price * ef.lockup_price_multiple))}(${ef.lockup_price_multiple}倍)`, tone: "neutral", term: "unlock_price" }
        : { text: `🔓 公募の${ef.lockup_price_multiple}倍で解除`, tone: "neutral", term: "unlock_price" };
    }
    if (ef && ef.new_shares != null && ef.secondary_shares != null && ef.new_shares + ef.secondary_shares > 0) {
      const ratio = Math.round((ef.secondary_shares / (ef.new_shares + ef.secondary_shares)) * 100);
      badges.vc_sell = { text: `売出比率 ${ratio}%`, tone: ratio > 50 ? "warn" : "neutral", term: "secondary_ratio" };
    }
    if (ef?.representative) {
      const r = ef.representative.ratio_pct;
      badges.management = { text: `社長保有 ${r}%(上場前)${r >= 20 ? " ✓" : ""}`, tone: r >= 20 ? "good" : "neutral", term: "rep_ratio" };
    }
    const lastRevenue = pickSeries(co.structured_data?.key_metrics).slice(-1)[0]?.revenue ?? null;
    if (ef?.market_size && lastRevenue) {
      const pen = (lastRevenue / (ef.market_size.oku_yen * 1e8)) * 100;
      if (pen > 0 && pen <= 100) {
        const txt = pen < 0.1 ? "0.1%未満" : pen < 10 ? `${pen.toFixed(1)}%` : `${Math.round(pen)}%`;
        badges.competitor = { text: `市場浸透率 ${txt}`, tone: "neutral", term: "penetration" };
      }
    }

    // バリュー度は赤字でもPSRで出せるので、出せないのは数値が確認できない場合だけ
    const noValueReason: NgReason | null = sc.v != null ? null : "no_data";
    out.set(co.id, {
      v: NINE_CROSS_VERSION,
      computed_at: new Date().toISOString(),
      value_score: sc.v,
      growth_score: sc.g,
      value_reason: noValueReason,
      growth_reason: sc.g != null ? null : "no_data",
      quadrant: sc.v != null && sc.g != null ? quadrantOf(sc.v, sc.g) : null,
      metrics: {
        cagr: b.cagr,
        yoy: b.yoy,
        margin: b.margin,
        margin_trend: b.marginTrend,
        mcap_oku: b.mcap != null ? round1(b.mcap / 1e8) : null,
        per: b.per,
        psr: b.psr,
        periods: b.periods,
      },
      gvp,
      r40,
      consensus,
      kari_range: k && k.max >= k.min ? { min: k.min, max: k.max } : null,
      demand: { kari, absorb_oku: absorb, mood },
      badges,
      market_size: ef?.market_size ?? null,
      peers: peers.map((p) => (p.id === co.id ? { name: p.name, v: p.v, g: p.g, self: true } : { name: p.name, v: p.v, g: p.g })),
    });
  }
  return out;
}
