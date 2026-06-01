import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { company_id } = await req.json();
    const supabase = getSupabase();

    const { data: company, error } = await supabase
      .from("ipo_companies")
      .select("name, sector, raw_prospectus")
      .eq("id", company_id)
      .single();

    if (error || !company) {
      return NextResponse.json({ error: "銘柄が見つかりません" }, { status: 404 });
    }

    if (!company.raw_prospectus) {
      return NextResponse.json({ error: "EDINETデータがありません。先に①取得を実行してください。" }, { status: 400 });
    }

    const rawText = JSON.stringify(company.raw_prospectus).slice(0, 25000);

    const msg = await claude.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `以下は日本のIPO企業「${company.name}」の目論見書テキストです。
重要な財務・事業データを抽出し、JSONのみで返してください。前置き・後置き・マークダウン記号は一切不要です。

【目論見書テキスト】
${rawText}

【抽出するJSON形式】
{"company_name":"企業名","business_summary":"事業内容の要約（200字以内）","financials":{"revenue_trend":"売上高の推移","profit_trend":"営業利益の推移","profit_margin":"直近の営業利益率","cash_flow":"営業キャッシュフローの状況"},"ipo_details":{"fundraising_amount":"調達金額","use_of_proceeds":"資金使途の要約","lockup_info":"ロックアップ情報"},"shareholders":[{"name":"株主名","ratio":"保有比率","type":"創業者/VC/事業会社"}],"risks":[{"title":"リスクタイトル","severity":"高/中/低","description":"内容（50字以内）"}],"management":"経営陣の主な情報","growth_drivers":"成長要因（3点）","concerns":"懸念点（3点）"}`
        },
        {
          role: "assistant",
          content: '{"company_name":"'
        }
      ]
    });

    const raw2 = (msg.content[0] as any).text ?? "";
    const text = '{"company_name":"' + raw2;

    let structured: any = null;
    try {
      structured = JSON.parse(text);
    } catch {
      const lastBrace = text.lastIndexOf('}');
      if (lastBrace > 0) {
        try { structured = JSON.parse(text.slice(0, lastBrace + 1)); } catch { structured = null; }
      }
    }

    if (!structured) {
      return NextResponse.json({ error: "データの構造化に失敗しました。再試行してください。" }, { status: 500 });
    }

    await supabase.from("ipo_companies").update({
      structured_data: structured,
      analysis_detail: null,
    }).eq("id", company_id);

    return NextResponse.json({
      success: true,
      message: `✅ 構造化完了！次に「③Claudeで分析」を実行してください。`,
      preview: {
        business: structured.business_summary?.slice(0, 80),
        financials: structured.financials?.revenue_trend,
        risks_count: structured.risks?.length ?? 0,
      }
    });

  } catch (e: any) {
    console.error("structure error:", e?.message);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}