import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { company_id, ipo_price } = await req.json();
    if (!company_id) return NextResponse.json({ error: "company_id is required" }, { status: 400 });

    const supabase = getSupabase();
    const price = ipo_price === "" || ipo_price === null ? null : Number(ipo_price);

    // まず公募価格を保存
    const { error } = await supabase
      .from("ipo_companies")
      .update({ ipo_price: price })
      .eq("id", company_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 公募価格がある場合はvisualization_dataも自動更新
    if (price) {
      const { data: company } = await supabase
        .from("ipo_companies")
        .select("structured_data, visualization_data, analysis_summary")
        .eq("id", company_id)
        .single();

      if (company) {
        const structured = company.structured_data;
        const vizData = company.visualization_data ?? {};
        const analysisSummary = company.analysis_summary;

        // structured_dataから株数・財務データを取得
        const totalShares = structured?.ipo_details?.total_shares
          ? Number(String(structured.ipo_details.total_shares).replace(/[^0-9]/g, ""))
          : null;
        const floatRatio = structured?.ipo_details?.float_ratio ?? null;
        const fundraising = structured?.ipo_details?.fundraising_amount ?? null;

        // 時価総額を計算(株数×公募価格 → 百万円単位)
        const marketCap = totalShares && price
          ? Math.round((totalShares * price) / 1000000)
          : null;

        // PER・PBRはanalysis_summaryのaxes_scoresから取得(あれば)
        // またはkey_metrics_tableから取得
        const per = vizData?.key_metrics_table?.per ?? null;
        const pbr = vizData?.key_metrics_table?.pbr ?? null;

        // valuation_tableを更新
        const updatedVizData = {
          ...vizData,
          valuation_table: {
            ...(vizData?.valuation_table ?? {}),
            available: true,
            ipo_price: price,
            market_cap: marketCap,
            per: per,
            pbr: pbr,
            float_ratio: floatRatio,
            fundraising: fundraising,
            comment: vizData?.valuation_table?.comment ?? null,
            citation: vizData?.valuation_table?.citation ?? null,
            title: "バリュエーション指標",
          },
        };

        await supabase
          .from("ipo_companies")
          .update({ visualization_data: updatedVizData })
          .eq("id", company_id);
      }
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}