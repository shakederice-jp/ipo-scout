import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 初値・騰落率の更新
export async function POST(req: NextRequest) {
  const { stockId, initialPrice, priceChangeRate } = await req.json();

  if (!stockId) {
    return NextResponse.json({ error: "stockId is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("ipo_companies")
    .update({
      initial_price:      initialPrice      ? Number(initialPrice)      : null,
      price_change_rate:  priceChangeRate   ? Number(priceChangeRate)   : null,
      status:             "上場済",
      updated_at:         new Date().toISOString(),
    })
    .eq("id", stockId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}