import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyAdmin } from "@/lib/notify-admin";

// 2026/9/6新設: 「100万円投資シミュレーション」機能用の日次株価取得バッチ。
// 上場済み銘柄(ticker設定済み)の株価をYahoo Financeから毎日取得し、
// stock_price_history に1日1レコードずつ積み上げる。detect-ipo-price(初値の
// 一度きりの検出)とは別物で、こちらは上場後ずっと・期限なく動き続ける想定。
export const maxDuration = 60;

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Yahoo Financeから直近の株価を取得(直近5営業日のうち最新の終値)
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
    // 直近5日レンジの中で最も新しい終値(=配列の最後)を採用する
    return Math.round(validCloses[validCloses.length - 1]);
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

  // 上場日を過ぎていてtickerが設定されている銘柄はすべて対象(初値取得済み/未取得を問わない)
  const { data: targets, error } = await supabase
    .from("ipo_companies")
    .select("id, name, ticker, listing_date")
    .lte("listing_date", today)
    .not("ticker", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!targets || targets.length === 0) {
    return NextResponse.json({ message: "追跡対象銘柄なし", updated: 0 });
  }

  const failures: string[] = [];
  let updatedCount = 0;

  for (const company of targets) {
    const price = await fetchStockPrice(company.ticker);
    if (!price) {
      failures.push("⚠️ " + company.name + "(" + company.ticker + "): 株価取得失敗");
      continue;
    }

    // company_id + price_date のuniqueキーでupsertし、同日の再実行でも重複しない
    const { error: upsertError } = await supabase
      .from("stock_price_history")
      .upsert(
        {
          company_id: company.id,
          price_date: today,
          price,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "company_id,price_date" }
      );

    if (upsertError) {
      failures.push("❌ " + company.name + ": 保存エラー - " + upsertError.message);
    } else {
      updatedCount++;
    }
  }

  // 失敗が多い場合のみ管理者に通知(毎日の正常完了メールで受信箱を埋めないため)
  if (failures.length > 0 && failures.length >= targets.length / 2) {
    await notifyAdmin(
      "株価追跡バッチで失敗が多発",
      failures.join("\n"),
      "warn"
    );
  }

  return NextResponse.json({
    success: true,
    updated: updatedCount,
    failed: failures.length,
    failures,
    fetched_at: new Date().toISOString(),
  });
}
