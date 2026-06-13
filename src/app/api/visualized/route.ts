import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const anthropic = new Anthropic();

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { companyId } = await req.json();
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: co, error } = await supabase
    .from("ipo_companies")
    .select("structured_data, raw_prospectus, name")
    .eq("id", companyId)
    .single();

  if (error || !co) return NextResponse.json({ error: "not found" }, { status: 404 });

  const sd = co.structured_data as any;
  const prompt = `You are a financial data extractor. Extract visualization data from this IPO company structured data and return ONLY valid JSON with no explanation or markdown.

Company: ${(co as any).name}
Data: ${JSON.stringify(sd, null, 2)}

Return this exact JSON structure (use null for unavailable data):
{
  "revenue_chart": {
    "available": true,
    "title": "売上・利益推移",
    "data": [{"year": "2022年8月期", "revenue": 23210, "profit": 780}],
    "citation": "citation text here"
  },
  "shareholders_chart": {
    "available": true,
    "title": "株主構成",
    "data": [{"name": "name", "ratio": 50, "type": "創業者", "lockup": true}],
    "lockup_info": "lockup description",
    "citation": "citation text here"
  },
  "valuation_table": {
    "available": true,
    "title": "バリュエーション指標",
    "ipo_price": 1000,
    "market_cap": 50000,
    "per": 15.5,
    "pbr": 2.1,
    "float_ratio": 17.5,
    "fundraising": 318,
    "comment": "comment here",
    "citation": "citation text here"
  }
}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = (message.content[0] as any).text;
    const clean = text.replace(/```json|```/g, "").trim();
    const vizData = JSON.parse(clean);

    await supabase
      .from("ipo_companies")
      .update({ visualization_data: vizData })
      .eq("id", companyId);

    return NextResponse.json({ success: true, data: vizData });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}