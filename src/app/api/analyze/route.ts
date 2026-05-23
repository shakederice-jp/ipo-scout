export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function extractJson(text: string): string {
  const start = text.indexOf('{');
  if (start === -1) return text;
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

    const analysisMsg = await claude.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{
        role: "user",
        content: `IPO企業を分析してください。読者は投資初心者・一般のサラリーマン・年配の方・女性の方です。
専門用語には必ずカッコで説明を添え、「〜です」「〜ます」調の親しみやすい文体で書いてください。
各項目のdescriptionは150字以上で具体的に書いてください。
JSONのみで回答（前置き・マークダウン不要）。

企業：${company.name}／${company.ticker || "未定"}／${company.exchange || "未定"}／${company.sector || "不明"}／${company.biz_type || "不明"}／上場日${company.listing_date || "未定"}

{
  "summary": "この会社の事業内容・ビジネスモデル・投資する際のポイントと注意点を300字程度で親しみやすく説明",
  "total_score": 65,
  "grade": "B",
  "highlight_reason": null,
  "axes": {
    "ultra_short": [
      {"id":"float","index":"難・1","title":"需給・ロック内容","score":70,
       "why_matters":"初心者向けに「なぜこの指標が大事か」を2〜3文で説明",
       "description":"ロックアップ期間・大株主保有比率・VC比率などを踏まえた150字以上の詳細分析",
       "verdict":"判断待ち",
       "doc_guide":"目論見書のどこを見ればよいかを具体的に説明"},
      {"id":"lockup","index":"難・2","title":"VC保有・売り圧力","score":65,
       "why_matters":"初心者向けに「なぜこの指標が大事か」を2〜3文で説明",
       "description":"VCの保有比率・ロックアップ解除タイミングなどを踏まえた150字以上の詳細分析",
       "verdict":"判断待ち",
       "doc_guide":"目論見書のどこを見ればよいかを具体的に説明"},
      {"id":"timing","index":"難・3","title":"市場環境・上場タイミング","score":60,
       "why_matters":"初心者向けに「なぜこの指標が大事か」を2〜3文で説明",
       "description":"市場の地合い・同業他社の直近IPO動向などを踏まえた150字以上の詳細分析",
       "verdict":"判断待ち",
       "doc_guide":"確認すべき情報源を具体的に説明"}
    ],
    "short": [
      {"id":"valuation","index":"週1-1","title":"バリュエーション・割安感","score":65,
       "why_matters":"初心者向けに「なぜこの指標が大事か」を2〜3文で説明",
       "description":"PER・PSRなど同業比較を踏まえた150字以上の詳細分析",
       "verdict":"判断待ち",
       "doc_guide":"目論見書のどこを見ればよいかを具体的に説明"},
      {"id":"vc_sell","index":"週1-2","title":"ロックアップ解除後の売り圧力","score":60,
       "why_matters":"初心者向けに「なぜこの指標が大事か」を2〜3文で説明",
       "description":"解除日・解除条件・売り出し規模などを踏まえた150字以上の詳細分析",
       "verdict":"判断待ち",
       "doc_guide":"目論見書のどこを見ればよいかを具体的に説明"},
      {"id":"growth","index":"週1-3","title":"成長性・市場規模","score":65,
       "why_matters":"初心者向けに「なぜこの指標が大事か」を2〜3文で説明",
       "description":"TAM・売上成長率・競合比較などを踏まえた150字以上の詳細分析",
       "verdict":"判断待ち",
       "doc_guide":"目論見書のどこを見ればよいかを具体的に説明"}
    ],
    "long": [
      {"id":"management","index":"長キ-1","title":"経営陣・ガバナンス","score":70,
       "why_matters":"初心者向けに「なぜこの指標が大事か」を2〜3文で説明",
       "description":"創業者経歴・役員構成・社外取締役の独立性などを踏まえた150字以上の詳細分析",
       "verdict":"判断待ち",
       "doc_guide":"目論見書のどこを見ればよいかを具体的に説明"},
      {"id":"unit_econ","index":"長キ-2","title":"ユニットエコノミクス","score":60,
       "why_matters":"初心者向けに「なぜこの指標が大事か」を2〜3文で説明",
       "description":"LTV・CAC・解約率などを踏まえた150字以上の詳細分析",
       "verdict":"判断待ち",
       "doc_guide":"目論見書のどこを見ればよいかを具体的に説明"},
      {"id":"competitor","index":"長キ-3","title":"競合優位性","score":65,
       "why_matters":"初心者向けに「なぜこの指標が大事か」を2〜3文で説明",
       "description":"独自技術・参入障壁・競合他社比較などを踏まえた150字以上の詳細分析",
       "verdict":"判断待ち",
       "doc_guide":"目論見書のどこを見ればよいかを具体的に説明"}
    ]
  },
  "sources": [
    {"label":"東証新規上場情報","url":"https://www.jpx.co.jp/listing/stocks/new/index.html"},
    {"label":"EDINET・有価証券届出書","url":"https://disclosure2.edinet-fsa.go.jp/"},
    {"label":"銘柄情報IPO","url":"https://minkabu.jp/stock/${company.ticker || ''}"},
    {"label":"IPO情報","url":"https://ipokabu.net/"}
  ],
  "generated_at": "${new Date().toISOString()}"
}`
      }]
    });

    const rawText = (analysisMsg.content[0] as any).text;
    let analysis = JSON.parse(extractJson(rawText));

    if (supabase) {
      await supabase.from("ipo_companies").update({ analysis_detail: analysis }).eq("id", company.id);
    }

    return NextResponse.json(analysis);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}