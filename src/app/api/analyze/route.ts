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
        content: `以下のIPO企業を分析し、JSONのみで回答してください。

企業名: ${company.name}
セクター: ${company.sector}
業態: ${company.biz_type}
取引所: ${company.exchange}

{"summary":"200文字程度の詳細な分析","bb_score":75,"initial_score":75,"supply_score":70,"mid_growth_score":70,"mid_profit_score":65,"mid_market_score":68,"long_moat_score":60,"long_esg_score":55,"long_global_score":50,"total_score":70,"grade":"B","highlight_reason":null}`
      }],
    });

    const text = (message.content[0] as any).text;
    const clean = text.replace(/```json|```/g, "").trim();
    const json = JSON.parse(clean);
    return NextResponse.json(json);

  } catch (error: any) {
    console.error("Analyze error:", error?.message);
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}