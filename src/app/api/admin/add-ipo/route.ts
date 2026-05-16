import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { name, ticker, exchange, listing_date, bb_start_date, apply_start_date } = await req.json();

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `以下のIPO企業を分析し、必ず下記JSONのみで回答してください。

企業名: ${name}
ティッカー: ${ticker}
取引所: ${exchange}

{"sector":"セクター名","biz_type":"業態・ビジネスモデル","ai_summary":"150文字程度の事業概要","ai_score":70,"highlight":false,"highlight_reason":null}`
      }],
    });

    const text = (message.content[0] as any).text;
    const clean = text.replace(/```json|```/g, "").trim();
    const ai = JSON.parse(clean);

    const supabase = createSupabaseServerClient();
    if (!supabase) throw new Error("Supabase接続エラー");

    const { data, error } = await supabase
      .from("ipo_companies")
      .insert({
        name, ticker, exchange,
        listing_date: listing_date || null,
        bb_start_date: bb_start_date || null,
        apply_start_date: apply_start_date || null,
        sector: ai.sector,
        biz_type: ai.biz_type,
        ai_summary: ai.ai_summary,
        ai_score: ai.ai_score,
        highlight: ai.highlight ?? false,
        status: "仮条件決定前",
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ name: data.name });

  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}