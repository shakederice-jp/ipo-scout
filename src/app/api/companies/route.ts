import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const requestCounts = new Map<string, { count: number; resetAt: number }>();

export async function GET(req: Request) {
  // レート制限：同一IPから1分間に30回まで
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const now = Date.now();
  const limit = requestCounts.get(ip);
  if (limit && now < limit.resetAt) {
    if (limit.count >= 30) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    limit.count++;
  } else {
    requestCounts.set(ip, { count: 1, resetAt: now + 60000 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from("ipo_companies")
    .select("*")
    .order("listing_date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 2026/9/6新設: トップページのカレンダー一覧にも「100万円投資シミュレーション」の
  // 現在評価額を表示するため、公募価格(ipo_price)が確定している銘柄について
  // stock_price_history から各社の最新株価を取得し、company.latest_price として付加する。
  // (マイポートフォリオ機能の src/app/api/mypage/route.ts と同じ「最新1件だけ残す」方式)
  const priceTargetIds = (data ?? [])
    .filter((c: any) => c.ipo_price)
    .map((c: any) => c.id);

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

  const withLatestPrice = (data ?? []).map((c: any) => ({
    ...c,
    latest_price: c.ipo_price ? (latestPrices[c.id] ?? c.ipo_price) : null,
  }));

  return NextResponse.json(withLatestPrice);
}