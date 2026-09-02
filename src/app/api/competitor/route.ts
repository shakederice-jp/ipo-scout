import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchCompetitorFinancials } from "@/lib/competitor-financials";

// 2026/9/2: EDINET取得・Haikuでの財務データ抽出ロジックは
// src/lib/competitor-financials.ts に共通関数として切り出した
// (マーケットトレンドの新テーマ「IPO企業 vs 競合の決算比較」からも
//  同じ処理を呼べるようにするため。あわせてEDINETの誤ったホスト名の
//  バグもそちらで修正済み)。このルート自体は管理画面の手動ボタン用の
//  薄いラッパーとして残す。

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { company_id } = await req.json();
    if (!company_id) return NextResponse.json({ error: "company_id required" }, { status: 400 });

    const supabase = getSupabase();

    const { data: co, error } = await supabase
      .from("ipo_companies")
      .select("analysis_market")
      .eq("id", company_id)
      .single();

    if (error || !co) return NextResponse.json({ error: "企業が見つかりません" }, { status: 404 });

    const competitors: any[] = co.analysis_market?.competitors ?? [];
    if (competitors.length === 0) {
      return NextResponse.json({ error: "競合他社情報がありません。先に⑦市場・競合情報収集を実行してください。" }, { status: 400 });
    }

    const results = await fetchCompetitorFinancials(company_id, supabase);

    return NextResponse.json({ success: true, results });

  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
