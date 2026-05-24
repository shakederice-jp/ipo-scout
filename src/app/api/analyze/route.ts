export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function extractJson(text: string): string {
  const start = text.indexOf('{');
  if (start === -1) return "{}";
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return text.slice(start);
}

const defaultAxes = {
  ultra_short: [
    { id: "float", index: "難・1", title: "需給・ロック内容", score: 60, why_matters: "上場直後の需給バランスが初値を左右します", description: "目論見書のロックアップ条件と大株主保有比率を確認中です", verdict: "分析中", doc_guide: "目論見書の株主の状況をご確認ください" },
    { id: "lockup", index: "難・2", title: "VC保有・売り圧力", score: 60, why_matters: "VC保有比率が高いと上場後の売り圧力になります", description: "VC保有状況とロックアップ解除タイミングを分析中です", verdict: "分析中", doc_guide: "目論見書の大株主一覧をご確認ください" },
    { id: "timing", index: "難・3", title: "市場環境・タイミング", score: 60, why_matters: "市場全体の地合いが初値に大きく影響します", description: "上場時期の市場環境と同業他社のIPO動向を分析中です", verdict: "分析中", doc_guide: "直近IPO銘柄の初値騰落率を参考にしてください" }
  ],
  short: [
    { id: "valuation", index: "週1-1", title: "バリュエーション", score: 60, why_matters: "公開価格の割安感が上場後の株価上昇余地を決めます", description: "PERや同業他社比較でバリュエーションを分析中です", verdict: "分析中", doc_guide: "目論見書の業績予想と公開価格を確認してください" },
    { id: "vc_sell", index: "週1-2", title: "ロックアップ解除後の売り圧力", score: 60, why_matters: "ロックアップ解除日前後は株価が下がりやすくなります", description: "主要株主のロックアップ解除条件を分析中です", verdict: "分析中", doc_guide: "目論見書のロックアップ条件を確認してください" },
    { id: "growth", index: "週1-3", title: "成長性・市場規模", score: 60, why_matters: "市場規模が大きいほど会社の成長余地が広がります", description: "TAMと売上成長率を分析中です", verdict: "分析中", doc_guide: "目論見書の市場分析をご確認ください" }
  ],
  long: [
    { id: "management", index: "長キ-1", title: "経営陣・ガバナンス", score: 60, why_matters: "優秀な経営者が長期的な企業価値を高めます", description: "創業者経歴と役員構成を分析中です", verdict: "分析中", doc_guide: "目論見書の役員の状況をご確認ください" },
    { id: "unit_econ", index: "長キ-2", title: "ユニットエコノミクス", score: 60, why_matters: "LTV/CACの比率が事業の健全性を示します", description: "顧客獲得コストと生涯価値を分析中です", verdict: "分析中", doc_guide: "目論見書の財務データをご確認ください" },
    { id: "competitor", index: "長キ-3", title: "競合優位性", score: 60, why_matters: "参入障壁が高いほど長期的な収益が安定します", description: "競合他社との差別化ポイントを分析中です", verdict: "分析中", doc_guide: "目論見書の競合比較をご確認ください" }
  ]
};

export async function POST(req: NextRequest) {
  try {
    const company = await req.json();
    const supabase = createSupabaseServerClient();

    if (supabase) {
      const { data } = await supabase
        .from("ipo_companies")
        .select("analysis_detail")
        .eq("id", company.id)
        .single();
      if (data?.analysis_detail) {
        const detail = data.analysis_detail as any;
        const generatedAt = new Date(detail.generated_at || 0);
        const hoursSince = (Date.now() - generatedAt.getTime()) / 3600000;
        if (hoursSince < 48) return NextResponse.json(detail);
      }
    }

    const msg = await claude.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      messages: [{
        role: "user",
        content: `あなたは投資初心者に寄り添うIPOアドバイザーです。以下のIPO企業をJSON形式のみで分析してください。

【必ず守ること】
・「〜です」「〜ます」「〜でしょう」調の丁寧で温かみのある文体
・専門用語は必ずカッコ内で説明（例：ロックアップ（一定期間株を売れない約束））
・各descriptionは120字以上で具体的・丁寧に書く
・冷たい表現は避け「〜と考えられます」「〜が期待されます」など柔らかい表現を使う

企業：${company.name}／${company.sector || "不明"}／上場日${company.listing_date || "未定"}

必ず以下の形式で返してください：
{"summary":"この企業の事業内容と投資ポイントを200字で丁寧に説明","total_score":65,"grade":"B","highlight_reason":null,"axes":{"ultra_short":[{"id":"float","index":"難・1","title":"需給・ロック内容","score":65,"why_matters":"なぜ重要か丁寧に説明","description":"120字以上の詳細分析","verdict":"判断","doc_guide":"確認方法"},{"id":"lockup","index":"難・2","title":"VC保有・売り圧力","score":65,"why_matters":"なぜ重要か丁寧に説明","description":"120字以上の詳細分析","verdict":"判断","doc_guide":"確認方法"},{"id":"timing","index":"難・3","title":"市場環境・タイミング","score":65,"why_matters":"なぜ重要か丁寧に説明","description":"120字以上の詳細分析","verdict":"判断","doc_guide":"確認方法"}],"short":[{"id":"valuation","index":"週1-1","title":"バリュエーション","score":65,"why_matters":"なぜ重要か丁寧に説明","description":"120字以上の詳細分析","verdict":"判断","doc_guide":"確認方法"},{"id":"vc_sell","index":"週1-2","title":"ロックアップ解除後の売り圧力","score":65,"why_matters":"なぜ重要か丁寧に説明","description":"120字以上の詳細分析","verdict":"判断","doc_guide":"確認方法"},{"id":"growth","index":"週1-3","title":"成長性・市場規模","score":65,"why_matters":"なぜ重要か丁寧に説明","description":"120字以上の詳細分析","verdict":"判断","doc_guide":"確認方法"}],"long":[{"id":"management","index":"長キ-1","title":"経営陣・ガバナンス","score":65,"why_matters":"なぜ重要か丁寧に説明","description":"120字以上の詳細分析","verdict":"判断","doc_guide":"確認方法"},{"id":"unit_econ","index":"長キ-2","title":"ユニットエコノミクス","score":65,"why_matters":"なぜ重要か丁寧に説明","description":"120字以上の詳細分析","verdict":"判断","doc_guide":"確認方法"},{"id":"competitor","index":"長キ-3","title":"競合優位性","score":65,"why_matters":"なぜ重要か丁寧に説明","description":"120字以上の詳細分析","verdict":"判断","doc_guide":"確認方法"}]},"sources":[{"label":"東証新規上場情報","url":"https://www.jpx.co.jp/listing/stocks/new/index.html"},{"label":"EDINET","url":"https://disclosure2.edinet-fsa.go.jp/"},{"label":"IPOkabu","url":"https://ipokabu.net/"}],"generated_at":"2025-01-01T00:00:00.000Z"}`
      }]
    });

    const rawText = (msg.content[0] as any).text;
    let analysis: any;
    try {
      analysis = JSON.parse(extractJson(rawText));
    } catch {
      analysis = {
        summary: `${company.name}は${company.sector || ""}分野のIPO企業です。詳細分析を準備中です。`,
        total_score: 60, grade: "B", highlight_reason: null,
        axes: defaultAxes,
        sources: [{ label: "東証新規上場情報", url: "https://www.jpx.co.jp/listing/stocks/new/index.html" }],
        generated_at: new Date().toISOString()
      };
    }

    analysis.generated_at = new Date().toISOString();

    if (supabase) {
      await supabase.from("ipo_companies").update({ analysis_detail: analysis }).eq("id", company.id);
    }

    return NextResponse.json(analysis);
  } catch (error: any) {
    console.error("analyze error:", error?.message);
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}