import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyAdmin } from "@/lib/notify-admin";
import { fetchDailyBars } from "@/lib/yahoo-price";

export const maxDuration = 60;

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Yahoo Financeから上場日の終値を取得
// 2026/9/26修正: 以前は「直近5営業日の日足の最初の終値」を使っていたため、上場から数日たって
// 実行されると上場日ではない日の終値を「上場日終値」として保存してしまうことがあった。
// 上場日以降で最初の日足(=上場日の終値)を採用する。
async function fetchListingDayClose(ticker: string, listingDate: string): Promise<number | null> {
  const bars = (await fetchDailyBars(ticker, "3mo")).filter((b) => b.date >= listingDate);
  return bars.length > 0 ? bars[0].close : null;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = "Bearer " + process.env.CRON_SECRET;
  if (authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const today = new Date().toISOString().slice(0, 10);

  // 上場日を過ぎているのに上場日終値(initial_price列)未入力の銘柄を取得。
  // 2026/9/6注記: この列に保存する値は、Yahoo Financeの日足終値であり、
  // 上場日に最初についた取引価格(いわゆる「初値」)そのものではない
  // (寄り付き後の値動きにより異なることがある)。管理者向け表示・通知文言も
  // 「上場日終値」で統一する。
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
    return NextResponse.json({ message: "上場日終値未取得銘柄なし", updated: 0 });
  }

  const results: string[] = [];
  let updatedCount = 0;

  for (const company of targets) {
    const price = await fetchListingDayClose(company.ticker, String(company.listing_date).slice(0, 10));
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
      "上場日終値自動取得完了",
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