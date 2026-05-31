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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = createSupabaseServerClient();
    if (!supabase) return NextResponse.json({ error: "db" }, { status: 500 });

    const { data: co } = await supabase.from("ipo_companies").select("*").eq("id", body.id).single();
    if (!co) return NextResponse.json({ error: "not found" }, { status: 404 });

    const n  = co.name ?? "unknown";
    const sc = co.sector ?? "tech";
    const ld = co.listing_date ?? "2026";
    const ex = co.exchange ?? "グロース";
    const raw = co.raw_prospectus;
    const hasE = raw && Object.keys(raw).length > 0;

    const eCtx = hasE
      ? Object.entries(raw as Record<string,string>)
          .map(([k,v]) => `【${k}】\n${String(v).slice(0,1000)}`)
          .join('\n\n').slice(0, 4000)
      : "";

    console.log(`analyze: ${n} hasEDINET:${hasE} chars:${eCtx.length}`);

    const edinetNote = hasE
      ? `以下の目論見書データ（EDINET取得済み）を必ず参照して分析してください。具体的な数値・事実を引用すること：\n${eCtx}\n`
      : `目論見書データは未取得のため、${n}に関する一般知識と${sc}セクターの特性で分析してください。`;

    const prompt = `あなたは日本のIPO投資アナリストです。${n}（${sc}、${ex}市場、上場予定${ld}）のIPOを分析してください。必ずJSON形式のみで回答し、マークダウンや余分なテキストは一切含めないでください。

${edinetNote}

回答形式:
{"summary":"${n}の200文字の具体的な分析","total_score":65,"grade":"B","insights":[{"title":"具体的タイトル1","body":"具体的内容1"},{"title":"タイトル2","body":"内容2"},{"title":"タイトル3","body":"内容3"}],"scenarios":[{"id":"A","verdict":"強気","name":"強気シナリオ","vsIpo":"公募価格の1.5倍","prob":"実現条件"},{"id":"B","verdict":"中立","name":"中立シナリオ","vsIpo":"公募価格±10%","prob":"実現条件"},{"id":"C","verdict":"弱気","name":"弱気シナリオ","vsIpo":"公募価格の0.8倍","prob":"実現条件"}],"axes":[{"id":"float","score":65,"why_matters":"重要理由","description":"${n}固有の具体的分析","verdict":"総評","doc_guide":"確認書類"},{"id":"lockup","score":60,"why_matters":"重要理由","description":"分析","verdict":"総評","doc_guide":"確認書類"},{"id":"timing","score":70,"why_matters":"重要理由","description":"分析","verdict":"総評","doc_guide":"確認書類"},{"id":"valuation","score":55,"why_matters":"重要理由","description":"分析","verdict":"総評","doc_guide":"確認書類"},{"id":"vc_sell","score":50,"why_matters":"重要理由","description":"分析","verdict":"総評","doc_guide":"確認書類"},{"id":"growth","score":75,"why_matters":"重要理由","description":"分析","verdict":"総評","doc_guide":"確認書類"},{"id":"management","score":65,"why_matters":"重要理由","description":"分析","verdict":"総評","doc_guide":"確認書類"},{"id":"unit_econ","score":60,"why_matters":"重要理由","description":"分析","verdict":"総評","doc_guide":"確認書類"},{"id":"competitor","score":55,"why_matters":"重要理由","description":"分析","verdict":"総評","doc_guide":"確認書類"}]}`;

    const msg = await claude.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 3000,
      messages: [
        { role: "user", content: prompt },
        { role: "assistant", content: '{"summary":"' }
      ]
    });

    const raw2 = (msg.content[0] as any).text ?? "";
    const text = '{"summary":"' + raw2;
    console.log("raw_preview:", text.slice(0, 150));

    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      const lastBrace = text.lastIndexOf('}');
      if (lastBrace > 0) {
        try { parsed = JSON.parse(text.slice(0, lastBrace + 1)); } catch { parsed = null; }
      }
    }

    if (!parsed) {
      console.error("parse failed:", text.slice(0, 300));
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
      data_source: hasE ? "EDINET+AI" : "AI",
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