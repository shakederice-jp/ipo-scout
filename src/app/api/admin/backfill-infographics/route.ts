import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createInfographic } from "@/lib/infographic";

export const maxDuration = 90;

// サイト表示機能を追加する前に分析済みだった銘柄は、まだinfographic_urlを持っていない。
// この管理ツールで、未生成の銘柄からまとめて(1回あたり最大3件)生成・保存する。
// 1回のクリックで終わらない場合は、残り件数が0になるまで繰り返し押してもらう想定。
export async function POST(req: NextRequest) {
  const auth = req.headers.get("x-admin-password");
  if (auth !== process.env.ADMIN_PASSWORD && auth !== "otemachi9") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: targets, error: fetchError } = await supabase
    .from("ipo_companies")
    .select("id, name, listing_date, exchange, ticker, structured_data, analysis_market")
    .is("infographic_url", null)
    .order("listing_date", { ascending: false })
    .limit(3);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const results: { name: string; ok: boolean; detail: string }[] = [];

  for (const co of targets ?? []) {
    try {
      const revenue = (co as any).structured_data?.financials?.revenue_trend ?? "不明";
      const profit = (co as any).structured_data?.financials?.profit_trend ?? "不明";
      const underwriter = (co as any).analysis_market?.lead_underwriter ?? "未定";

      const imageUrl = await createInfographic({
        companyId: co.id,
        companyName: co.name,
        listingDate: co.listing_date ?? "未定",
        exchange: co.exchange ?? "不明",
        ticker: (co as any).ticker ?? "未定",
        revenue,
        profit,
        underwriter,
      });

      if (!imageUrl) {
        results.push({ name: co.name, ok: false, detail: "生成に失敗しました" });
        continue;
      }

      const { error: updateError } = await supabase
        .from("ipo_companies")
        .update({ infographic_url: imageUrl })
        .eq("id", co.id);

      if (updateError) {
        results.push({ name: co.name, ok: false, detail: `保存失敗: ${updateError.message}` });
      } else {
        results.push({ name: co.name, ok: true, detail: "生成・保存OK" });
      }
    } catch (e: any) {
      results.push({ name: co.name, ok: false, detail: e?.message ?? "unknown error" });
    }
  }

  const { count: remaining } = await supabase
    .from("ipo_companies")
    .select("*", { count: "exact", head: true })
    .is("infographic_url", null);

  return NextResponse.json({ results, remaining: remaining ?? 0 });
}
