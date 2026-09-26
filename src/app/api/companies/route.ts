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

  // 2026/9/26修正: 以前は select("*") で全列を返していたため、この公開APIから誰でも
  // 目論見書本文(raw_prospectus)や9軸の詳細レポート・シナリオなど有料会員限定の内容まで
  // 取得できてしまっていた。カレンダー(CalendarClient)と管理画面の初値入力欄
  // (InitialPriceForm)が実際に使う列だけに絞る。
  const { data, error } = await supabase
    .from("ipo_companies")
    .select("id, ticker, name, exchange, sector, biz_type, price_range_min, price_range_max, listing_date, listing_date_confirmed, apply_start_date, bb_start_date, lockup_90_date, lockup_180_date, status, highlight, ai_score, ai_summary, ipo_price, initial_price, price_change_rate, created_at, updated_at")
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