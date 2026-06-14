import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const AXIS_CONFIG = {
  ultra_short: {
    axes: ["float", "lockup", "timing"],
    label: "超短期（初値〜当日）",
    dbColumn: "analysis_axes_short",
  },
  short: {
    axes: ["valuation", "vc_sell", "growth"],
    label: "短期（1〜3ヶ月）",
    dbColumn: "analysis_axes_mid",
  },
  long: {
    axes: ["management", "unit_econ", "competitor"],
    label: "長期（数年〜）",
    dbColumn: "analysis_axes_long",
  },
};

const AXIS_NAMES: Record<string, string> = {
  float: "需給の軽さ（Float）",
  lockup: "ロックアップ",
  timing: "上場タイミング",
  valuation: "バリュエーション",
  vc_sell: "VC・大株主売り圧力",
  growth: "成長性",
  management: "経営陣",
  unit_econ: "ユニットエコノミクス",
  competitor: "競合環境",
};

const REPORT_SECTIONS: Record<number, string> = {
  1: `### なぜ重要か
この指標が{PERIOD}のIPO投資判断に与える影響を200〜350字程度で説明してください。

### データ分析
目論見書の具体的数値・事実を引用しながら200〜350字程度で分析してください。

### ポジティブ要因
- （箇条書き3〜4点、各40〜70字程度）`,
  2: `### ネガティブ要因・リスク
- （箇条書き3〜4点、各40〜70字程度）

### まとめ
この軸から導かれる具体的な投資判断の材料を200〜350字程度で記述してください。

### 参考文献
目論見書のどのページ・どの項目・どの開示資料を確認すべきか、必ず具体的なページ番号（「P.XX」など。正確な番号が分からない場合は推定ページ）を示しながら200字程度で記述してください。`,
};

function buildDataContext(structured: any, raw: any): string {
  if (structured && Object.keys(structured).length > 0) {
    const d = structured;
    return [
      `事業概要:${(d.business_summary??"").slice(0,300)}`,
      `売上推移:${d.financials?.revenue_trend??"不明"}`,
      `利益推移:${d.financials?.profit_trend??"不明"}`,
      `利益率:${d.financials?.profit_margin??"不明"}`,
      `CF:${d.financials?.cash_flow??"不明"}`,
      `発行済株式総数:${d.ipo_details?.total_shares??"不明"}`,
      `公募・売出株数:${d.ipo_details?.public_shares??"不明"}`,
      `流通比率:${d.ipo_details?.float_ratio??"不明"}`,
      `調達金額:${d.ipo_details?.fundraising_amount??"不明"}`,
      `資金使途:${(d.ipo_details?.use_of_proceeds??"").slice(0,200)}`,
      `ロックアップ期間:${d.ipo_details?.lockup_period??"不明"}`,
      `ロックアップ対象:${(d.ipo_details?.lockup_targets??"").slice(0,200)}`,
      `OA:${d.ipo_details?.overallotment??"不明"}`,
      `主要株主:${JSON.stringify(d.shareholders??[]).slice(0,600)}`,
      `主なリスク:${JSON.stringify(d.risks??[]).slice(0,600)}`,
      `経営陣:${(d.management??"").slice(0,300)}`,
      `成長要因:${(d.growth_drivers??"").slice(0,300)}`,
      `懸念点:${(d.concerns??"").slice(0,300)}`,
    ].join("\n").slice(0, 4000);
  }
  if (raw && Object.keys(raw).length > 0) {
    return Object.entries(raw as Record<string,string>)
      .map(([k,v]) => `[${k}]\n${String(v).slice(0,600)}`)
      .join("\n\n")
      .slice(0, 4000);
  }
  return "";
}

function gradeFromScore(score: number): string {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "E";
}

async function analyzeAxisPart(
  companyName: string,
  sector: string,
  listingDate: string,
  exchange: string,
  axisId: string,
  periodLabel: string,
  dataContext: string,
  score: number,
  part: number
): Promise<string> {
  const name = AXIS_NAMES[axisId] ?? axisId;
  const sections = (REPORT_SECTIONS[part] ?? REPORT_SECTIONS[1]).replace("{PERIOD}", periodLabel);
  const firstHeading = sections.split("\n")[0];

  const prompt = `あなたは日本のIPO投資の専門アナリストです。
${companyName}（${sector}、${exchange}市場、上場予定${listingDate}）の${periodLabel}投資判断における「${name}」指標を徹底的に分析してください。

【企業データ】
${dataContext || "データ未取得のため一般的な分析を行ってください"}

【分析指示】
スコア: ${score}/100

以下の構成・見出しのみを使って、レポートを作成してください。指定した見出し以外の見出しや構成（独自の番号見出し、会社名やタイトルを含む見出し行、「パターン」「戦略」などの追加構成）は絶対に使わないでください。出力は必ず「${firstHeading}」から始めてください。

${sections}

マークダウン形式で出力してください。`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(55000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return (data?.content?.[0]?.text ?? "").trim();
}

export async function POST(req: NextRequest) {
  try {
    const { company_id, period, single_axis, part, save_results } = await req.json();

    if (!period || !AXIS_CONFIG[period as keyof typeof AXIS_CONFIG]) {
      return NextResponse.json(
        { error: "periodは ultra_short / short / long のいずれかを指定してください" },
        { status: 400 }
      );
    }

    const config = AXIS_CONFIG[period as keyof typeof AXIS_CONFIG];
    const supabase = getSupabase();

    // 保存モード：フロントから3軸分まとめて受け取って保存
    if (save_results) {
      const { data: co } = await supabase.from("ipo_companies").select("*").eq("id", company_id).single();
      if (!co) return NextResponse.json({ error: "銘柄が見つかりません" }, { status: 404 });

      const axesResult: Record<string, any> = {};
      save_results.forEach((item: any) => { axesResult[item.id] = item; });

      await supabase.from("ipo_companies")
        .update({ [config.dbColumn]: axesResult })
        .eq("id", company_id);

      const current = co.analysis_detail ?? {};
      const currentAxes = current.axes ?? { ultra_short: [], short: [], long: [] };
      const periodKey = period === "ultra_short" ? "ultra_short" : period === "short" ? "short" : "long";
      currentAxes[periodKey] = Object.values(axesResult);

      await supabase.from("ipo_companies")
        .update({ analysis_detail: { ...current, axes: currentAxes } })
        .eq("id", company_id);

      return NextResponse.json({ success: true, message: `✅ ${config.label}の保存完了！` });
    }

    // 分析モード：1軸・1パート分析して結果を返すのみ（保存しない）
    const { data: co, error } = await supabase
      .from("ipo_companies")
      .select("*")
      .eq("id", company_id)
      .single();

    if (error || !co) {
      return NextResponse.json({ error: "銘柄が見つかりません" }, { status: 404 });
    }

    if (!co.analysis_summary) {
      return NextResponse.json(
        { error: "③のスコア生成が未完了です。先に③を実行してください。" },
        { status: 400 }
      );
    }

    const axesScores = co.analysis_summary?.axes_scores ?? {};
    const marketInfo = co.analysis_market
      ? `\n【市場・競合情報】主幹事:${co.analysis_market.lead_underwriter ?? ""}・競合:${(co.analysis_market.competitors ?? []).map((c: any) => c.name).join("、")}・業界PER:${co.analysis_market.industry_per ?? ""}・市場動向:${co.analysis_market.market_trend ?? ""}`
      : "";
    const dataContext = buildDataContext(co.structured_data, co.raw_prospectus) + marketInfo;
    const axisId = single_axis ?? config.axes[0];
    const partNum = part === 2 ? 2 : 1;
    const score = axesScores[axisId] ?? 60;

    const text = await analyzeAxisPart(
      co.name ?? "不明",
      co.sector ?? "tech",
      co.listing_date ?? "2026",
      co.exchange ?? "グロース",
      axisId,
      config.label,
      dataContext,
      score,
      partNum
    );

    return NextResponse.json({
      success: true,
      axis_id: axisId,
      label: AXIS_NAMES[axisId] ?? axisId,
      part: partNum,
      score,
      grade: gradeFromScore(score),
      text,
    });

  } catch (e: any) {
    console.error("axes error:", e?.message);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}