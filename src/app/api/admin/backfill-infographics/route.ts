import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createInfographic } from "@/lib/infographic";
import { buildRevenueChartData } from "@/lib/ipo-revenue-chart";
import { buildIpoIntroText } from "@/lib/ipo-intro-text";

export const maxDuration = 90;

// インフォグラフィックと、それに添える紹介文(X投稿用の文章をそのまま流用)は、
// マーケットトレンドページの「🆕 新規IPO紹介」カテゴリーに表示される
// (2026/8/29、サイトの分析ページへの表示はやめ、こちらに一本化した)。
// この管理ツールは、まだ画像を持っていない銘柄からまとめて(1回あたり最大3件)
// 生成・保存する。過去に分析済みでまだ紹介記事になっていない銘柄をトレンドページに
// 反映させたい場合などに使う。
// 1回のクリックで終わらない場合は、残り件数が0になるまで繰り返し押してもらう想定。
//
// force=true が指定された場合は「未生成の銘柄」ではなく「listing_dateが新しい順の銘柄」を
// offset位置から3件対象にし、infographic_urlが既にあっても上書きで再生成する。
// デザインを刷新した際(2026/8/29)などに、既存画像・記事を新デザインで作り直すために使う。
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
    .select("id, name, sector, analysis_summary, listing_date, exchange, ticker, structured_data, analysis_market, ai_summary")
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

      const chartData = buildRevenueChartData((co as any).structured_data?.key_metrics);
      const insightBody =
        summary.insights?.[0]?.body || (co as any).ai_summary || `${co.name}のIPOです。詳しい分析はサイトでご覧いただけます。`;
      const hookText = ((co as any).ai_summary || insightBody || "").slice(0, 60);

      const imageUrl = await createInfographic({
        companyId: co.id,
        companyName: co.name,
        sector: (co as any).sector ?? "",
        grade: summary.grade,
        score: summary.total_score,
        chartData,
        hook: hookText,
      });

      if (!imageUrl) {
        results.push({ name: co.name, ok: false, detail: "生成に失敗しました" });
        continue;
      }

      const { error: updateError } = await supabase
        .from("ipo_companies")
        .update({ infographic_url: imageUrl })
        .eq("id", co.id);

      // マーケットトレンドページの「新規IPO紹介」カテゴリーに表示する記事も
      // あわせて作成・更新する。本文は、X投稿用に組み立てている詳しい紹介文
      // (上場日・市場・コード・売上・利益・主幹事+AIの一言)をそのまま使う
      // (2026/8/29、ai_summaryだけの短い文章に変更したところ「文字数が減って
      // 冷たい感じになった」とのフィードバックを受け、Xの競合対策で作った文章に戻した)。
      const analysisUrl = `https://ipo.finance-tower.com/analysis/${co.id}`;
      const introText = buildIpoIntroText(co as any, insightBody, "新規IPO承認");
      const trendsContent = `${introText}\n\n${analysisUrl}`;
      const { error: trendsError } = await supabase.from("market_trends").upsert({
        source: "IPO分析システム",
        title: `新規IPO紹介(${co.name})`,
        url: analysisUrl,
        summary: null,
        sector: (co as any).sector || "その他",
        sector_score: 8,
        ai_comment: null,
        is_featured: true,
        is_theme_article: true,
        content: trendsContent,
        image_url: imageUrl,
        source_links: [
          { title: `${co.name}の詳細分析ページ`, url: `https://ipo.finance-tower.com/analysis/${co.id}`, source: "自社分析" },
        ],
        fetched_at: new Date().toISOString(),
        external_id: `new-ipo-intro-${co.id}`,
      }, { onConflict: "external_id" });
      if (trendsError) {
        console.error(`market_trends(新規IPO紹介)保存失敗(${co.name}):`, trendsError.message);
      }

      const downloadPath = `/api/download-infographic?url=${encodeURIComponent(imageUrl)}&name=${encodeURIComponent(`${co.name}-infographic.png`)}`;

      if (updateError) {
        results.push({ name: co.name, ok: false, detail: `保存失敗: ${updateError.message}`, url: imageUrl });
      } else {
        results.push({
          name: co.name,
          ok: true,
          detail: (force ? "再生成・保存OK" : "生成・保存OK") + (trendsError ? `(トレンド記事の保存は失敗: ${trendsError.message})` : "・トレンドページにも反映済み"),
          url: imageUrl,
          downloadPath,
        });
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
