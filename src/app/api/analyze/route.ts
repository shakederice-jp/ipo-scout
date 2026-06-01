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

    const structured = co.structured_data;
    const raw = co.raw_prospectus;
    const hasStructured = structured && Object.keys(structured).length > 0;
    const hasRaw = raw && Object.keys(raw).length > 0;

    let dataContext = "";
    let dataSource = "AI";

    if (hasStructured) {
      dataSource = "EDINET+Claude(3step)";
      // 各フィールドを厳密に文字数制限して合計2000字以内に
      const d = structured;
      dataContext = [
        `事業:${(d.business_summary??"").slice(0,150)}`,
        `売上:${d.financials?.revenue_trend??"不明"}`,
        `利益:${d.financials?.profit_trend??"不明"}`,
        `利益率:${d.financials?.profit_margin??"不明"}`,
        `発行済株:${d.ipo_details?.total_shares??"不明"}`,
        `公募売出:${d.ipo_details?.public_shares??"不明"}`,
        `流通比率:${d.ipo_details?.float_ratio??"不明"}`,
        `調達額:${d.ipo_details?.fundraising_amount??"不明"}`,
        `資金使途:${(d.ipo_details?.use_of_proceeds??"").slice(0,100)}`,
        `ロックアップ:${d.ipo_details?.lockup_period??"不明"}`,
        `ロックアップ対象:${(d.ipo_details?.lockup_targets??"").slice(0,100)}`,
        `OA:${d.ipo_details?.overallotment??"不明"}`,
        `株主:${JSON.stringify(d.shareholders??[]).slice(0,400)}`,
        `リスク:${JSON.stringify((d.risks??[]).slice(0,5)).slice(0,400)}`,
        `経営陣:${(d.management??"").slice(0,150)}`,
        `成長:${(d.growth_drivers??"").slice(0,150)}`,
        `懸念:${(d.concerns??"").slice(0,150)}`,
      ].join("\n").slice(0, 2000);
    } else if (hasRaw) {
      dataSource = "EDINET+Claude";
      dataContext = Object.entries(raw as Record<string,string>)
        .map(([k,v]) => `[${k}]${String(v).slice(0,400)}`)
        .join("\n")
        .slice(0, 2000);
    }

    const dataNote = dataContext
      ? `実データ（必ず数値を引用）:\n${dataContext}`
      : `実データ未取得。${n}(${sc})の一般情報で分析。`;

    // axesのdescriptionを80字、verdictを40字に制限するよう指示
    const prompt = `日本のIPOアナリストとして${n}(${sc},${ex},${ld})を分析。JSONのみ返答。

${dataNote}

必ずこの形式で返答（description最大80字、verdict最大40字）:
{"summary":"200字以内","total_score":65,"grade":"B","insights":[{"title":"20字以内","body":"80字以内"},{"title":"20字以内","body":"80字以内"},{"title":"20字以内","body":"80字以内"}],"scenarios":[{"id":"A","verdict":"強気","name":"強気シナリオ","vsIpo":"1.5倍","prob":"50字以内"},{"id":"B","verdict":"中立","name":"中立シナリオ","vsIpo":"±10%","prob":"50字以内"},{"id":"C","verdict":"弱気","name":"弱気シナリオ","vsIpo":"0.8倍","prob":"50字以内"}],"axes":[{"id":"float","score":65,"why_matters":"30字","description":"80字","verdict":"40字","doc_guide":"30字"},{"id":"lockup","score":60,"why_matters":"30字","description":"80字","verdict":"40字","doc_guide":"30字"},{"id":"timing","score":70,"why_matters":"30字","description":"80字","verdict":"40字","doc_guide":"30字"},{"id":"valuation","score":55,"why_matters":"30字","description":"80字","verdict":"40字","doc_guide":"30字"},{"id":"vc_sell","score":50,"why_matters":"30字","description":"80字","verdict":"40字","doc_guide":"30字"},{"id":"growth","score":75,"why_matters":"30字","description":"80字","verdict":"40字","doc_guide":"30字"},{"id":"management","score":65,"why_matters":"30字","description":"80字","verdict":"40字","doc_guide":"30字"},{"id":"unit_econ","score":60,"why_matters":"30字","description":"80字","verdict":"40字","doc_guide":"30字"},{"id":"competitor","score":55,"why_matters":"30字","description":"80字","verdict":"40字","doc_guide":"30字"}]}`;

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
    console.log("raw_preview:", text.slice(0, 200));
    console.log("raw_end:", text.slice(-150));

    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      for (let i = text.length - 1; i > text.length - 300; i--) {
        if (text[i] === '}') {
          try {
            parsed = JSON.parse(text.slice(0, i + 1));
            if (parsed?.axes) break;
          } catch { continue; }
        }
      }
    }

    if (!parsed) {
      console.error("parse failed:", text.slice(0, 400));
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