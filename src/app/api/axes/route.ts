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

async function analyzeAxesWithGemini(
  companyName: string,
  sector: string,
  listingDate: string,
  exchange: string,
  axisIds: string[],
  periodLabel: string,
  dataContext: string,
  axesScores: Record<string, number>
): Promise<Record<string, any>> {
  const axesPrompt = axisIds.map(id => {
    const score = axesScores[id] ?? 60;
    const name = AXIS_NAMES[id] ?? id;
    return `
## ${name}（スコア: ${score}/100）

以下の構成で詳細分析を行ってください（各セクション200字以上）：

### なぜ重要か
この指標が${periodLabel}のIPO投資判断に与える影響を詳しく説明してください。

### データ分析
目論見書の具体的数値・事実を引用しながら詳細に分析してください。

### ポジティブ要因
- （箇条書き3点以上、各50字以上）

### ネガティブ要因・リスク
- （箇条書き3点以上、各50字以上）

### 投資家への示唆
この軸から導かれる具体的な投資判断の材料を記述してください。

### 確認すべき書類・情報
目論見書のどのページ・どの項目・どの開示資料を確認すべきか具体的に記述してください。
`;
  }).join("\n---\n");

  const prompt = `あなたは日本のIPO投資の専門アナリストです。
${companyName}（${sector}、${exchange}市場、上場予定${listingDate}）の${periodLabel}投資判断に関わる以下の指標を徹底的に分析してください。

【企業データ】
${dataContext || "データ未取得のため一般的な分析を行ってください"}

【分析指示】
以下の各指標について、指定された構成で詳細なレポートを作成してください。
分析は具体的・定量的に行い、抽象的な表現は避けてください。
各セクションは必ず200字以上記述してください。

${axesPrompt}

【出力形式】
マークダウン形式でそのまま出力してください。
各指標の区切りは「---」で行い、指標名から始めてください。`;
console.log("GEMINI_KEY_PREFIX:", process.env.GEMINI_API_KEY?.slice(0, 10));
  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4000 }
      }),
      signal: AbortSignal.timeout(50000)
    }
  );
  
  if (!geminiRes.ok) {
    const err = await geminiRes.text();
    throw new Error(`Gemini API error: ${err.slice(0, 200)}`);
  }

  const geminiData = await geminiRes.json();
  const fullText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  // 各軸のテキストを分割して保存
  const result: Record<string, any> = {};
  const sections = fullText.split(/\n---\n/);

  axisIds.forEach((id, idx) => {
    const name = AXIS_NAMES[id] ?? id;
    const score = axesScores[id] ?? 60;
    const text = sections[idx] ?? fullText.slice(idx * 1000, (idx + 1) * 1000);

    // A〜E判定
    let grade = "C";
    if (score >= 80) grade = "A";
    else if (score >= 65) grade = "B";
    else if (score >= 50) grade = "C";
    else if (score >= 35) grade = "D";
    else grade = "E";

    result[id] = {
      id,
      label: name,
      score,
      grade,
      report: text.trim(),
    };
  });

  return result;
}

export async function POST(req: NextRequest) {
  try {
    const { company_id, period } = await req.json();

    if (!period || !AXIS_CONFIG[period as keyof typeof AXIS_CONFIG]) {
      return NextResponse.json(
        { error: "periodは ultra_short / short / long のいずれかを指定してください" },
        { status: 400 }
      );
    }

    const config = AXIS_CONFIG[period as keyof typeof AXIS_CONFIG];
    const supabase = getSupabase();

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
    const dataContext = buildDataContext(co.structured_data, co.raw_prospectus);

    const axesResult = await analyzeAxesWithGemini(
      co.name ?? "不明",
      co.sector ?? "tech",
      co.listing_date ?? "2026",
      co.exchange ?? "グロース",
      config.axes,
      config.label,
      dataContext,
      axesScores
    );

    await supabase.from("ipo_companies")
      .update({ [config.dbColumn]: axesResult })
      .eq("id", company_id);

    // analysis_detailのaxesも更新
    const current = co.analysis_detail ?? {};
    const currentAxes = current.axes ?? { ultra_short: [], short: [], long: [] };
    const periodKey = period === "ultra_short" ? "ultra_short" : period === "short" ? "short" : "long";
    currentAxes[periodKey] = Object.values(axesResult);

    await supabase.from("ipo_companies")
      .update({ analysis_detail: { ...current, axes: currentAxes } })
      .eq("id", company_id);

    return NextResponse.json({
      success: true,
      period,
      axes_analyzed: config.axes,
      message: `✅ ${config.label}の詳細分析完了！`,
      preview: Object.entries(axesResult).map(([id, v]: [string, any]) => ({
        id,
        score: v.score,
        grade: v.grade,
        chars: v.report?.length ?? 0,
      }))
    });

  } catch (e: any) {
    console.error("axes error:", e?.message);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}