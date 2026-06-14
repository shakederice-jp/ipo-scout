import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const anthropic = new Anthropic();

export const maxDuration = 60;

const CHART_TYPES = ["revenue_chart", "shareholders_chart", "valuation_table", "market_structure_chart"] as const;
type ChartType = typeof CHART_TYPES[number];

const MAX_TOKENS: Record<ChartType, number> = {
  revenue_chart: 2000,
  shareholders_chart: 4000,
  valuation_table: 2000,
  market_structure_chart: 2500,
};

function buildPrompt(chartType: ChartType, name: string, sd: any, market: any): string {
  const header = `You are a financial data extractor. Extract visualization data from this IPO company structured data and return ONLY valid JSON with no explanation or markdown.

Company: ${name}
Data: ${JSON.stringify(sd, null, 2)}

IMPORTANT RULES:`;

  if (chartType === "revenue_chart") {
    return `${header}
- "citation" fields MUST be natural Japanese sentences, like "目論見書の財務情報によると、売上は23.0%増加した" — NEVER output raw key:value dumps like "field_name: value".
- Use null for any numeric value that is genuinely unknown. Do not invent numbers.

Return this exact JSON structure:
{
  "revenue_chart": {
    "available": true,
    "title": "売上・利益推移",
    "data": [{"year": "2022年8月期", "revenue": 23210, "profit": 780}],
    "citation": "目論見書の財務情報によると、売上高は前年比23.0%増加し285.5億円となった"
  }
}`;
  }

  if (chartType === "shareholders_chart") {
    return `${header}
- "citation" fields MUST be natural Japanese sentences, like "目論見書の財務情報によると、売上は23.0%増加した" — NEVER output raw key:value dumps like "field_name: value".
- Include ALL entries from the input "shareholders" array, even if ratio is unknown (use null for ratio in that case). Do not drop any shareholder.
- Keep each shareholder's "type" field to a short word (e.g. "創業者", "VC", "金融機関", "個人").
- Use null for any numeric value that is genuinely unknown. Do not invent numbers.

Return this exact JSON structure:
{
  "shareholders_chart": {
    "available": true,
    "title": "株主構成",
    "data": [{"name": "name", "ratio": 50, "type": "創業者", "lockup": true}],
    "lockup_info": "創業者および主要株主にはロックアップが設定されている（期間は目論見書に記載なし）",
    "citation": "目論見書の株主構成によると、創業者および主要株主にロックアップが設定されている"
  }
}`;
  }

  if (chartType === "valuation_table") {
    return `${header}
- "citation" and "comment" fields MUST be natural Japanese sentences, like "目論見書の財務情報によると、売上は23.0%増加した" — NEVER output raw key:value dumps like "field_name: value".
- Use null for any numeric value that is genuinely unknown. Do not invent numbers.

Return this exact JSON structure:
{
  "valuation_table": {
    "available": true,
    "title": "IPO概要",
    "ipo_price": 1000,
    "market_cap": 50000,
    "per": 15.5,
    "pbr": 2.1,
    "float_ratio": 17.5,
    "fundraising": 318,
    "comment": "流通比率は推定15-20%程度で、調達額の上限は約3.2億円。IPO価格は未決定のためPER・PBR・時価総額は上場後に確定する",
    "citation": "目論見書のIPO詳細によると、流通比率は推定15-20%程度である"
  }
}`;
  }

  // market_structure_chart
  return `${header}
- "citation" fields MUST be natural Japanese sentences, like "目論見書のIPO詳細によると、流通比率は17.5%である" — NEVER output raw key:value dumps like "field_name: value".
- For share_structure_chart: use ipo_details.total_shares and ipo_details.float_ratio to compute "上場時流通株式数" (= total_shares × float_ratio / 100) and "ロックアップ対象等の非流通株式数" (= total_shares − 上場時流通株式数). The "ratio" values across data entries must sum to approximately 100. If public_shares and overallotment are also clearly available, you may further split "上場時流通株式" into "公募・売出（新規発行分）" and "オーバーアロットメント" categories instead — but the total ratios must still sum to 100. If total_shares or float_ratio is unavailable, set available to false and data to [].
- For recent_ipo_chart: using the "Recent IPO market data" below, extract a numeric "performance" value (percentage, can be negative, e.g. 25 or -10) for each entry in recent_ipos by parsing its "result" field. If recent_ipos is empty or no entries have a parseable numeric result, set available to false and data to [].
- Use null for any numeric value that is genuinely unknown. Do not invent numbers.

Recent IPO market data: ${JSON.stringify(market ?? {}, null, 2)}

Return this exact JSON structure:
{
  "share_structure_chart": {
    "available": true,
    "title": "株式構成（上場時）",
    "data": [
      {"label": "上場時流通株式", "shares": 350000, "ratio": 17.5},
      {"label": "ロックアップ対象等", "shares": 1650000, "ratio": 82.5}
    ],
    "citation": "目論見書のIPO詳細によると、流通比率は17.5%である"
  },
  "recent_ipo_chart": {
    "available": true,
    "title": "直近の同業種IPO 初値パフォーマンス",
    "data": [{"name": "企業名", "performance": 25}],
    "citation": "市場動向調査によると、直近の同業種IPOは好調な初値を記録した"
  }
}`;
}

export async function POST(req: NextRequest) {
  const { companyId, chart_type, save_results } = await req.json();
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  const supabase = (await createSupabaseServerClient())!;

  // 保存モード：チャート分まとめて受け取って保存
  if (save_results) {
    const { error: saveError } = await supabase
      .from("ipo_companies")
      .update({ visualization_data: save_results })
      .eq("id", companyId);

    if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (!chart_type || !CHART_TYPES.includes(chart_type)) {
    return NextResponse.json(
      { error: "chart_type は revenue_chart / shareholders_chart / valuation_table / market_structure_chart のいずれかを指定してください" },
      { status: 400 }
    );
  }

  const { data: co, error } = await supabase
    .from("ipo_companies")
    .select("structured_data, raw_prospectus, name, analysis_market")
    .eq("id", companyId)
    .single();

  if (error || !co) return NextResponse.json({ error: "not found" }, { status: 404 });

  const sd = co.structured_data as any;
  const market = (co as any).analysis_market;
  const prompt = buildPrompt(chart_type as ChartType, (co as any).name, sd, market);

  try {
    const message = await anthropic.messages.create(
      {
        model: "claude-haiku-4-5",
        max_tokens: MAX_TOKENS[chart_type as ChartType] ?? 2000,
        messages: [{ role: "user", content: prompt }],
      },
      { timeout: 55000 }
    );

    const text = (message.content[0] as any).text;
    const clean = text.replace(/```json|```/g, "").trim();
    const chartData = JSON.parse(clean);

    return NextResponse.json({ success: true, chart_type, data: chartData });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}