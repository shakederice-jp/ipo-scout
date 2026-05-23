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

    // キャッシュチェック
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

    // Claude Sonnetで詳細分析生成
    const analysisMsg = await claude.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [{
        role: "user",
        content: `以下のIPO企業を詳細分析し、JSONのみで回答してください（前置き・マークダウン不要）。

企業情報:
会社名: ${company.name}
ティッカー: ${company.ticker || "未定"}
取引所: ${company.exchange || "未定"}
セクター: ${company.sector || "不明"}
業態: ${company.biz_type || "不明"}
上場日: ${company.listing_date || "未定"}

以下のJSON構造で回答:
{
  "summary": "200字以内の事業概要と投資ポイント",
  "total_score": 65,
  "grade": "B",
  "highlight_reason": null,
  "axes": {
    "ultra_short": [
      {"id":"float","index":"超-1","title":"需給の軽さ（浮動株・吸収金額）","score":70,"why_matters":"なぜ重要か2文","description":"この銘柄の具体的状況3文","verdict":"総評2文","doc_guide":"参照すべき書類と確認箇所"},
      {"id":"lockup","index":"超-2","title":"VCの動向・ロックアップ解除条件","score":65,"why_matters":"...","description":"...","verdict":"...","doc_guide":"..."},
      {"id":"timing","index":"超-3","title":"市場の地合い（マクロ環境）","score":60,"why_matters":"...","description":"...","verdict":"...","doc_guide":"..."}
    ],
    "short": [
      {"id":"valuation","index":"短-1","title":"初値後のバリュエーション妥当性","score":65,"why_matters":"...","description":"...","verdict":"...","doc_guide":"..."},
      {"id":"vc_sell","index":"短-2","title":"VC・大株主の売り圧力評価","score":60,"why_matters":"...","description":"...","verdict":"...","doc_guide":"..."},
      {"id":"growth","index":"短-3","title":"成長ストーリーの説得力","score":65,"why_matters":"...","description":"...","verdict":"...","doc_guide":"..."}
    ],
    "long": [
      {"id":"management","index":"長-1","title":"経営者の質・ビジョンと実行力","score":70,"why_matters":"...","description":"...","verdict":"...","doc_guide":"..."},
      {"id":"unit_econ","index":"長-2","title":"ユニットエコノミクスと利益率","score":60,"why_matters":"...","description":"...","verdict":"...","doc_guide":"..."},
      {"id":"competitor","index":"長-3","title":"競合他社比較","score":65,"why_matters":"...","description":"...","verdict":"...","doc_guide":"..."}
    ]
  },
  "sources": [
    {"label":"東証・新規上場情報","url":"https://www.jpx.co.jp/listing/stocks/new/index.html"},
    {"label":"EDINET（有価証券届出書）","url":"https://disclosure2.edinet-fsa.go.jp/"},
    {"label":"みんかぶIPO","url":"https://minkabu.jp/stock/${company.ticker || ''}"},
    {"label":"IPO株","url":"https://ipokabu.net/"}
  ],
  "generated_at": "${new Date().toISOString()}"
}`
      }]
    });

    const rawText = (analysisMsg.content[0] as any).text;
    let analysis = JSON.parse(extractJson(rawText));

    // Gemini検証（クォータ切れでも続行）
    try {
      const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
      const geminiModel = gemini.getGenerativeModel({ model: "gemini-2.0-flash" });
      const checkPrompt = `IPO分析の検証。企業名:${company.name}、セクター:${company.sector}、要約:${analysis.summary}\n明らかな誤りや矛盾があればJSONのみで:\n{"ok":true,"issues":""}\nまたは\n{"ok":false,"issues":"問題点"}`;
      const geminiResult = await geminiModel.generateContent(checkPrompt);
      const rawGemini = geminiResult.response.text();
      const geminiText = extractJson(rawGemini);
      let check: { ok: boolean; issues: string };
      try { check = JSON.parse(geminiText); } catch { check = { ok: true, issues: "" }; }

      if (!check.ok && check.issues) {
        const fixMsg = await claude.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 500,
          messages: [{
            role: "user",
            content: `IPO分析で問題が指摘されました: ${check.issues}\n企業:${company.name}\n現在のsummary:${analysis.summary}\n修正後のsummaryとスコアをJSONのみで:\n{"summary":"修正後","total_score":65,"grade":"B"}`
          }]
        });
        const fixRaw = (fixMsg.content[0] as any).text;
        try {
          const fix = JSON.parse(extractJson(fixRaw));
          if (fix.summary) analysis.summary = fix.summary;
          if (fix.total_score) analysis.total_score = fix.total_score;
          if (fix.grade) analysis.grade = fix.grade;
        } catch {}
      }
    } catch {}

    // DBに保存
    if (supabase) {
      await supabase.from("ipo_companies").update({ analysis_detail: analysis }).eq("id", company.id);
    }

    return NextResponse.json(analysis);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}