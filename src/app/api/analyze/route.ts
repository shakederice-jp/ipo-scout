export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const JP: Record<string,string> = {
  float:     "\u9700\u7d66\u306e\u8efd\u3055",
  lockup:    "\u30ed\u30c3\u30af\u30a2\u30c3\u30d7",
  timing:    "\u4e0a\u5834\u30bf\u30a4\u30df\u30f3\u30b0",
  valuation: "\u30d0\u30ea\u30e5\u30a8\u30fc\u30b7\u30e7\u30f3",
  vc_sell:   "VC\u58f2\u308a\u5727\u529b",
  growth:    "\u6210\u9577\u6027",
  management:"\u7d4c\u55b6\u9663",
  unit_econ: "\u30e6\u30cb\u30c3\u30c8\u30a8\u30b3\u30ce\u30df\u30af\u30b9",
  competitor:"\u7af6\u5408\u74b0\u5883",
};

function extractJson(text: string): any {
  const s = text.indexOf('{');
  if (s === -1) return null;
  let d = 0, inS = false, esc = false;
  for (let i = s; i < text.length; i++) {
    const c = text[i];
    if (esc) { esc = false; continue; }
    if (c === '\\' && inS) { esc = true; continue; }
    if (c === '"') { inS = !inS; continue; }
    if (inS) continue;
    if (c === '{') d++;
    if (c === '}' && --d === 0) {
      try { return JSON.parse(text.slice(s, i + 1)); } catch { return null; }
    }
  }
  return null;
}

async function fetchWebData(name: string, ticker: string): Promise<string> {
  if (!ticker) return "";
  const urls = [
    `https://minkabu.jp/stock/${ticker}`,
    `https://minkabu.jp/stock/${ticker}/settlement`,
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(7000),
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
      });
      if (!r.ok) continue;
      const html = await r.text();
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 4000);
      if (text.length > 300) {
        console.log("web_ok:", url, "len:", text.length);
        return text;
      }
    } catch (e) { console.log("web_fail:", url); }
  }
  return "";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = createSupabaseServerClient();
    if (!supabase) return NextResponse.json({ error: "db" }, { status: 500 });

    const { data: co } = await supabase.from("ipo_companies").select("*").eq("id", body.id).single();
    if (!co) return NextResponse.json({ error: "not found" }, { status: 404 });

    const n  = co.name   ?? "unknown";
    const sc = co.sector ?? "tech";
    const tk = co.ticker ?? "";
    const raw = co.raw_prospectus;
    const hasE = raw && Object.keys(raw).length > 0;
    const eCtx = hasE
      ? Object.entries(raw as Record<string,string>)
          .map(([k,v]) => `[${k}]\n${String(v).slice(0,1500)}`)
          .join('\n\n')
          .slice(0, 7000)
      : "";

    console.log(`mode:${hasE ? "EDINET" : "knowledge"} company:${n} ticker:${tk}`);

    const axesPrompt = `You are a Japanese IPO investment analyst with deep expertise. Analyze the IPO of "${n}" (sector: ${sc}).${eCtx ? `\n\nProspectus data available:\n${eCtx}` : ""}

IMPORTANT: Be specific and confident. Use your knowledge of the company, industry, and comparable IPOs to provide substantive analysis. Do NOT say "data is insufficient" - instead make intelligent estimates based on industry norms when specific data is unavailable.

Return ONLY valid JSON (no markdown, no code blocks):
{"axes":[
{"id":"float","score":65,"why_matters":"[2 Japanese sentences - why this matters for IPO investors]","description":"[3-4 Japanese sentences - specific analysis mentioning ${n} by name]","verdict":"[1-2 Japanese sentences - clear conclusion]","doc_guide":"[Japanese - specific documents/data to verify]"},
{"id":"lockup","score":60,"why_matters":"[Japanese]","description":"[Japanese specific to ${n}]","verdict":"[Japanese]","doc_guide":"[Japanese]"},
{"id":"timing","score":70,"why_matters":"[Japanese]","description":"[Japanese]","verdict":"[Japanese]","doc_guide":"[Japanese]"},
{"id":"valuation","score":55,"why_matters":"[Japanese]","description":"[Japanese]","verdict":"[Japanese]","doc_guide":"[Japanese]"},
{"id":"vc_sell","score":50,"why_matters":"[Japanese]","description":"[Japanese]","verdict":"[Japanese]","doc_guide":"[Japanese]"},
{"id":"growth","score":75,"why_matters":"[Japanese]","description":"[Japanese]","verdict":"[Japanese]","doc_guide":"[Japanese]"},
{"id":"management","score":65,"why_matters":"[Japanese]","description":"[Japanese]","verdict":"[Japanese]","doc_guide":"[Japanese]"},
{"id":"unit_econ","score":60,"why_matters":"[Japanese]","description":"[Japanese]","verdict":"[Japanese]","doc_guide":"[Japanese]"},
{"id":"competitor","score":55,"why_matters":"[Japanese]","description":"[Japanese]","verdict":"[Japanese]","doc_guide":"[Japanese]"}
]}`;

    const [axesMsg, webData] = await Promise.all([
      claude.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 6000,
        messages: [{ role: "user", content: axesPrompt }]
      }),
      fetchWebData(n, tk)
    ]);

    const fullCtx = [eCtx, webData ? "[Web\u30c7\u30fc\u30bf]\n" + webData : ""].filter(Boolean).join('\n\n').slice(0, 9000);

    const metaPrompt = `You are a Japanese IPO investment analyst with deep expertise. Analyze "${n}" (${sc}).${fullCtx ? `\n\n<analysis_data>\n${fullCtx}\n</analysis_data>\n\nUsing ALL available data above plus your expertise,` : ""} provide specific and actionable investment analysis. Be confident and specific - never say data is insufficient. Use industry knowledge to fill any gaps.

Return ONLY valid JSON (no markdown, no code blocks):
{"summary":"[200 char Japanese - specific and actionable, mention key figures if known]",
"total_score":65,
"grade":"B",
"insights":[
{"title":"[Japanese specific insight title]","body":"[2-3 sentences Japanese - specific, actionable insight with numbers where possible]"},
{"title":"[Japanese]","body":"[Japanese specific 2-3 sentences]"},
{"title":"[Japanese]","body":"[Japanese specific 2-3 sentences]"}
],
"scenarios":[
{"id":"A","verdict":"\u5f37\u6c17","name":"[Japanese scenario name]","vsIpo":"\u516c\u52df\u4fa1\u683c\u306e1.5\u500d","prob":"[specific Japanese condition]"},
{"id":"B","verdict":"\u4e2d\u7acb","name":"[Japanese]","vsIpo":"\u516c\u52df\u4fa1\u683c\u00b110%","prob":"[Japanese]"},
{"id":"C","verdict":"\u5f31\u6c17","name":"[Japanese]","vsIpo":"\u516c\u52df\u4fa1\u683c\u306e0.8\u500d","prob":"[Japanese]"}
]}`;

    const metaMsg = await claude.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2500,
      messages: [{ role: "user", content: metaPrompt }]
    });

    const axR = (axesMsg.content[0] as any).text ?? "";
    const mtR = (metaMsg.content[0] as any).text ?? "";
    console.log("axes_prev:", axR.slice(0, 120));
    console.log("web_data_len:", webData.length);

    const axD = extractJson(axR);
    const mtD = extractJson(mtR);

    const all = Array.isArray(axD?.axes)
      ? axD.axes.map((x: any) => ({ ...x, label: JP[x.id] ?? x.id }))
      : [];
    const us = all.filter((x: any) => ["float","lockup","timing"].includes(x.id));
    const sh = all.filter((x: any) => ["valuation","vc_sell","growth"].includes(x.id));
    const lo = all.filter((x: any) => ["management","unit_econ","competitor"].includes(x.id));

    console.log(`axes:${all.length} us:${us.length} sh:${sh.length} lo:${lo.length} ins:${(mtD?.insights||[]).length} scen:${(mtD?.scenarios||[]).length}`);

    const analysis = {
      summary:         mtD?.summary         ?? `${n}IPO\u5206\u6790`,
      total_score:     mtD?.total_score      ?? 65,
      grade:           mtD?.grade            ?? "B",
      insights:        Array.isArray(mtD?.insights)  ? mtD.insights.slice(0,3)  : [],
      scenarios_short: Array.isArray(mtD?.scenarios) ? mtD.scenarios.slice(0,3) : [],
      axes:            { ultra_short: us, short: sh, long: lo },
      data_source:     hasE ? "EDINET+Web" : "Web+AI",
      sources: [
        { label: "\u6771\u8a3c\u65b0\u898f\u4e0a\u5834\u60c5\u5831",       url: "https://www.jpx.co.jp/listing/stocks/new/index.html" },
        { label: "EDINET\u30fb\u6709\u4fa1\u8a3c\u5238\u5c4a\u51fa\u66f8", url: "https://disclosure2.edinet-fsa.go.jp/" },
        { label: "IPOkabu",                                                  url: "https://ipokabu.net/" },
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
