import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchMarketSnapshotContext } from "@/lib/market-snapshot";

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
この指標が{PERIOD}のIPO投資判断に与える影響を200〜350字程度で説明してください。1文目で結論を端的に述べ、そのあと空行を1行挟んでから理由・背景の説明を続ける2段落構成にしてください。

### データ分析
目論見書の具体的数値・事実を引用しながら200〜350字程度で分析してください。意味のまとまりごとに空行を1行挟み、2〜3段落に分けてください（1段落を100字程度が目安）。

### ポジティブ要因
- （箇条書き3〜4点、各40〜70字程度）`,
  2: `### ネガティブ要因・リスク
- （箇条書き3〜4点、各40〜70字程度）

### 投資する場合の留意点
仮にこの銘柄に投資する・注目する場合、どの点に気をつけて見ておくとよいかを200〜300字程度で記述してください。「ここを確認しておくと安心」「ここが変化した場合は見直しを検討したい」といった、読み手が自分で判断するための着眼点を示す書き方にしてください。

### まとめ
この軸から読み取れる材料を200〜350字程度でニュートラルに整理してください。1文目でこの軸の要点を端的に述べ、そのあと空行を1行挟んでから補足の説明を続ける2段落構成にしてください。

### 参考文献
目論見書のどのページ・どの項目・どの開示資料を確認すべきか、必ず具体的なページ番号（「P.XX」など。正確な番号が分からない場合は推定ページ）を示しながら200字程度で記述してください。`,
};

// 2026/9/4追加: スコアの高低にかかわらず、まず銘柄の魅力・注目点を
// 前面に出し、そのあとに注意点、そして「投資する場合の留意点」という
// 順番で書かせるための文体・トーン指示。「これは買い」「これは買わない
// ほうがいい」のような断定的な結論は書かせず、判断材料の提示にとどめ、
// 買う・買わないの最終判断は読み手に委ねる書き方を徹底する。
const TONE_INSTRUCTIONS = `【文体・トーンの指示(必ず守ってください)】
・スコアの数値が低い場合でも、その銘柄の魅力や注目すべき点を軽視したり、最初から否定的な前提で書いたりしないでください。どの銘柄にも投資家が興味を持ちうる要素があるはずだという前提で、まず「なぜ重要か」「データ分析」「ポジティブ要因」の各セクションでは、この銘柄・この指標の良い点や注目点を具体的な根拠とともに前向きに描写してください。
・そのうえで「ネガティブ要因・リスク」「投資する場合の留意点」のセクションで注意点・リスクを扱ってください。
・「これは買いです」「これは買わないほうがいいです」「投資すべきではない」のような断定的な結論・推奨は一切書かないでください。「〜という材料がある」「〜な点は確認しておきたい」のように、事実・観点の提示にとどめ、最終的に買う・買わないを判断するのは読み手自身であるという前提を崩さないでください。
・スコアの数値そのものを「魅力がない」根拠として使わず、あくまで各セクションはデータ・事実に基づいて記述してください。
・1文が長くなりすぎないようにし、意味のまとまりごとに改行・空行を入れて、スマートフォンでも読みやすい短い段落を意識してください。
・各セクションで最も伝えたい語句・数値は1〜2箇所だけ「**」で囲んで部分太字にしてください(例: 「**流通比率は約35%**と比較的高く」)。多用しすぎず、本当に重要な箇所のみに絞ってください。`;

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

${TONE_INSTRUCTIONS}

マークダウン形式で出力してください。`;

async function callOnce(maxTokens: number): Promise<{ text: string; truncated: boolean }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(55000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = (data?.content?.[0]?.text ?? "").trim();
  // stop_reasonが"max_tokens"の場合、文字数上限に達して途中で打ち切られている
  const truncated = data?.stop_reason === "max_tokens";
  return { text, truncated };
}

// 1回目(6000トークン)で生成し、途中で切れていたら8000トークンで再試行する
let result = await callOnce(6000);
if (result.truncated) {
  console.warn(`axis ${axisId} part${part}: max_tokensで打ち切り検知、再試行します`);
  result = await callOnce(8000);
}
return result.text;
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
    // 2026/9/1追加: 超短期(ultra_short)軸のレポートにのみ、週次で調査している
    // 市場テーマ・地合い情報(src/lib/market-snapshot.ts)を補助的な参考情報として加える。
    // 短期(short)・長期(long)には影響させない。
    let marketSnapshotNote = "";
    if (period === "ultra_short") {
      const snapshot = await fetchMarketSnapshotContext(supabase);
      if (snapshot.text) {
        marketSnapshotNote = `\n\n${snapshot.text}\n※上記は市場全体の週次調査に基づく一般的な参考情報であり、この銘柄固有のデータではありません。断定的な根拠にはせず、需給・地合いの観点から補助的に触れる程度に留めてください。`;
      }
    }
    const dataContext = buildDataContext(co.structured_data, co.raw_prospectus) + marketInfo + marketSnapshotNote;
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