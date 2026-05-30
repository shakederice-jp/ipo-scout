export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AXIS_LABELS: Record<string,string> = {
  float:"needskyno_karusa", lockup:"lockup", timing:"timing",
  valuation:"valuation", vc_sell:"vc_sell", growth:"growth",
  management:"management", unit_econ:"unit_econ", competitor:"competitor"
};

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

    const n   = company.name   ?? "unknown";
    const sec = company.sector ?? "tech";
    const raw = company.raw_prospectus;
    const hasEdinet = raw && Object.keys(raw).length > 0;
    const ctx = hasEdinet
      ? Object.entries(raw as Record<string,string>).map(([k,v]) => `[${k}] ${String(v).slice(0,600)}`).join('\n').slice(0,4000)
      : "";

    console.log(`mode:${hasEdinet ? "EDINET" : "knowledge"} company:${n}`);

    const axesPrompt = `You are a Japanese IPO analyst. Analyze the IPO of "${n}" (sector: ${sec}).${ctx ? ` Use this prospectus data:\n---\n${ctx}\n---` : ""}

Output ONLY this JSON with real Japanese analysis (replace all placeholder text):
{"axes":[
{"id":"float","score":65,"why_matters":"[2 sentences Japanese]","description":"[3-4 sentences Japanese specific analysis]","verdict":"[1-2 sentences Japanese conclusion]","doc_guide":"[Japanese: what docs to check]"},
{"id":"lockup","score":60,"why_matters":"[Japanese]","description":"[Japanese]","verdict":"[Japanese]","doc_guide":"[Japanese]"},
{"id":"timing","score":70,"why_matters":"[Japanese]","description":"[Japanese]","verdict":"[Japanese]","doc_guide":"[Japanese]"},
{"id":"valuation","score":55,"why_matters":"[Japanese]","description":"[Japanese]","verdict":"[Japanese]","doc_guide":"[Japanese]"},
{"id":"vc_sell","score":50,"why_matters":"[Japanese]","description":"[Japanese]","verdict":"[Japanese]","doc_guide":"[Japanese]"},
{"id":"growth","score":75,"why_matters":"[Japanese]","description":"[Japanese]","verdict":"[Japanese]","doc_guide":"[Japanese]"},
{"id":"management","score":65,"why_matters":"[Japanese]","description":"[Japanese]","verdict":"[Japanese]","doc_guide":"[Japanese]"},
{"id":"unit_econ","score":60,"why_matters":"[Japanese]","description":"[Japanese]","verdict":"[Japanese]","doc_guide":"[Japanese]"},
{"id":"competitor","score":55,"why_matters":"[Japanese]","description":"[Japanese]","verdict":"[Japanese]","doc_guide":"[Japanese]"}
]}`;

    const metaPrompt = `You are a Japanese IPO analyst. Analyze the IPO of "${n}" (sector: ${sec}).${ctx ? ` Use this prospectus data:\n---\n${ctx}\n---` : ""}

Output ONLY this JSON with real Japanese content:
{"summary":"[200 char Japanese summary]","total_score":65,"grade":"B",
"insights":[
{"title":"[Japanese title]","body":"[2-3 sentences Japanese]"},
{"title":"[Japanese title]","body":"[2-3 sentences Japanese]"},
{"title":"[Japanese title]","body":"[2-3 sentences Japanese]"}
],
"scenarios":[
{"id":"A","verdict":"[強気 or 中立 or 弱気]","name":"[scenario name in Japanese]","vsIpo":"[e.g. 公募価格の1.5倍]","prob":"[condition in Japanese]"},
{"id":"B","verdict":"[強気 or 中立 or 弱気]","name":"[scenario name]","vsIpo":"[e.g. 公募価格±10%]","prob":"[condition]"},
{"id":"C","verdict":"[強気 or 中立 or 弱気]","name":"[scenario name]","vsIpo":"[e.g. 公募価格の0.8倍]","prob":"[condition]"}
]}`;

    const [axesMsg, metaMsg] = await Promise.all([
      claude.messages.create({ model: "claude-haiku-4-5", max_tokens: 6000, messages: [{ role: "user", content: axesPrompt }] }),
      claude.messages.create({ model: "claude-sonnet-4-6", max_tokens: 2000, messages: [{ role: "user", content: metaPrompt }] }),
    ]);

    const axesRaw = (axesMsg.content[0] as any).text ?? "";
    const metaRaw = (metaMsg.content[0] as any).text ?? "";
    console.log("axes_preview:", axesRaw.slice(0, 200));

    const axesData = extractJson(axesRaw);
    const metaData = extractJson(metaRaw);

    const LABELS: Record<string,string> = {
      float:"needskyno_karusa",lockup:"lockup",timing:"timing",
      valuation:"valuation",vc_sell:"vc_sell",growth:"growth",
      management:"management",unit_econ:"unit_econ",competitor:"competitor"
    };

    const allAxes = Array.isArray(axesData?.axes)
      ? axesData.axes.map((x: any) => ({ ...x, label: LABELS[x.id] ?? x.id }))
      : [];
    const ultra_short = allAxes.filter((x: any) => ["float","lockup","timing"].includes(x.id));
    const short       = allAxes.filter((x: any) => ["valuation","vc_sell","growth"].includes(x.id));
    const long        = allAxes.filter((x: any) => ["management","unit_econ","competitor"].includes(x.id));

    console.log(`axes:${allAxes.length} us:${ultra_short.length} sh:${short.length} lo:${long.length} ins:${(metaData?.insights||[]).length} scen:${(metaData?.scenarios||[]).length}`);

    const analysis = {
      summary:         metaData?.summary         ?? `${n}のIPO分析`,
      total_score:     metaData?.total_score      ?? 65,
      grade:           metaData?.grade            ?? "B",
      insights:        Array.isArray(metaData?.insights)  ? metaData.insights.slice(0,3)  : [],
      scenarios_short: Array.isArray(metaData?.scenarios) ? metaData.scenarios.slice(0,3) : [],
      axes:            { ultra_short, short, long },
      data_source:     hasEdinet ? "EDINET" : "AI",
      sources: [
        { label: "東証新規上場情報", url: "https://www.jpx.co.jp/listing/stocks/new/index.html" },
        { label: "EDINET・有価証券届出書", url: "https://disclosure2.edinet-fsa.go.jp/" },
        { label: "IPOkabu", url: "https://ipokabu.net/" },
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

