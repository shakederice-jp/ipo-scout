import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createInfographic } from "@/lib/infographic";

export const maxDuration = 90;

// インフォグラフィックはX投稿専用のフック画像(サイトの分析ページには表示しない)。
// この管理ツールは、まだ画像を持っていない銘柄からまとめて(1回あたり最大3件)
// 生成・保存する。手動でXに投稿したい過去銘柄がある場合などに使う。
// 1回のクリックで終わらない場合は、残り件数が0になるまで繰り返し押してもらう想定。
//
// force=true が指定された場合は「未生成の銘柄」ではなく「listing_dateが新しい順の銘柄」を
// offset位置から3件対象にし、infographic_urlが既にあっても上書きで再生成する。
// デザインを刷新した際(2026/8/29)などに、既存画像を新デザインで作り直すために使う。
// offsetは呼び出し側(管理画面)が3件ずつ進める。
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
    .select("id, name, sector, analysis_summary")
    .order("listing_date", { ascending: false });
  query = force ? query.range(offset, offset + 2) : query.is("infographic_url", null).limit(3);

  const { data: targets, error: fetchError } = await query;

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const results: { name: string; ok: boolean; detail: string; url?: string; downloadPath?: string }[] = [];

  for (const co of targets ?? []) {
    try {
      const summary = (co as any).analysis_summary;
      // AI分析(スコア・インサイト)が未完了の銘柄は、フック画像の元になる材料が無いためスキップする
      if (!summary?.grade || summary?.total_score == null) {
        results.push({ name: co.name, ok: false, detail: "AI分析が未完了のためスキップ(先にSTEP3の分析を実行してください)" });
        continue;
      }

      const hook: string = summary.tweet_summary || summary.insights?.[0]?.body || "AIがこの銘柄を分析しました。";

      const imageUrl = await createInfographic({
        companyId: co.id,
        companyName: co.name,
        sector: (co as any).sector ?? "",
        grade: summary.grade,
        score: summary.total_score,
        hook,
      });

      if (!imageUrl) {
        results.push({ name: co.name, ok: false, detail: "生成に失敗しました" });
        continue;
      }

      const { error: updateError } = await supabase
        .from("ipo_companies")
        .update({ infographic_url: imageUrl })
        .eq("id", co.id);

      const downloadPath = `/api/download-infographic?url=${encodeURIComponent(imageUrl)}&name=${encodeURIComponent(`${co.name}-infographic.png`)}`;

      if (updateError) {
        results.push({ name: co.name, ok: false, detail: `保存失敗: ${updateError.message}`, url: imageUrl });
      } else {
        results.push({ name: co.name, ok: true, detail: force ? "再生成・保存OK" : "生成・保存OK", url: imageUrl, downloadPath });
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
