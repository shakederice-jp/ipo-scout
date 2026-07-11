import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyAdmin } from "@/lib/notify-admin";

export const maxDuration = 60;

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Yahoo Financeから株価を取得
async function fetchStockPrice(ticker: string): Promise<number | null> {
  const symbol = ticker + ".T";
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/" + symbol + "?interval=1d&range=5d";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const closes = result?.indicators?.quote?.[0]?.close;
    if (!closes || closes.length === 0) return null;
    const validCloses = closes.filter((v: any) => v != null);
    if (validCloses.length === 0) return null;
    return Math.round(validCloses[0]);
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = "Bearer " + process.env.CRON_SECRET;
  if (authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const today = new Date().toISOString().slice(0, 10);

  // 上場日を過ぎているのに初値未入力の銘柄を取得
  const { data: targets, error } = await supabase
    .from("ipo_companies")
    .select("id, name, ticker, listing_date, ipo_price, initial_price")
    .lte("listing_date", today)
    .is("initial_price", null)
    .not("ticker", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!targets || targets.length === 0) {
    return NextResponse.json({ message: "初値未取得銘柄なし", updated: 0 });
  }

  const results: string[] = [];
  let updatedCount = 0;

  for (const company of targets) {
    const price = await fetchStockPrice(company.ticker);
    if (!price) {
      results.push("⚠️ " + company.name + "(" + company.ticker + "): 株価取得失敗");
      continue;
    }

    // 騰落率を計算(公募価格がある場合)
    let changeRate: number | null = null;
    if (company.ipo_price) {
      changeRate = Math.round(((price - company.ipo_price) / company.ipo_price) * 1000) / 10;
    }

    const { error: updateError } = await supabase
      .from("ipo_companies")
      .update({
        initial_price: price,
        price_change_rate: changeRate,
        status: "上場済",
        updated_at: new Date().toISOString(),
      })
      .eq("id", company.id);

    if (updateError) {
      results.push("❌ " + company.name + ": 保存エラー - " + updateError.message);
    } else {
      const rateStr = changeRate != null ? "(" + (changeRate > 0 ? "+" : "") + changeRate + "%)" : "";
      results.push("✅ " + company.name + "(" + company.ticker + "): ¥" + price.toLocaleString() + rateStr);
      updatedCount++;
    }
  }

  // 管理者に結果を通知
  if (updatedCount > 0) {
    await notifyAdmin(
      "初値自動取得完了",
      results.join("\n"),
      "info"
    );
  }

  return NextResponse.json({
    success: true,
    updated: updatedCount,
    results,
    fetched_at: new Date().toISOString(),
  });
}