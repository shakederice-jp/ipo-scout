export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function extractJson(text: string): any {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) {
      try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

async function generateAxes(name: string, sector: string) {
  const msg = await claude.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 2500,
    messages: [{ role: "user", content: `IPO企業「${name}」（セクター:${sector}）の9軸投資分析をJSONのみで出力。前置き不要。{"axes":[{"id":"float","label":"需給の軽さ","score":70,"summary":"要点","detail":"詳細"},{"id":"lockup","label":"ロックアップ","score":65,"summary":"要点","detail":"詳細"},{"id":"timing","label":"上場タイミング","score":75,"summary":"要点","detail":"詳細"},{"id":"valuation","label":"バリュエーション","score":60,"summary":"要点","detail":"詳細"},{"id":"vc_sell","label":"VC売り圧力","score":55,"summary":"要点","detail":"詳細"},{"id":"growth","label":"成長性","score":80,"summary":"要点","detail":"詳細"},{"id":"management","label":"経営陣","score":70,"summary":"要点","detail":"詳細"},{"id":"unit_econ","label":"ユニットエコノミクス","score":65,"summary":"要点","detail":"詳細"},{"id":"competitor","label":"競合環境","score":60,"summary":"要点","detail":"詳細"}]}` }]
  });
  return extractJson((msg.content[0] as any).text ?? "");
}

async function generateMeta(name: string, sector: string) {
  const msg = await claude.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [{ role: "user", content: `IPO企業「${name}」（セクター:${sector}）の投資分析をJSONのみで出力。前置き不要。{"summary":"200字のサマリー","total_score":65,"grade":"B","insights":[{"title":"タイトル","body":"説明"},{"title":"タイトル","body":"説明"},{"title":"タイトル","body":"説明"}],"scenarios":[{"label":"強気","target":"公募価格の1.5倍","condition":"条件"},{"label":"中立","target":"公募価格±10%","condition":"条件"},{"label":"弱気","target":"公募価格の0.8倍","condition":"条件"}]}` }]
  });
  return extractJson((msg.content[0] as any).text ?? "");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = createSupabaseServerClient();
    if (!supabase) return NextResponse.json({ error: "db error" }, { status: 500 });

    const { data: company } = await supabase
      .from("ipo_companies")
      .select("*")
      .eq("id", body.id)
      .single();

    if (!company) return NextResponse.json({ error: "not found" }, { status: 404 });

    const n   = company.name   ?? "不明";
    const sec = company.sector ?? "テクノロジー";

    const [axesData, metaData] = await Promise.all([
      generateAxes(n, sec),
      generateMeta(n, sec),
    ]);

    const allAxes     = Array.isArray(axesData?.axes) ? axesData.axes : [];
    const ultra_short = allAxes.filter((x: any) => ["float","lockup","timing"].includes(x.id));
    const short       = allAxes.filter((x: any) => ["valuation","vc_sell","growth"].includes(x.id));
    const long        = allAxes.filter((x: any) => ["management","unit_econ","competitor"].includes(x.id));

    console.log(`axes:${allAxes.length} us:${ultra_short.length} sh:${short.length} lo:${long.length} ins:${(metaData?.insights||[]).length} scen:${(metaData?.scenarios||[]).length}`);

    const analysis = {
      summary:         metaData?.summary         ?? `${n}は${sec}分野のIPO企業です。`,
      total_score:     metaData?.total_score      ?? 65,
      grade:           metaData?.grade            ?? "B",
      insights:        Array.isArray(metaData?.insights)  ? metaData.insights.slice(0,3)  : [],
      scenarios_short: Array.isArray(metaData?.scenarios) ? metaData.scenarios.slice(0,3) : [],
      axes:            { ultra_short, short, long },
      sources: [
        { label: "東証新規上場情報",       url: "https://www.jpx.co.jp/listing/stocks/new/index.html" },
        { label: "EDINET・有価証券届出書", url: "https://disclosure2.edinet-fsa.go.jp/" },
        { label: "IPOkabu",               url: "https://ipokabu.net/" },
      ],
      generated_at: new Date().toISOString(),
    };

    await supabase.from("ipo_companies").update({ analysis_detail: analysis }).eq("id", company.id);
    return NextResponse.json(analysis);
  } catch (e: any) {
    console.error("analyze error:", e?.message);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
