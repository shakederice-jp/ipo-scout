import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { changeRatePct } from "@/lib/yahoo-price";

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

    // 2026/9/26追加: 上場日終値(initial_price)が先に入っている銘柄は、公募価格を入れた(直した)
    // 時点で騰落率(price_change_rate)も計算し直す。以前は公募価格が後から埋まると騰落率が
    // 空欄のまま残り、トップページの「▲+◯%」表示などが出なかった。
    {
      const { data: row } = await supabase.from("ipo_companies").select("initial_price").eq("id", company_id).single();
      const initial = row?.initial_price != null ? Number(row.initial_price) : null;
      if (initial != null) {
        await supabase
          .from("ipo_companies")
          .update({ price_change_rate: changeRatePct(initial, price) })
          .eq("id", company_id);
      }
    }

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
        // 調達額から数値のみ抽出(億円単位の場合は百万円に変換)
        const rawFundraising = structured?.ipo_details?.fundraising_amount ?? null;
        let fundraising = null;
        if (rawFundraising) {
          const str = String(rawFundraising);
          // 「782百万円」「7.82億円」などから数値を抽出
          const hyakumanMatch = str.match(/([0-9,]+(?:\.[0-9]+)?)\s*百万円/);
          const okuMatch = str.match(/([0-9,]+(?:\.[0-9]+)?)\s*億円/);
          const senmanMatch = str.match(/([0-9,]+(?:\.[0-9]+)?)\s*千万円/);
          if (hyakumanMatch) {
            fundraising = Math.round(parseFloat(hyakumanMatch[1].replace(/,/g, "")));
          } else if (okuMatch) {
            fundraising = Math.round(parseFloat(okuMatch[1].replace(/,/g, "")) * 100);
          } else if (senmanMatch) {
            fundraising = Math.round(parseFloat(senmanMatch[1].replace(/,/g, "")) * 10);
          } else {
            // 数字のみ抽出
            const numMatch = str.match(/([0-9,]+)/);
            if (numMatch) fundraising = Math.round(parseFloat(numMatch[1].replace(/,/g, "")));
          }
        }
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