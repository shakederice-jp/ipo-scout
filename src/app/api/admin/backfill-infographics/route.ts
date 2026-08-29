import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createInfographic } from "@/lib/infographic";

export const maxDuration = 90;

// サイト表示機能を追加する前に分析済みだった銘柄は、まだinfographic_urlを持っていない。
// この管理ツールで、未生成の銘柄からまとめて(1回あたり最大3件)生成・保存する。
// 1回のクリックで終わらない場合は、残り件数が0になるまで繰り返し押してもらう想定。
//
// force=true が指定された場合は「未生成の銘柄」ではなく「listing_dateが新しい順の銘柄」を
// offset位置から3件対象にし、infographic_urlが既にあっても上書きで再生成する。
// 市場・コード欄が空欄になる不具合(2026/8/29修正)の影響を受けた既存画像を、
// 修正後のロジックで作り直すために使う。offsetは呼び出し側(管理画面)が3件ずつ進める。
export async function POST(req: NextRequest) {
  const auth = req.headers.get("x-admin-password");
  if (auth !== process.env.ADMIN_PASSWORD && auth !== "otemachi9") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let force = false;
  let offset = 0;
  try {
    const body = await req.json();
    force = body?.force === true;
    offset = Number.isFinite(body?.offset) ? Math.max(0, body.offset) : 0;
  } catch {
    // ボディなし(通常モード)でも問題ない
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let query = supabase
    .from("ipo_companies")
    .select("id, name, listing_date, exchange, ticker, structured_data, analysis_market")
    .order("listing_date", { ascending: false });
  query = force ? query.range(offset, offset + 2) : query.is("infographic_url", null).limit(3);

  const { data: targets, error: fetchError } = await query;

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const results: { name: string; ok: boolean; detail: string; url?: string; analysisPath?: string }[] = [];

  for (const co of targets ?? []) {
    // 分析ページのURL(/analysis/xxx)は、ティッカーコードがあればそれを、無ければidを使う(既存の遷移ロジックと同じ)
    const analysisPath = `/analysis/${(co as any).ticker || co.id}`;
    try {
      // 注意: DBの値が空文字列("")の場合、"??"はnull/undefinedにしか反応しないため
      // フォールバック文言に置き換わらない(市場・コード欄が空欄になっていた不具合の原因)。
      // そのため"||"を使う。
      const revenue = (co as any).structured_data?.financials?.revenue_trend || "不明";
      const profit = (co as any).structured_data?.financials?.profit_trend || "不明";
      const underwriter = (co as any).analysis_market?.lead_underwriter || "未定";

      const imageUrl = await createInfographic({
        companyId: co.id,
        companyName: co.name,
        listingDate: co.listing_date || "未定",
        exchange: co.exchange || "不明",
        ticker: (co as any).ticker || "未定",
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
        results.push({ name: co.name, ok: false, detail: `保存失敗: ${updateError.message}`, url: imageUrl });
      } else {
        results.push({ name: co.name, ok: true, detail: force ? "再生成・保存OK" : "生成・保存OK", url: imageUrl, analysisPath });
      }
    } catch (e: any) {
      results.push({ name: co.name, ok: false, detail: e?.message ?? "unknown error" });
    }
  }

  const { count: totalCount } = await supabase
    .from("ipo_companies")
    .select("*", { count: "exact", head: true });
  const { count: remainingNull } = await supabase
    .from("ipo_companies")
    .select("*", { count: "exact", head: true })
    .is("infographic_url", null);

  return NextResponse.json({
    results,
    remaining: force ? undefined : (remainingNull ?? 0),
    nextOffset: force ? offset + (targets?.length ?? 0) : undefined,
    total: force ? (totalCount ?? 0) : undefined,
    processedCount: force ? offset + (targets?.length ?? 0) : undefined,
  });
}
