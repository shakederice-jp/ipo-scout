import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyAdmin } from "@/lib/notify-admin";
import { fetchDailyBars, isAutoPriceSupported } from "@/lib/yahoo-price";

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
  const { data: allTargets, error } = await supabase
    .from("ipo_companies")
    .select("id, name, ticker, listing_date, ipo_price, initial_price, exchange")
    .lte("listing_date", today)
    .is("initial_price", null)
    .not("ticker", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 2026/10/24(⑩): 名証・福証・札証のみに上場している銘柄(例: かがやきHD 624A)は、Yahoo Financeで
  // 株価を取得できない。自動取得の対象から外し、毎回「取得失敗」にならないようにする。
  // 上場日終値は、管理画面の「初値・騰落率入力」で手入力する。手入力が要る銘柄は、毎週月曜(日本時間)にだけ知らせる。
  const targets = (allTargets ?? []).filter((c: any) => isAutoPriceSupported(c.exchange));
  const manualNeeded = (allTargets ?? []).filter((c: any) => !isAutoPriceSupported(c.exchange));
  const isMondayJst = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDay() === 1;
  if (manualNeeded.length > 0 && isMondayJst) {
    try {
      await notifyAdmin(
        "初値(上場日終値)の手入力が必要な銘柄があります(週1回のお知らせ)",
        [
          "次の銘柄は、東証以外(名証・福証・札証)のみに上場しているため、株価を自動取得できません。",
          "管理画面の「初値・騰落率入力」から、上場日終値を手入力してください。",
          "",
          ...manualNeeded.map((c: any) => "・" + c.name + "(" + c.ticker + "・" + (c.exchange ?? "市場不明") + ")"),
        ].join("\n"),
        "info"
      );
    } catch (e) {
      console.error("初値手入力のお知らせに失敗:", e);
    }
  }

  if (targets.length === 0) {
    return NextResponse.json({ message: "上場日終値未取得銘柄なし", updated: 0, manualNeeded: manualNeeded.length });
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
    manualNeeded: manualNeeded.length,
    fetched_at: new Date().toISOString(),
  });
}