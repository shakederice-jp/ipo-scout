import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchCompetitorFinancials } from "@/lib/competitor-financials";
import Anthropic from "@anthropic-ai/sdk";

// 2026/9/4追加: 「ビジネスモデル(儲けの手法・からくり)」「上場までのストーリー」
// 「競合企業との違い」の3要素を生成するSTEP(管理画面の表示上は「⑧ 深掘り3要素」)。
// note.com「注目企業ナビ」のKOMPEITO記事の分析を踏まえ、目論見書の数値だけでなく
// 「なぜ・どうやって儲けているか」「なぜ今上場するのか」「競合と何が違うのか」という、
// 既存の9軸分析にはない切り口を無料公開コンテンツとして追加するためのもの。
//
// タイムアウト対策(2026/9/3の相談で決定): 独立したpartに分割し、それぞれ
// 個別に保存する(1つが失敗しても他の結果は残る)。
// ・part="business_story": structured_data(EDINETから抽出済みのデータ)のみを使い、
//   新たなWeb検索は行わない。生成が速く、タイムアウトリスクが低い。
// ・part="competitor_diff": 既にSTEP⑦(市場・競合情報収集)で取得済みのanalysis_market.
//   competitors、および必要なら競合財務データ(fetchCompetitorFinancials、EDINETベース)
//   を使う。こちらも新たなWeb検索(web_search)は行わない
//   (2026/9/3の相談「EDINETの情報だけでどこまで競合に迫れますか」を踏まえた設計)。
// ・part="long_term_strength"(2026/9/12追加): 9軸分析が目論見書の財務データのみに
//   基づくため、長期区分がどうしても財務不安要素中心になりがちという相談を受けて追加。
//   STEP⑦の市場・競合情報収集は主幹事・PER水準・初値実績等のベンチマーク情報が中心で、
//   その銘柄「ならでは」の差別化・強みという切り口の検索はしていないため、このpart内で
//   専用のWeb検索(STEP⑦と同じHaiku+web_search方式)を新たに行う。9軸分析(STEP5)側は
//   一切変更しない。生成結果はanalysis_deep_dive.long_term_strengthに保存されるが、
//   他の2要素と違い無料公開はせず、9軸分析の長期区分と同様に有料会員限定で表示する
//   (page.tsx側でhasAccessが無い場合にこのキーだけ取り除く処理を追加している)。
//   トーン方針(2026/9/12相談): 見つかった事実の範囲で誠実に書き、実績・評価の
//   でっち上げや過度な美化はしない。買いを煽る表現も禁止(STYLE_NOTEを踏襲)。
export const maxDuration = 60;

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

function buildBusinessContext(structured: any): string {
  const d = structured ?? {};
  return [
    `事業概要:${(d.business_summary ?? "").slice(0, 500)}`,
    `売上推移:${d.financials?.revenue_trend ?? "不明"}`,
    `利益推移:${d.financials?.profit_trend ?? "不明"}`,
    `利益率:${d.financials?.profit_margin ?? "不明"}`,
    `調達金額:${d.ipo_details?.fundraising_amount ?? "不明"}`,
    `資金使途:${(d.ipo_details?.use_of_proceeds ?? "").slice(0, 300)}`,
    `経営陣:${(d.management ?? "").slice(0, 400)}`,
    `成長要因:${(d.growth_drivers ?? "").slice(0, 400)}`,
    `懸念点:${(d.concerns ?? "").slice(0, 300)}`,
    `主要株主:${JSON.stringify(d.shareholders ?? []).slice(0, 500)}`,
  ].join("\n").slice(0, 3500);
}

async function callClaude(prompt: string, maxTokens = 2000): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(50000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data?.content?.[0]?.text ?? "").trim();
}

function parseJson(raw: string): any {
  const clean = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// 読み手が「自分ごと」として読めるよう、事実提示→短い問いかけのテンポや、
// 短い段落・部分太字を使うトーン指示。断定的な投資助言は書かせない
// (9軸分析と同じ、買う・買わないは読み手に委ねる方針をここでも踏襲する)。
const STYLE_NOTE = `【文体の指示】
・note等の読み物記事のように、具体的な数値・固有名詞を交えながら、短い段落(2〜4文)を空行で区切って書くこと。1段落を長くしすぎないこと。
・専門用語が出たら一言かんたんな説明を添えること。
・最も伝わってほしい語句・数値を1〜2箇所だけ「**」で囲んで部分太字にすること(多用しないこと)。
・「買うべき」「投資すべき」等の断定的な投資助言・煽り文句は書かないこと。あくまで会社を理解するための読み物として、事実・見方を提示するにとどめること。
・ですます調で記述すること。`;

async function generateBusinessStory(co: any): Promise<{ business_model: string; story: string }> {
  const context = buildBusinessContext(co.structured_data);
  const prompt = `あなたは日本のIPOを分かりやすく紹介するライターです。
${co.name}(${co.sector ?? "tech"}、上場予定${co.listing_date ?? "2026"})について、以下の2つの文章を作成してください。
JSONのみで返答してください。マークダウン・コードブロック・余分なテキスト一切不要。

【企業データ】
${context || "データ未取得のため一般的な内容にとどめてください"}

${STYLE_NOTE}

【出力形式】
{
  "business_model": "この会社が具体的に何を売って、どう儲けているか(収益構造・ビジネスモデル)を400〜600字程度で説明する文章。「誰に」「何を」「どうやって」提供して対価を得ているのかが読めば分かるように、具体的な数値(売上構成・利益率等、データにあるもの)を交えること",
  "story": "なぜ今この会社が上場するに至ったのか、創業からの成長の経緯・転機を400〜600字程度で説明する文章。物語構成の『英雄の旅』を簡略化した次の4段階(日常→転機→試練→現在)を意識して構成すること。①日常: 創業当初、まだ事業が小さかった頃の状況。②転機: 事業の方向性や成長スピードを変えるきっかけとなった出来事・意思決定・気づき。③試練: 転機のあとに直面した苦労・失敗・競合との競争などの壁と、それをどう乗り越えたか。④現在: 乗り越えた先に今どのような成長・成果に至り、それが上場というタイミングにどうつながっているか。データに創業年や沿革の具体的記載がない場合は、無理に物語を作り上げず、成長要因・資金使途から読み取れる範囲でこの4段階に近い流れを構成し、『今が上場のタイミングである理由』を現在の段落で明確に示すこと"
}`;
  const raw = await callClaude(prompt, 2200);
  const parsed = parseJson(raw);
  return {
    business_model: String(parsed.business_model ?? "").trim(),
    story: String(parsed.story ?? "").trim(),
  };
}

async function generateCompetitorDiff(co: any, supabase: any): Promise<{ competitor_diff: string }> {
  const competitors: any[] = co.analysis_market?.competitors ?? [];
  if (competitors.length === 0) {
    throw new Error("競合他社情報がありません。先に⑦市場・競合情報収集を実行してください。");
  }

  let financials: any[] = co.analysis_market?.competitor_financials ?? [];
  if (financials.length === 0) {
    financials = await fetchCompetitorFinancials(co.id, supabase);
  }

  const d = co.structured_data ?? {};
  const ownContext = [
    `${co.name}の売上推移:${d.financials?.revenue_trend ?? "不明"}`,
    `${co.name}の利益率:${d.financials?.profit_margin ?? "不明"}`,
  ].join("\n");
  const competitorContext = competitors.map((c: any) => {
    const f = financials.find((x: any) => x.name === c.name);
    return `[${c.name}]事業内容:${c.description ?? "不明"}${f && !f.error ? `／売上高:${f.revenue ?? "不明"}億円・営業利益:${f.operating_profit ?? "不明"}億円(${f.fiscal_year ?? ""})` : "／財務データ不明"}`;
  }).join("\n");
  const industryPer = co.analysis_market?.industry_per ?? "不明";

  const prompt = `あなたは日本のIPOを分かりやすく紹介するライターです。
${co.name}(${co.sector ?? "tech"})と、その競合他社との違いを解説する文章を作成してください。
JSONのみで返答してください。マークダウン・コードブロック・余分なテキスト一切不要。

【${co.name}のデータ】
${ownContext}

【競合他社のデータ】
${competitorContext}

【業界PER】${industryPer}

${STYLE_NOTE}

【絶対ルール】
・データに無い数値を作らないこと。財務データが不明な競合については、事業内容・ポジショニングの違いを中心に記述すること
・「どちらが優れているか」という優劣の断定は避け、事業モデル・規模・成長ステージ・収益構造の違いという事実ベースの比較にとどめること

【出力形式】
{
  "competitor_diff": "${co.name}と競合他社との違いを400〜600字程度で説明する文章。事業モデル・ポジショニング・データがあれば規模感(売上・利益率等)の違いを具体的に比較すること"
}`;
  const raw = await callClaude(prompt, 1800);
  const parsed = parseJson(raw);
  return { competitor_diff: String(parsed.competitor_diff ?? "").trim() };
}

// 2026/9/12追加: 9軸分析の長期区分が財務不安要素に偏りがちという相談を受けて追加。
// STEP⑦(市場・競合情報収集)はベンチマーク目的の検索のため、差別化・強み・優位性という
// 切り口の材料が無い。ここで専用のWeb検索(STEP⑦と同じHaiku+web_search方式)を行い、
// 見つかった事実だけをもとに文章化する。見つからない場合に無理な美化・でっち上げを
// しないことを強く指示している(2026/9/12相談での方針確認を反映)。
async function generateLongTermStrength(co: any): Promise<{ long_term_strength: string }> {
  const structured = co.structured_data ?? {};
  const businessSummary = (structured.business_summary ?? "").slice(0, 400);
  const growthDrivers = (structured.growth_drivers ?? "").slice(0, 400);
  const competitors: any[] = co.analysis_market?.competitors ?? [];
  const competitorNames = competitors.map((c: any) => c.name).filter(Boolean).join("、");

  const searchResponse = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 2000,
    tools: [{ type: "web_search_20250305", name: "web_search" } as any],
    messages: [{
      role: "user",
      content: `「${co.name}」（${co.sector ?? ""}）のIPOに関して、以下を検索してください。

1. この会社が競合他社と比べて「差別化」できている具体的なポイント（技術・サービス内容・顧客層・販売チャネル等）
2. この会社ならではの「オンリーワン」と言える強み（独自の技術・特許・提携・実績等）
3. 業界内での競争優位性（シェア・実績・評価等の裏付けがあるもの）

競合として${competitorNames || "同業他社"}などが挙げられます。事実に基づく具体的な情報のみを探してください。見つからない場合は無理に作らず「該当する情報が見つからなかった」旨を書いてください。`,
    }],
  });

  const searchText = searchResponse.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");

  const prompt = `あなたは日本のIPOを分かりやすく紹介するライターです。
${co.name}(${co.sector ?? "tech"})について、以下のWeb検索結果と会社データをもとに、
この会社の差別化ポイント・強み・競争優位性を伝える文章を作成してください。
JSONのみで返答してください。マークダウン・コードブロック・余分なテキスト一切不要。

【Web検索結果】
${searchText.slice(0, 3000) || "(検索結果なし)"}

【会社データ】
事業概要:${businessSummary}
成長要因:${growthDrivers}

${STYLE_NOTE}

【絶対ルール】
・Web検索結果や会社データに書かれていない強みを作り上げないこと。見つかった事実の範囲で書くこと。
・見つかった情報が乏しい場合は、無理に美化せず、分かる範囲で誠実に書くこと（存在しない実績や評価をでっち上げない）。
・「買うべき」等の投資助言や煽り文句は書かないこと。あくまで会社を理解するための読み物として、事実・見方を提示するにとどめること。

【出力形式】
{
  "long_term_strength": "この会社の差別化・強み・競争優位性を400〜600字程度で説明する文章。具体的な事実（技術・実績・提携・顧客層等）を交えること。見つかった材料が少ない場合は、無理に水増しせず分かる範囲で誠実にまとめること"
}`;
  const raw = await callClaude(prompt, 1800);
  const parsed = parseJson(raw);
  return { long_term_strength: String(parsed.long_term_strength ?? "").trim() };
}

export async function POST(req: NextRequest) {
  try {
    const { company_id, part } = await req.json();
    if (!company_id) return NextResponse.json({ error: "company_id required" }, { status: 400 });
    if (part !== "business_story" && part !== "competitor_diff" && part !== "long_term_strength") {
      return NextResponse.json({ error: "partは business_story / competitor_diff / long_term_strength のいずれかを指定してください" }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data: co, error } = await supabase.from("ipo_companies").select("*").eq("id", company_id).single();
    if (error || !co) return NextResponse.json({ error: "銘柄が見つかりません" }, { status: 404 });

    const existing = co.analysis_deep_dive ?? {};
    let addition: Record<string, any> = {};

    if (part === "business_story") {
      if (!co.structured_data || Object.keys(co.structured_data).length === 0) {
        return NextResponse.json({ error: "②財務データ構造化が未完了です。先に②を実行してください。" }, { status: 400 });
      }
      addition = await generateBusinessStory(co);
    } else if (part === "competitor_diff") {
      addition = await generateCompetitorDiff(co, supabase);
    } else {
      addition = await generateLongTermStrength(co);
    }

    const merged = { ...existing, ...addition, updated_at: new Date().toISOString() };
    await supabase.from("ipo_companies").update({ analysis_deep_dive: merged }).eq("id", company_id);

    return NextResponse.json({ success: true, part, result: addition });
  } catch (e: any) {
    console.error("deep-dive error:", e?.message);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
