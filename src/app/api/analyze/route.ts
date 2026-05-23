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

    // 既存の分析データを確認（48時間以内なら再利用）
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

    // Claude Sonnetで詳細分析を生成
    const analysisMsg = await claude.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{
        role: "user",
        content: `以下のIPO企業を詳細分析し、JSONのみで回答してください（前置き・マークダウン不要）。

企業情報：
会社名：${company.name}
チッカー：${company.ticker || "未定"}
取引所：${company.exchange || "未定"}
セクター：${company.sector || "不明"}
業態：${company.biz_type || "不明"}
上場日：${company.listing_date || "未定"}

以下のJSON構造で回答：
{
  "summary": "200字以内で事業概要と投資インサイト",
  "total_score": 65,
  "grade": "B",
  "highlight_reason": null,
  "axes": {
    "ultra_short": [
      {"id":"float","index":"難・1","title":"需給・ロック内容","score":70,"why_matters":"需給の軽さが初値を左右する","description":"ロックアップ期間と保有比率を確認","verdict":"判断待ち","doc_guide":"目論見書の株主構成を確認"},
      {"id":"lockup","index":"難・2","title":"VC保有・売り圧力","score":65,"why_matters":"VC比率が高いほど上場後の売り圧力リスクがある","verdict":"判断待ち","doc_guide":"大株主一覧を確認"},
      {"id":"timing","index":"難・3","title":"市場環境・上場タイミング","score":60,"why_matters":"市場全体の地合いが初値に影響する","description":"マクロ環境と同業他社の株価動向を確認","verdict":"判断待ち","doc_guide":"直近IPO銘柄の初値騰落率を参照"}
    ],
    "short": [
      {"id":"valuation","index":"週1-1","title":"バリュエーション・割安感","score":65,"why_matters":"公開価格と業績見通しのバランスが重要","description":"PERやPSRで同業比較する","verdict":"判断待ち","doc_guide":"目論見書の業績予想と公開価格を確認"},
      {"id":"vc_sell","index":"週1-2","title":"VC保有株の売り圧力タイミング","score":60,"why_matters":"ロックアップ解除後の売り圧力に注意","description":"大株主のロックアップ条件を確認","verdict":"判断待ち","doc_guide":"目論見書の大株主欄を確認"},
      {"id":"growth","index":"週1-3","title":"成長性・市場規模","score":65,"why_matters":"TAMが大きいほど長期成長余地がある","description":"市場規模と成長率を確認","verdict":"判断待ち","doc_guide":"目論見書の事業概要と市場分析を参照"}
    ],
    "long": [
      {"id":"management","index":"長キ-1","title":"経営陣・ガバナンス","score":70,"why_matters":"優秀な経営陣が長期的な競争優位を生む","description":"創業者や主要メンバーの経歴を確認","verdict":"判断待ち","doc_guide":"目論見書の役員一覧を参照"},
      {"id":"unit_econ","index":"長キ-2","title":"ユニットエコノミクス","score":60,"why_matters":"LTV/CACなどの指標が事業の持続性を示す","description":"解約率や顧客獲得コストを確認","verdict":"判断待ち","doc_guide":"目論見書の財務データを参照"},
      {"id":"competitor","index":"長キ-3","title":"競合優位性","score":65,"why_matters":"参入障壁の高さが長期収益を守る","description":"競合他社との差別化ポイントを分析","verdict":"判断待ち","doc_guide":"目論見書の競合他社比較を参照"}
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

    // Gemini整合性チェック
    try {
      const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
      const geminiModel = gemini.getGenerativeModel({ model: "gemini-2.0-flash" });
      const checkPrompt = `IPO企業の分析結果を整合性チェックしてください。企業：${company.name}（${company.sector}）。分析サマリー：${analysis.summary}\n問題がなければJSON：\n{"ok":true,"issues":""}\n問題があれば：\n{"ok":false,"issues":"問題の内容"}`;
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
            content: `IPO分析の整合性を修正してください。問題点：${check.issues}\n企業：${company.name}\n現在のsummary：${analysis.summary}\n修正後のsummaryのみJSONで返してください：\n{"summary":"修正後のテキスト","total_score":65,"grade":"B"}`
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