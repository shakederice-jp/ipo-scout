// 2026/10/18新設(SEO・GEO対応): 日付・金額の表示を整える小さな共通関数。
// 分析ページの「結論＋主要数値表」、/schedule、/results、/lockup などで共通して使う。

// 日本時間の「今日」(YYYY-MM-DD)。サーバーがUTCで動いていても日付がずれないようにする。
export function todayJst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// "2026-10-20" → "2026年10月20日"
export function jpDate(d?: string | null): string {
  const m = d ? /^(\d{4})-(\d{2})-(\d{2})/.exec(d) : null;
  return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : "";
}

// "2026-10-20" → "10/20(火)"
export function shortDate(d?: string | null): string {
  const m = d ? /^(\d{4})-(\d{2})-(\d{2})/.exec(d) : null;
  if (!m) return "-";
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const w = ["日", "月", "火", "水", "木", "金", "土"][dt.getUTCDay()];
  return `${Number(m[2])}/${Number(m[3])}(${w})`;
}

export function yen(n?: number | null): string {
  return n == null || !Number.isFinite(Number(n)) ? "" : `${Number(n).toLocaleString("ja-JP")}円`;
}

// 仮条件(価格帯)。下限と上限が同じなら1つだけ表示する。
export function priceRangeText(min?: number | null, max?: number | null): string {
  if (min == null && max == null) return "";
  const lo = min ?? max!, hi = max ?? min!;
  return lo === hi ? yen(lo) : `${yen(lo)}〜${yen(hi)}`;
}

export function pctText(r?: number | null): string {
  if (r == null || !Number.isFinite(Number(r))) return "";
  const v = Math.round(Number(r) * 10) / 10;
  return `${v > 0 ? "+" : ""}${v}%`;
}

// 銘柄ページのURL。証券コードがあればコード、なければIDを使う(サイトマップ・canonicalと同じ形に揃える)。
export function companySlug(c: { ticker?: string | null; id: string }): string {
  return c.ticker || c.id;
}
