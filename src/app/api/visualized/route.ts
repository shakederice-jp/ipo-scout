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
  const prompt = `
以下はIPO企業「${co.name}」の構造化データです。
このデータから視覚化用のJSONを生成してください。

【構造化データ】
${JSON.stringify(sd, null, 2)}

【指示】
以下の3種類の視覚化データをJSON形式で返してください。
データが不明・不足の場合はnullを返してください。

必ずJSONのみを返し、説明文や```は不要です。

{
  "revenue_chart": {
    "available": true/false,
    "title": "売上・利益推移",
    "data": [
      {"year": "2022年8月期", "revenue": 数値(百万円), "profit": 数値(百万円)},
      ...
    ],
    "citation": "目論見書・財務情報によると〜"
  },
  "shareholders_chart": {
    "available": true/false,
    "title": "株主構成",
    "data": [
      {"name": "株主名", "ratio": 数値(%), "type": "創業者/VC/機関投資家/その他", "lockup": true/false},
      ...
    ],
    "lockup_info": "ロックアップ条件の説明",
    "citation": "目論見書・株主構成によると〜"
  },
  "valuation_table": {
    "available": true/false,
    "title": "バリュエーション指標",
    "ipo_price": 数値,
    "market_cap": 数値(百万円),
    "per": 数値,
    "pbr": 数値,
    "float_ratio": 数値(%),
    "fundraising": 数値(百万円),
    "comment": "割安・割高の判定コメント",
    "citation": "目論見書・IPO詳細によると〜"
  }
}
`;

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