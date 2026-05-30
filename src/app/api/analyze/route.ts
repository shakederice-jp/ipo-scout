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
      ? Object.entries(raw as Record<string,string>).map(([k,v]) => `[${k}]\n${v}`).join('\n\n').slice(0, 5000)
      : "";

    console.log(`mode:${hasEdinet ? "EDINET" : "knowledge"} company:${n}`);

    const axesPrompt = `You are an IPO analyst. Analyze "${n}" (sector: ${sec}).${ctx ? ` Use this prospectus data:\n${ctx}` : ""}

Output ONLY valid JSON, no other text:
{"axes":[
{"id":"float","label":"needskyno_karusa","score":65,"why_matters":"why this matters for IPO investors","description":"detailed analysis 3-4 sentences","verdict":"overall assessment 1-2 sentences","doc_guide":"what documents to check"},
{"id":"lockup","label":"lockup","score":60,"why_matters":"...","description":"...","verdict":"...","doc_guide":"..."},
{"id":"timing","label":"timing","score":70,"why_matters":"...","description":"...","verdict":"...","doc_guide":"..."},
{"id":"valuation","label":"valuation","score":55,"why_matters":"...","description":"...","verdict":"...","doc_guide":"..."},
{"id":"vc_sell","label":"vc_sell","score":50,"why_matters":"...","description":"...","verdict":"...","doc_guide":"..."},
{"id":"growth","label":"growth","score":75,"why_matters":"...","description":"...","verdict":"...","doc_guide":"..."},
{"id":"management","label":"management","score":65,"why_matters":"...","description":"...","verdict":"...","doc_guide":"..."},
{"id":"unit_econ","label":"unit_econ","score":60,"why_matters":"...","description":"...","verdict":"...","doc_guide":"..."},
{"id":"competitor","label":"competitor","score":55,"why_matters":"...","description":"...","verdict":"...","doc_guide":"..."}
]}

Replace all "..." with real Japanese analysis content. Keep the exact JSON structure.`;

    const metaPrompt = `You are an IPO analyst. Analyze "${n}" (sector: ${sec}).${ctx ? ` Use this prospectus data:\n${ctx}` : ""}

Output ONLY valid JSON:
{"summary":"200 char Japanese summary","total_score":65,"grade":"B","insights":[{"title":"insight 1 title in Japanese","body":"2-3 sentence explanation in Japanese"},{"title":"insight 2","body":"explanation"},{"title":"insight 3","body":"explanation"}],"scenarios":[{"label":"強気","target":"公募価格の1.5倍","condition":"condition in Japanese"},{"label":"中立","target":"公募価格±10%","condition":"condition"},{"label":"弱気","target":"公募価格の0.8倍","condition":"condition"}]}

Replace placeholders with real Japanese analysis.`;

    const [axesMsg, metaMsg] = await Promise.all([
      claude.messages.create({ model: "claude-haiku-4-5", max_tokens: 3000, messages: [{ role: "user", content: axesPrompt }] }),
      claude.messages.create({ model: "claude-sonnet-4-6", max_tokens: 2000, messages: [{ role: "user", content: metaPrompt }] }),
    ]);

    const axesRaw = (axesMsg.content[0] as any).text ?? "";
    const metaRaw = (metaMsg.content[0] as any).text ?? "";
    console.log("axes_preview:", axesRaw.slice(0, 150));
    const axesData = extractJson(axesRaw);
    const metaData = extractJson(metaRaw);

    const allAxes     = Array.isArray(axesData?.axes) ? axesData.axes : [];
    const ultra_short = allAxes.filter((x: any) => ["float","lockup","timing"].includes(x.id));
    const short       = allAxes.filter((x: any) => ["valuation","vc_sell","growth"].includes(x.id));
    const long        = allAxes.filter((x: any) => ["management","unit_econ","competitor"].includes(x.id));

    console.log(`axes:${allAxes.length} us:${ultra_short.length} sh:${short.length} lo:${long.length} ins:${(metaData?.insights||[]).length}`);

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
