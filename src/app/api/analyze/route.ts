import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const company = await req.json();

  const prompt = `あなたはIPO分析の専門家です。以下のIPO企業を分析し、必ずJSON形式のみで回答してください。

企業情報:
- 企業名: ${company.name}
- セクター: ${company.sector}
- 業態: ${company.biz_type}
- 取引所: ${company.exchange}
- 上場日: ${company.listing_date}

以下のJSON形式で回答してください（他の文章は一切含めないこと）:
{
  "summary": "200文字程度の詳細な事業概要と投資ポイント",
  "bb_score": 0から100の数値,
  "initial_score": 0から100の数値,
  "supply_score": 0から100の数値,
  "mid_growth_score": 0から100の数値,
  "mid_profit_score": 0から100の数値,
  "mid_market_score": 0から100の数値,
  "long_moat_score": 0から100の数値,
  "long_esg_score": 0から100の数値,
  "long_global_score": 0から100の数値,
  "total_score": 0から100の数値,
  "grade": "S・A・B・C・Dのいずれか",
  "highlight_reason": "注目銘柄なら50文字以内の理由、そうでなければnull"
}`;

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = (message.content[0] as { type: string; text: string }).text;
  const json = JSON.parse(text);

  return NextResponse.json(json);
}