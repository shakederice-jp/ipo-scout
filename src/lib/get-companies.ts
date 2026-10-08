import { createClient } from "@supabase/supabase-js";

// 2026/10/7新設: トップページの銘柄一覧データを取得する共通処理。
// もとは src/app/api/companies/route.ts だけが持っていたが、トップページ(src/app/page.tsx)の
// 最初のHTMLにもこのデータを含められるよう、ここに一本化した(GEO対応: AIの検索・引用ボットの
// 多くはページのJavaScriptを実行せず、送られてきたHTMLの文字だけを読むため、ブラウザの中で
// あとから取得していたデータはAIから見えない。最初のHTMLに含めることで見えるようにする)。
export type CompanyListItem = {
  id: string;
  ticker?: string | null;
  name: string;
  exchange?: string | null;
  sector?: string | null;
  biz_type?: string | null;
  price_range_min?: number | null;
  price_range_max?: number | null;
  listing_date: string;
  listing_date_confirmed?: boolean | null;
  apply_start_date?: string | null;
  bb_start_date?: string | null;
  lockup_90_date?: string | null;
  lockup_180_date?: string | null;
  status?: string | null;
  highlight?: boolean | null;
  ai_score?: number | null;
  ai_summary?: string | null;
  ipo_price?: number | null;
  initial_price?: number | null;
  price_change_rate?: number | null;
  created_at?: string;
  updated_at?: string;
  latest_price: number | null;
  listing_shares: number | null;
};

// 2026/9/26修正時のコメントを引き継ぎ: select列は、このデータを使う画面
// (トップページのカレンダー・管理画面の初値入力欄)が実際に使う列だけに絞ってある。
// 目論見書本文(raw_prospectus)や9軸の詳細レポート・シナリオなど有料会員限定の内容は含めない。
export async function getCompanies(): Promise<CompanyListItem[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from("ipo_companies")
    .select(
      "id, ticker, name, exchange, sector, biz_type, price_range_min, price_range_max, listing_date, listing_date_confirmed, apply_start_date, bb_start_date, lockup_90_date, lockup_180_date, status, highlight, ai_score, ai_summary, ipo_price, initial_price, price_change_rate, created_at, updated_at, extra:structured_data->extra_facts"
    )
    .order("listing_date", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  // 2026/9/6新設: 「100万円投資シミュレーション」の現在評価額表示用。
  // 公募価格(ipo_price)が確定している銘柄について stock_price_history から最新株価を取得する。
  const priceTargetIds = (data ?? []).filter((c: any) => c.ipo_price).map((c: any) => c.id);

  let latestPrices: Record<string, number> = {};
  if (priceTargetIds.length > 0) {
    const { data: historyRows } = await supabase
      .from("stock_price_history")
      .select("company_id, price, price_date")
      .in("company_id", priceTargetIds)
      .order("price_date", { ascending: false });

    for (const row of historyRows ?? []) {
      if (latestPrices[row.company_id] === undefined) {
        latestPrices[row.company_id] = row.price;
      }
    }
  }

  // 2026/9/29追加: 時価総額表示用に、上場時の発行済株式数(目論見書との照合済みの値のみ)を返す。
  const listingShares = (extra: any): number | null => {
    const before = typeof extra?.shares_before_ipo === "number" ? extra.shares_before_ipo : null;
    const fresh = typeof extra?.new_shares === "number" ? extra.new_shares : null;
    if (before == null || fresh == null || before <= 0) return null;
    return before + fresh;
  };

  return (data ?? []).map(({ extra, ...c }: any) => ({
    ...c,
    latest_price: c.ipo_price ? (latestPrices[c.id] ?? null) : null,
    listing_shares: listingShares(extra),
  }));
}
