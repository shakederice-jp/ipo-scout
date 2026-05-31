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

    const { data: co } = await supabase
      .from("ipo_companies")
      .select("*")
      .eq("id", body.id)
      .single();
    if (!co) return NextResponse.json({ error: "not found" }, { status: 404 });

    const n  = co.name ?? "unknown";
    const sc = co.sector ?? "tech";
    const ld = co.listing_date ?? "2026";
    const ex = co.exchange ?? "グロース";

    // ① structured_data（Gemini構造化済み）を最優先で使用
    // ② なければ raw_prospectus（従来のEDINETテキスト）にフォールバック
    const structured = co.structured_data;
    const raw = co.raw_prospectus;

    const hasStructured = structured && Object.keys(structured).length > 0;
    const hasRaw = raw && Object.keys(raw).length > 0;

    let dataContext = "";
    let dataSource = "AI";

    if (hasStructured) {
      // Gemini構造化済みデータ → コンパクトで高品質
      dataSource = "EDINET+Gemini+Claude";
      dataContext = `
【Geminiが構造化した財務・事業データ】
事業概要: ${structured.business_summary ?? "不明"}

財務情報:
- 売上推移: ${structured.financials?.revenue_trend ?? "不明"}
- 利益推移: ${structured.financials?.profit_trend ?? "不明"}
- 利益率: ${structured.financials?.profit_margin ?? "不明"}
- キャッシュフロー: ${structured.financials?.cash_flow ?? "不明"}

IPO詳細:
- 調達金額: ${structured.ipo_details?.fundraising_amount ?? "不明"}
- 資金使途: ${structured.ipo_details?.use_of_proceeds ?? "不明"}
- ロックアップ: ${structured.ipo_details?.lockup_info ?? "不明"}

主要株主: ${JSON.stringify(structured.shareholders ?? []).slice(0, 500)}

リスク: ${JSON.stringify(structured.risks ?? []).slice(0, 800)}

経営陣: ${structured.management ?? "不明"}

成長要因: ${structured.growth_drivers ?? "不明"}

懸念点: ${structured.concerns ?? "不明"}
`.slice(0, 3500);

    } else if (hasRaw) {
      // 従来のEDINETテキスト（フォールバック）
      dataSource = "EDINET+Claude";
      dataContext = Object.entries(raw as Record<string,string>)
        .map(([k,v]) => `【${k}】\n${String(v).slice(0, 800)}`)
        .join('\n\n')
        .slice(0, 3000);
    }

    console.log(`analyze: ${n} source:${dataSource} ctxLen:${dataContext.length}`);

    const dataNote = dataContext
      ? `以下の実データを必ず参照し、具体的な数値・事実を引用して分析してください：\n${dataContext}\n`
      : `実データ未取得のため、${n}（${sc}セクター）の一般情報で分析してください。`;

    const prompt = `あなたは日本のIPO投資アナリストです。${n}（${sc}、${ex}市場、上場予定${ld}）のIPOを分析してください。必ずJSON形式のみで回答し、マークダウンや余分なテキストは一切含めないでください。

${dataNote}

回答形式:
{"summary":"${n}の200文字の具体的な分析（実データの数値を必ず含める）","total_score":65,"grade":"B","insights":[{"title":"具体的タイトル1","body":"具体的内容1（数値引用）"},{"title":"タイトル2","body":"内容2"},{"title":"タイトル3","body":"内容3"}],"scenarios":[{"id":"A","verdict":"強気","name":"強気シナリオ","vsIpo":"公募価格の1.5倍","prob":"実現条件"},{"id":"B","verdict":"中立","name":"中立シナリオ","vsIpo":"公募価格±10%","prob":"実現条件"},{"id":"C","verdict":"弱気","name":"弱気シナリオ","vsIpo":"公募価格の0.8倍","prob":"実現条件"}],"axes":[{"id":"float","score":65,"why_matters":"重要理由","description":"${n}固有の具体的分析（数値引用）","verdict":"総評","doc_guide":"確認書類"},{"id":"lockup","score":60,"why_matters":"重要理由","description":"分析","verdict":"総評","doc_guide":"確認書類"},{"id":"timing","score":70,"why_matters":"重要理由","description":"分析","verdict":"総評","doc_guide":"確認書類"},{"id":"valuation","score":55,"why_matters":"重要理由","description":"分析","verdict":"総評","doc_guide":"確認書類"},{"id":"vc_sell","score":50,"why_matters":"重要理由","description":"分析","verdict":"総評","doc_guide":"確認書類"},{"id":"growth","score":75,"why_matters":"重要理由","description":"分析","verdict":"総評","doc_guide":"確認書類"},{"id":"management","score":65,"why_matters":"重要理由","description":"分析","verdict":"総評","doc_guide":"確認書類"},{"id":"unit_econ","score":60,"why_matters":"重要理由","description":"分析","verdict":"総評","doc_guide":"確認書類"},{"id":"competitor","score":55,"why_matters":"重要理由","description":"分析","verdict":"総評","doc_guide":"確認書類"}]}`;

    const msg = await claude.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 4000,
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
      data_source: dataSource,
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