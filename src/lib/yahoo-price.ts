// 2026/9/26新設: Yahoo Financeの日足(終値)取得の共通処理(各バッチで同じ処理を別々に書いていたのをまとめた)。
// 注意: Yahoo Financeは名証単独上場の銘柄(例: かがやきHD 624A)のデータを持っていない
// (2026/9/26に「.T」「.N」などで確認済み)。そのため名証単独上場の銘柄は株価を自動取得できない。
export type DailyBar = { date: string; close: number }; // date は日本時間の YYYY-MM-DD

async function fetchChart(symbol: string, range: string): Promise<DailyBar[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=${range}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    const ts: number[] = result?.timestamp ?? [];
    const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
    const out: DailyBar[] = [];
    for (let i = 0; i < ts.length; i++) {
      if (closes[i] == null) continue;
      const date = new Date(ts[i] * 1000).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
      out.push({ date, close: Math.round(closes[i]!) });
    }
    return out;
  } catch {
    return [];
  }
}

// 日足を古い順に返す(東証 .T)
export async function fetchDailyBars(ticker: string, range = "1y"): Promise<DailyBar[]> {
  return fetchChart(`${ticker}.T`, range);
}

// 騰落率(%、小数第1位)。公募価格か基準の株価が無ければ null
export function changeRatePct(price: number | null | undefined, ipoPrice: number | null | undefined): number | null {
  if (price == null || !ipoPrice) return null;
  return Math.round(((Number(price) - Number(ipoPrice)) / Number(ipoPrice)) * 1000) / 10;
}
