import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { postToX } from "@/lib/post-to-x";
import { notifyAdmin } from "@/lib/notify-admin";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 初値・騰落率の更新
export async function POST(req: NextRequest) {
  const { stockId, initialPrice, priceChangeRate, status } = await req.json();

  if (!stockId) {
    return NextResponse.json({ error: "stockId is required" }, { status: 400 });
  }

  // 更新前の状態を取得（初値が「今回はじめて」入力されたかどうかを判定するため）
  const { data: before } = await supabase
    .from("ipo_companies")
    .select("name, ticker, ipo_price, initial_price")
    .eq("id", stockId)
    .single();

  const { error } = await supabase
    .from("ipo_companies")
    .update({
      ...(initialPrice != null ? { initial_price: Number(initialPrice) } : {}),
      ...(priceChangeRate != null ? { price_change_rate: Number(priceChangeRate) } : {}),
      ...(status ? { status } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", stockId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // X初値実況投稿：初値が「今回はじめて」入力された場合のみ投稿
  const isFirstTimeInitialPrice = before && before.initial_price == null && initialPrice != null;
  if (process.env.X_AUTOPOST_ENABLED === "true" && isFirstTimeInitialPrice && before) {
    try {
      const ipoPrice = before.ipo_price;
      const newInitialPrice = Number(initialPrice);
      const rate = priceChangeRate != null
        ? Number(priceChangeRate)
        : (ipoPrice ? Math.round(((newInitialPrice - ipoPrice) / ipoPrice) * 1000) / 10 : null);
      const rateText = rate != null ? `（${rate >= 0 ? "+" : ""}${rate}%）` : "";
      const emoji = rate != null ? (rate >= 0 ? "📈" : "📉") : "📊";

      const tweetText = `${emoji} ${before.name}（${before.ticker ?? ""}）\n\n` +
        `初値がつきました。\n` +
        (ipoPrice ? `公募価格 ${ipoPrice.toLocaleString()}円 → 初値 ${newInitialPrice.toLocaleString()}円${rateText}\n\n` : `初値 ${newInitialPrice.toLocaleString()}円\n\n`) +
        `#IPO #初値`;

      const postResult = await postToX(tweetText.slice(0, 140));
      if (!postResult.success) {
        await notifyAdmin(
          `⚠️ X投稿失敗: ${before.name}（初値実況）`,
          `エラー: ${postResult.error}`,
          "warn"
        );
      }
    } catch (e: any) {
      await notifyAdmin(`⚠️ X投稿エラー: ${before.name}（初値実況）`, String(e), "warn");
    }
  }

  return NextResponse.json({ success: true });
}