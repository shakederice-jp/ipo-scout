import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const company = await req.json();
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `以下のIPO企業を分析し、必ず下記のJSONフォーマットのみで回答してください。他の文章やキーは一切含めないこと。

企業名: ${company.name}
セクター: ${company.sector}
業態: ${company.biz_type}
取引所: ${company.exchange}

{"summary":"200文字程度の詳細な分析テキスト","bb_score":75,"initial_score":75,"supply_score":70,"mid_growth_score":70,"mid_profit_score":65,"mid_market_score":68,"long_moat_score":60,"long_esg_score":55,"long_global_score":50,"total_score":70,"grade":"B","highlight_reason":null}`
      }],
    });

    const text = (message.content[0] as any).text;
    const clean = text.replace(/```json|```/g, "").trim();
    const raw = JSON.parse(clean);

    // 構造の違いを吸収
    const result = {
      summary: raw.summary ?? raw.analysis?.summary ?? "",
      bb_score: raw.bb_score ?? raw.analysis?.scores?.bb_score ?? 70,
      initial_score: raw.initial_score ?? raw.analysis?.scores?.initial_score ?? 70,
      supply_score: raw.supply_score ?? raw.analysis?.scores?.supply_score ?? 65,
      mid_growth_score: raw.mid_growth_score ?? raw.analysis?.scores?.mid_growth_score ?? 65,
      mid_profit_score: raw.mid_profit_score ?? raw.analysis?.scores?.mid_profit_score ?? 60,
      mid_market_score: raw.mid_market_score ?? raw.analysis?.scores?.mid_market_score ?? 62,
      long_moat_score: raw.long_moat_score ?? raw.analysis?.scores?.long_moat_score ?? 55,
      long_esg_score: raw.long_esg_score ?? raw.analysis?.scores?.long_esg_score ?? 50,
      long_global_score: raw.long_global_score ?? raw.analysis?.scores?.long_global_score ?? 48,
      total_score: raw.total_score ?? 65,
      grade: raw.grade ?? "B",
      highlight_reason: raw.highlight_reason ?? null,
    };

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Analyze error:", error?.message);
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}