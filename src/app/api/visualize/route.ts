import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const anthropic = new Anthropic();
export const maxDuration = 60;

const CHART_TYPES = ["revenue_chart", "shareholders_chart", "valuation_table", "market_structure_chart", "ipo_summary_table", "use_of_proceeds_table", "risk_table", "shareholders_lockup_table"] as const;
type ChartType = typeof CHART_TYPES[number];

const MAX_TOKENS: Record<ChartType, number> = {
  revenue_chart: 2000,
  shareholders_chart: 4000,
  valuation_table: 4000,
  market_structure_chart: 2000,
  ipo_summary_table: 2000,
  use_of_proceeds_table: 2000,
  risk_table: 3000,
  shareholders_lockup_table: 1000,
};

// 文字列から数値を抽出するヘルパー
function parseNumericShares(val: any): number | null {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const cleaned = val.replace(/,/g, "").replace(/株/g, "").trim();
    const m = cleaned.match(/(\d+)/);
    return m ? parseInt(m[1]) : null;
  }
  return null;
}

function parseFloatRatio(val: any): number | null {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    // "15-20%", "15～20%程度" → midpoint
    const range = val.match(/(\d+(?:\.\d+)?)[^\d]+(\d+(?:\.\d+)?)/);
    if (range) return (parseFloat(range[1]) + parseFloat(range[2])) / 2;
    const single = val.match(/(\d+(?:\.\d+)?)/);
    if (single) return parseFloat(single[1]);
  }
  return null;
}

function buildPrompt(chartType: ChartType, name: string, sd: any, market: any): string {
  const header = `You are a financial data extractor. Extract visualization data from this IPO company structured data and return ONLY valid JSON with no explanation or markdown.

Company: ${name}
Data: ${JSON.stringify(sd, null, 2)}

IMPORTANT RULES:`;

  if (chartType === "revenue_chart") {
    return `${header}
- "citation" fields MUST be natural Japanese sentences — NEVER output raw key:value dumps.
- Use null for any numeric value that is genuinely unknown. Do not invent numbers.

Return this exact JSON structure:
{
  "revenue_chart": {
    "available": true,
    "title": "売上高・営業利益推移",
    "data": [{"year": "2023年8月期", "revenue": 23210, "profit": 780}],
    "citation": "目論見書の財務情報によると、2024年8月期の売上高は前年比23.0%増加し285.5億円となった"
  }
}`;
  }

  if (chartType === "shareholders_chart") {
    return `${header}
- "citation" fields MUST be natural Japanese sentences — NEVER output raw key:value dumps.
- Include ALL entries from the input shareholders array. Use null for unknown ratios.
- Use null for any numeric value that is genuinely unknown. Do not invent numbers.

Return this exact JSON structure:
{
  "shareholders_chart": {
    "available": true,
    "title": "株主構成",
    "data": [{"name": "name", "ratio": 50, "type": "創業者", "lockup": true}],
    "lockup_info": "創業者および主要株主にはロックアップが設定されている（具体的な期間は目論見書に記載なし）",
    "citation": "目論見書の株主構成によると、創業者および主要株主にロックアップが設定されている"
  }
}`;
  }

  if (chartType === "valuation_table") {
    return `${header}
- "citation" and "comment" fields MUST be natural Japanese sentences — NEVER output raw key:value dumps.
- Use null for any numeric value that is genuinely unknown. Do not invent numbers.

Return this exact JSON structure:
{
  "valuation_table": {
    "available": true,
    "title": "IPO概要",
    "ipo_price": null,
    "market_cap": null,
    "per": null,
    "pbr": null,
    "float_ratio": 17.5,
    "fundraising": 318,
    "comment": "流通比率は推定15～20%程度。IPO価格は未決定のためPER・PBR・時価総額は上場後に確定する",
    "citation": "目論見書のIPO詳細によると、推定流通比率は15～20%程度である"
  }
}`;
  }
  if (chartType === "ipo_summary_table") {
    return `${header}
- "citation" fields MUST be natural Japanese sentences — NEVER output raw key:value dumps.
- Extract from ipo_details: 公開株数（公募+売出の合計株数）, オーバーアロットメント（金額・有無）, 調達額（合計上限）, 流通比率, ロックアップ対象, ロックアップ期間. Use the original text values as-is (no need to compute or convert units).
- If a value is genuinely unknown or not stated, use "記載なし" as the value (not null).
- Do not invent numbers.

Return this exact JSON structure:
{
  "ipo_summary_table": {
    "available": true,
    "title": "IPO条件・資金調達サマリー",
    "rows": [
      {"label": "公開株数（公募+売出）", "value": "100,000株"},
      {"label": "オーバーアロットメント", "value": "上限222,525,000円相当"},
      {"label": "調達額（上限）", "value": "318,403千円"},
      {"label": "流通比率", "value": "推定15〜20%程度"},
      {"label": "ロックアップ対象", "value": "創業者・主要株主"},
      {"label": "ロックアップ期間", "value": "記載なし"}
    ],
    "citation": "目論見書のIPO概要によると、公募及び売出による調達額の上限は318,403千円である"
  }
}`;
  }

  if (chartType === "use_of_proceeds_table") {
    return `${header}
- "citation" fields MUST be natural Japanese sentences — NEVER output raw key:value dumps.
- Extract from ipo_details.use_of_proceeds (and fundraising_amount if helpful). List each distinct use-of-funds item as a separate row, using the company's own wording for the category (do NOT force-fit into generic categories like 設備投資/人件費/広告費 unless the prospectus actually uses those terms).
- "amount" is the original display string exactly as stated (e.g. "173,520千円").
- "amount_value" is the SAME amount converted to a plain number in 千円 (thousand-yen) units, for charting. Examples: "173,520千円" → 173520. "1.5億円" → 150000. "2,000万円" → 200. "3,000,000円" → 3000. If the amount is not a parseable number (e.g. "未定" or a percentage only), set amount_value to null.
- "timing" should be the fiscal year/period the funds will be used in, if stated (e.g. "2027年8月期"). Omit (set to null) if not stated.
- If use_of_proceeds information is too vague to break into rows (e.g. just one general sentence with no amounts), set available to false and rows to [].
- Do not invent numbers.

Return this exact JSON structure:
{
  "use_of_proceeds_table": {
    "available": true,
    "title": "調達資金の使途",
    "rows": [
      {"category": "既存事業の直営店新規出店資金", "amount": "173,520千円", "amount_value": 173520, "timing": "2027年8月期"},
      {"category": "既存事業の直営店新規出店資金", "amount": "144,882千円", "amount_value": 144882, "timing": "2028年8月期"}
    ],
    "citation": "目論見書によると、調達資金は既存事業の直営店新規出店資金に充当される予定である"
  }
}`;
  }
  if (chartType === "risk_table") {
    return `${header}
- "citation" fields MUST be natural Japanese sentences — NEVER output raw key:value dumps.
- For each entry in the input "risks" array, classify it into a short Japanese category label based on its content (e.g. "競合", "法的規制", "市場・人口動態", "為替・海外事業", "人材・組織", "技術・セキュリティ", "顧客・取引先依存" etc — choose whatever label best fits each risk's actual content, do not force-fit into a fixed list).
- Keep the original "severity" (高/中/低) and "description" from the input as-is. Use the risk's "title" as well.
- Include ALL risks from the input array, do not omit or summarize them away.
- Do not invent risks that aren't in the input data.

Return this exact JSON structure:
{
  "risk_table": {
    "available": true,
    "title": "事業等のリスク（重要度別）",
    "rows": [
      {"category": "市場・人口動態", "severity": "高", "title": "人口動態の変化", "description": "少子化による既存店収支及び新規出店計画への影響"}
    ],
    "citation": "目論見書に記載されたリスク要因を、市場・法的規制・人材などのカテゴリ別に整理した"
  }
}`;
  }
  // market_structure_chart: recent_ipo_chartのみClaudeに依頼
  return `${header}
- "citation" fields MUST be natural Japanese sentences — NEVER output raw key:value dumps.
- For recent_ipo_chart: using the Recent IPO market data below, extract a numeric "performance" value (percentage, can be negative, e.g. 25 or -10) for each entry in recent_ipos by parsing its "result" field. If recent_ipos is empty or no entries have a parseable numeric result, set available to false and data to [].
- Do not invent numbers.

Recent IPO market data: ${JSON.stringify(market ?? {}, null, 2)}

Return this exact JSON structure:
{
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

  if (save_results) {
    const { error: saveError } = await supabase
      .from("ipo_companies")
      .update({ visualization_data: save_results })
      .eq("id", companyId);
    if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (!chart_type || !CHART_TYPES.includes(chart_type)) {
    return NextResponse.json({ error: "chart_type が不正です" }, { status: 400 });
  }

  const { data: co, error } = await supabase
    .from("ipo_companies")
    .select("structured_data, name, analysis_market")
    .eq("id", companyId)
    .single();

  if (error || !co) return NextResponse.json({ error: "not found" }, { status: 404 });

  const sd = co.structured_data as any;
  const market = (co as any).analysis_market;

  // market_structure_chart: share_structure_chartはTS側で計算
  if (chart_type === "market_structure_chart") {
    const ipoDetails = sd?.ipo_details ?? {};
    const totalShares = parseNumericShares(ipoDetails.total_shares);
    const floatRatio = parseFloatRatio(ipoDetails.float_ratio);

    let shareStructureChart: any;
    if (totalShares !== null && floatRatio !== null) {
      const floatShares = Math.round(totalShares * floatRatio / 100);
      const lockupShares = totalShares - floatShares;
      const lockupRatio = Math.round((100 - floatRatio) * 10) / 10;
      shareStructureChart = {
        available: true,
        title: "株式構成（上場時）",
        data: [
          { label: "上場時流通株式", shares: floatShares, ratio: floatRatio },
          { label: "ロックアップ対象等", shares: lockupShares, ratio: lockupRatio },
        ],
        citation: `目論見書のIPO詳細によると、発行済株式総数${totalShares.toLocaleString()}株に対し流通比率は推定${floatRatio}%程度である`,
      };
    } else {
      shareStructureChart = { available: false, title: "株式構成（上場時）", data: [], citation: "" };
    }

    // recent_ipo_chartのみClaudeに依頼
    try {
      const prompt = buildPrompt("market_structure_chart", (co as any).name, sd, market);
      const message = await anthropic.messages.create(
        { model: "claude-haiku-4-5", max_tokens: MAX_TOKENS["market_structure_chart"], messages: [{ role: "user", content: prompt }] },
        { timeout: 55000 }
      );
      const text = (message.content[0] as any).text;
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      return NextResponse.json({
        success: true,
        chart_type,
        data: { share_structure_chart: shareStructureChart, recent_ipo_chart: parsed.recent_ipo_chart },
      });
    } catch (e) {
      // recent_ipo_chartが失敗してもshare_structure_chartは返す
      return NextResponse.json({
        success: true,
        chart_type,
        data: { share_structure_chart: shareStructureChart, recent_ipo_chart: { available: false, data: [], title: "直近の同業種IPO 初値パフォーマンス", citation: "" } },
      });
    }
  }
// shareholders_lockup_table: すでに構造化済みのデータをそのまま使うのでClaude不要
if (chart_type === "shareholders_lockup_table") {
  const shareholders: any[] = Array.isArray(sd?.shareholders) ? sd.shareholders : [];
  const lockupPeriod = sd?.ipo_details?.lockup_period ?? null;
  const lockupTargets = sd?.ipo_details?.lockup_targets ?? null;

  const rows = shareholders.map((s: any) => ({
    name: s?.name ?? "不明",
    shares: s?.shares ?? "不明",
    ratio: s?.ratio ?? "不明",
    type: s?.type ?? "不明",
    lockup: s?.lockup ?? "不明",
  }));

  const citationParts: string[] = [];
  if (lockupTargets) citationParts.push(`ロックアップ対象は${lockupTargets}`);
  if (lockupPeriod) citationParts.push(`期間は${lockupPeriod}`);
  const citation = citationParts.length > 0 ? `目論見書によると、${citationParts.join("、")}である。` : "";

  return NextResponse.json({
    success: true,
    chart_type,
    data: {
      shareholders_lockup_table: {
        available: rows.length > 0,
        title: "大株主・ロックアップ情報",
        rows,
        lockup_period: lockupPeriod,
        lockup_targets: lockupTargets,
        citation,
      },
    },
  });
}

  // その他のchartType
  const prompt = buildPrompt(chart_type as ChartType, (co as any).name, sd, market);
  try {
    const message = await anthropic.messages.create(
      { model: "claude-haiku-4-5", max_tokens: MAX_TOKENS[chart_type as ChartType] ?? 2000, messages: [{ role: "user", content: prompt }] },
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