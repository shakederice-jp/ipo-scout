import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const anthropic = new Anthropic();
export const maxDuration = 60;

const CHART_TYPES = ["revenue_chart", "shareholders_chart", "valuation_table", "market_structure_chart", "ipo_summary_table", "use_of_proceeds_table", "risk_table", "shareholders_lockup_table", "key_metrics_table"] as const;
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
  key_metrics_table: 1000,
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
    // "15-20%", "15～20%程度" → midpoint（範囲を示す記号がある場合のみ。小数点は範囲とみなさない）
    const range = val.match(/(\d+(?:\.\d+)?)\s*[~〜\-ー]\s*(\d+(?:\.\d+)?)/);
    if (range) return (parseFloat(range[1]) + parseFloat(range[2])) / 2;
    const single = val.match(/(\d+(?:\.\d+)?)/);
    if (single) return parseFloat(single[1]);
  }
  return null;
}
// public_sharesの文字列（例："公募100,000株、売出1,050,000株"）から公募株数だけを取り出す
function parsePublicOfferingShares(val: any): number | null {
  if (typeof val !== "string") return null;
  const m = val.match(/公募[^0-9]{0,5}([0-9,]+)\s*株/);
  if (!m) return null;
  return parseInt(m[1].replace(/,/g, ""), 10);
}
// "△9.77円" や "15.1%" のような文字列を数値に変換（△は日本の会計でマイナスを表す）
function parseJpNumber(val: any): number | null {
  if (typeof val === "number") return val;
  if (typeof val !== "string") return null;
  const isNegative = val.includes("△") || val.includes("▲") || val.trim().startsWith("-");
  const m = val.replace(/,/g, "").match(/([0-9]+(?:\.[0-9]+)?)/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  return isNegative ? -num : num;
}
function buildPrompt(chartType: ChartType, name: string, sd: any, market: any): string {
  const header = `You are a financial data extractor. Extract visualization data from this IPO company structured data and return ONLY valid JSON with no explanation or markdown.

Company: ${name}
Data: ${JSON.stringify(sd, null, 2)}

CRITICAL: Your response must be a JSON object containing EXACTLY the top-level key(s) shown in the example structure below — nothing more. Do NOT invent or add any additional chart types, additional keys, or extra analysis beyond what is explicitly requested.

IMPORTANT RULES:`;

if (chartType === "revenue_chart") {
  return `${header}
- "citation" fields MUST be natural Japanese sentences — NEVER output raw key:value dumps.
- Use null for any numeric value that is genuinely unknown. Do not invent numbers.
- CRITICAL UNIT RULE: "revenue" and "profit" values MUST be in 百万円（millions of yen）units. Convert as needed: if the source data is in 千円（thousands of yen）, divide by 1,000. If the source data is in 億円（hundred-millions of yen）, multiply by 100. Example: "2,855,346千円" → 2855 (百万円). "285.5億円" → 28550 (百万円). Double-check your conversion before output — a value like 2855346 is WRONG (that means you forgot to convert from 千円).
- - "profit" must be 営業利益（operating profit）specifically, taken from financials.profit_trend. Do NOT substitute 経常利益（ordinary profit）or any other profit type, and do not use that term in the title/citation either.
- The "citation" sentence MUST describe the exact same 営業利益 figures you used in the "data" array above (not 経常利益 from key_metrics or any other source). Before writing the citation, double-check that the profit number you mention matches the "profit" value for that year in your own "data" array.

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
- If a value is genuinely unknown or not stated, use "目論見書に記載なし" as the value (not null).
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
      {"label": "ロックアップ期間", "value": "目論見書に記載なし"}
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
    .select("structured_data, name, analysis_market, ipo_price")
    .eq("id", companyId)
    .single();

  if (error || !co) return NextResponse.json({ error: "not found" }, { status: 404 });

  const sd = co.structured_data as any;
  const market = (co as any).analysis_market;

  // market_structure_chart: share_structure_chartはTS側で計算
  if (chart_type === "market_structure_chart") {
    const ipoDetails = sd?.ipo_details ?? {};
    const existingShares = parseNumericShares(ipoDetails.total_shares);
    const newShares = parsePublicOfferingShares(ipoDetails.public_shares);
    const totalShares = (existingShares !== null && newShares !== null)
      ? existingShares + newShares
      : existingShares;
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
        citation: `目論見書のIPO詳細によると、上場後発行済株式総数${totalShares.toLocaleString()}株に対し流通比率は推定${floatRatio}%程度である`,
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
    name: s?.name ?? "目論見書に記載なし",
    shares: s?.shares ?? "目論見書に記載なし",
    ratio: s?.ratio ?? "目論見書に記載なし",
    type: s?.type ?? "目論見書に記載なし",
    lockup: s?.lockup ?? "目論見書に記載なし",
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

// key_metrics_table: 構造化済みデータをそのまま使い、PER・PBRはIPO価格が入力されていれば自動計算する
if (chart_type === "key_metrics_table") {
  const keyMetrics: any[] = Array.isArray(sd?.key_metrics) ? sd.key_metrics : [];
  const latest = keyMetrics.length > 0 ? keyMetrics[keyMetrics.length - 1] : null;

  const ipoPrice = (co as any).ipo_price ?? null;
  const latestEps = latest ? parseJpNumber(latest.eps) : null;
  const latestBps = latest ? parseJpNumber(latest.bps) : null;
  const per = (ipoPrice && latestEps && latestEps > 0) ? Math.round((ipoPrice / latestEps) * 10) / 10 : null;
  const pbr = (ipoPrice && latestBps && latestBps > 0) ? Math.round((ipoPrice / latestBps) * 100) / 100 : null;

  return NextResponse.json({
    success: true,
    chart_type,
    data: {
      key_metrics_table: {
        available: keyMetrics.length > 0,
        title: "主要経営指標の推移",
        trend_rows: keyMetrics,
        latest_summary: latest ? {
          period: latest.period,
          equity_ratio: latest.equity_ratio,
          roe: latest.roe,
          eps: latest.eps,
          bps: latest.bps,
        } : null,
        per,
        pbr,
        ipo_price: ipoPrice,
        citation: keyMetrics.length > 0
          ? `目論見書の主要経営指標等の推移によると、直近期（${latest?.period ?? ""}）の自己資本比率は${latest?.equity_ratio ?? "不明"}、自己資本利益率（ROE）は${latest?.roe ?? "不明"}である。`
          : "",
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
    // 念のため、頼んだchart_type以外の余計なキーは全て捨てる（Claudeが余計なデータを作ってしまった場合の保険）
    const filtered = { [chart_type]: chartData[chart_type] };
    return NextResponse.json({ success: true, chart_type, data: filtered });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}