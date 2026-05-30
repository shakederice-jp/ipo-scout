export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const JP: Record<string,string> = {
  float:"需給の軽さ",lockup:"ロックアップ",timing:"上場タイミング",
  valuation:"バリュエーション",vc_sell:"VC売り圧力",growth:"成長性",
  management:"経営陣",unit_econ:"ユニットエコノミクス",competitor:"競合環境",
};

function extractJson(text: string): any {
  const clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
  const s = clean.indexOf('{');
  if (s === -1) return null;
  let d = 0, inS = false, esc = false;
  for (let i = s; i < clean.length; i++) {
    const c = clean[i];
    if (esc){esc=false;continue;}
    if (c==='\\'&&inS){esc=true;continue;}
    if (c==='"'){inS=!inS;continue;}
    if (inS) continue;
    if (c==='{') d++;
    if (c==='}'&&--d===0){
      try{return JSON.parse(clean.slice(s,i+1));}catch{return null;}
    }
  }
  return null;
}
 
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = createSupabaseServerClient();
    if (!supabase) return NextResponse.json({ error: "db" }, { status: 500 });

    const { data: co } = await supabase.from("ipo_companies").select("*").eq("id", body.id).single();
    if (!co) return NextResponse.json({ error: "not found" }, { status: 404 });

    const n  = co.name ?? "unknown";
    const sc = co.sector ?? "tech";
    const tk = co.ticker ?? "";
    const ld = co.listing_date ?? "2026";
    const ex = co.exchange ?? "グロース";
    const raw = co.raw_prospectus;
    const hasE = raw && Object.keys(raw).length > 0;

    // EDINETデータを整形
    const eCtx = hasE
      ? Object.entries(raw as Record<string,string>)
          .map(([k,v]) => `【${k}】\n${String(v).slice(0,1200)}`)
          .join('\n\n').slice(0, 6000)
      : "";

    console.log(`analyze: ${n} hasEDINET:${hasE} edinetChars:${eCtx.length}`);

    const prompt = `あなたは日本のIPO投資アナリストです。以下の企業のIPOを分析してください。

【企業基本情報】
会社名: ${n}
ティッカー: ${tk || "未定"}
市場: ${ex}
セクター: ${sc}
上場予定日: ${ld}
BB開始: ${co.bb_start_date || "未定"}
申込開始: ${co.apply_start_date || "未定"}

${hasE ? `【目論見書データ（EDINET取得済み）】\n${eCtx}\n\n上記の目論見書データを最優先で参照して分析してください。数値・事実は目論見書から引用してください。` : `【注意】目論見書データは未取得です。${n}に関する一般的な知識と${sc}セクターの特性に基づいて分析してください。`}

以下のJSON形式のみで回答してください（他のテキスト不要）:
{
  "summary": "${n}の200文字程度の投資家向けサマリー。${hasE ? '目論見書の具体的な数値を含めること' : ''}",
  "total_score": 65,
  "grade": "B",
  "insights": [
    {"title": "注目ポイント1のタイトル", "body": "2-3文の具体的な分析"},
    {"title": "注目ポイント2のタイトル", "body": "2-3文の具体的な分析"},
    {"title": "注目ポイント3のタイトル", "body": "2-3文の具体的な分析"}
  ],
  "scenarios": [
    {"id":"A","verdict":"強気","name":"強気シナリオ名","vsIpo":"公募価格の1.5倍","prob":"実現条件"},
    {"id":"B","verdict":"中立","name":"中立シナリオ名","vsIpo":"公募価格±10%","prob":"実現条件"},
    {"id":"C","verdict":"弱気","name":"弱気シナリオ名","vsIpo":"公募価格の0.8倍","prob":"実現条件"}
  ],
  "axes": [
    {"id":"float","score":65,"why_matters":"需給の軽さが重要な理由2文","description":"${n}の需給分析3-4文${hasE?'（目論見書の株数データを引用）':''}","verdict":"総評1-2文","doc_guide":"確認すべき目論見書セクション"},
    {"id":"lockup","score":60,"why_matters":"重要理由","description":"分析","verdict":"総評","doc_guide":"確認書類"},
    {"id":"timing","score":70,"why_matters":"重要理由","description":"分析","verdict":"総評","doc_guide":"確認書類"},
    {"id":"valuation","score":55,"why_matters":"重要理由","description":"分析","verdict":"総評","doc_guide":"確認書類"},
    {"id":"vc_sell","score":50,"why_matters":"重要理由","description":"分析","verdict":"総評","doc_guide":"確認書類"},
    {"id":"growth","score":75,"why_matters":"重要理由","description":"分析","verdict":"総評","doc_guide":"確認書類"},
    {"id":"management","score":65,"why_matters":"重要理由","description":"分析","verdict":"総評","doc_guide":"確認書類"},
    {"id":"unit_econ","score":60,"why_matters":"重要理由","description":"分析","verdict":"総評","doc_guide":"確認書類"},
    {"id":"competitor","score":55,"why_matters":"重要理由","description":"分析","verdict":"総評","doc_guide":"確認書類"}
  ]
}`;

    const msg = await claude.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }]
    });

    const text = (msg.content[0] as any).text ?? "";
    console.log("response_preview:", text.slice(0, 150));

    const parsed = extractJson(text);
    if (!parsed) {
      console.error("JSON parse failed:", text.slice(0, 300));
      return NextResponse.json({ error: "parse failed" }, { status: 500 });
    }

    const all = Array.isArray(parsed.axes)
      ? parsed.axes.map((x: any) => ({ ...x, label: JP[x.id] ?? x.id }))
      : [];

    const analysis = {
      summary:         parsed.summary ?? `${n}IPO分析`,
      total_score:     parsed.total_score ?? 65,
      grade:           parsed.grade ?? "B",
      insights:        Array.isArray(parsed.insights)  ? parsed.insights.slice(0,3)  : [],
      scenarios_short: Array.isArray(parsed.scenarios) ? parsed.scenarios.slice(0,3) : [],
      axes: {
        ultra_short: all.filter((x:any) => ["float","lockup","timing"].includes(x.id)),
        short:       all.filter((x:any) => ["valuation","vc_sell","growth"].includes(x.id)),
        long:        all.filter((x:any) => ["management","unit_econ","competitor"].includes(x.id)),
      },
      data_source:  hasE ? "EDINET+AI" : "AI",
      sources: [
        { label:"東証新規上場情報", url:"https://www.jpx.co.jp/listing/stocks/new/index.html" },
        { label:"EDINET・有価証券届出書", url:"https://disclosure2.edinet-fsa.go.jp/" },
        { label:"IPOkabu", url:"https://ipokabu.net/" },
      ],
      generated_at: new Date().toISOString(),
    };

    await supabase.from("ipo_companies").update({ analysis_detail: analysis }).eq("id", co.id);
    return NextResponse.json(analysis);
  } catch (e: any) {
    console.error("analyze error:", e?.message);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}