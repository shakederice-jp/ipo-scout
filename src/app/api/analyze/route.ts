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

async function runWithWebSearch(messages: any[]): Promise<string> {
  let msgs = [...messages];
  for (let i = 0; i < 5; i++) {
    const res = await (claude.messages.create as any)({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: msgs
    });
    const text = (res.content as any[]).filter(b => b.type === "text").map(b => b.text).join("\n");
    if (res.stop_reason === "end_turn") return text;
    if (res.stop_reason === "tool_use") {
      msgs.push({ role: "assistant", content: res.content });
      const results = (res.content as any[])
        .filter(b => b.type === "tool_use")
        .map(b => ({ type: "tool_result", tool_use_id: b.id, content: Array.isArray(b.content) ? b.content : (b.content ?? "") }));
      msgs.push({ role: "user", content: results });
    } else { return text; }
  }
  return "";
}

async function generateMetaFallback(messages: any[]): Promise<string> {
  const res = await claude.messages.create({ model: "claude-sonnet-4-6", max_tokens: 2500, messages });
  return (res.content as any[]).filter(b => b.type === "text").map(b => b.text).join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = createSupabaseServerClient();
    if (!supabase) return NextResponse.json({ error: "db" }, { status: 500 });

    const { data: co } = await supabase.from("ipo_companies").select("*").eq("id", body.id).single();
    if (!co) return NextResponse.json({ error: "not found" }, { status: 404 });

    const n  = co.name         ?? "unknown";
    const sc = co.sector       ?? "tech";
    const tk = co.ticker       ?? "";
    const ld = co.listing_date ?? "2026";
    const ex = co.exchange     ?? "\u30b0\u30ed\u30fc\u30b9";
    const raw = co.raw_prospectus;
    const hasE = raw && Object.keys(raw).length > 0;
    const eCtx = hasE
      ? Object.entries(raw as Record<string,string>)
          .map(([k,v]) => `[${k}]\n${String(v).slice(0,800)}`)
          .join('\n\n').slice(0, 4000)
      : "";

    // ハルシネーション防止：正確な企業情報を注入
    const facts = `[VERIFIED FACTS - MUST USE EXACTLY AS STATED]
Company name: ${n}
Ticker: ${tk || "TBD"}
Market: ${ex}
Sector: ${sc}
IPO listing date: ${ld} (THIS IS A NEW IPO - no stock market history before ${ld})
BB period start: ${co.bb_start_date || "TBD"}
Application start: ${co.apply_start_date || "TBD"}
CRITICAL: Do NOT fabricate historical listing data. This company has NOT been listed before.`;

    console.log(`company:${n} ticker:${tk} date:${ld} hasE:${hasE}`);

    const axesPrompt = `You are a Japanese IPO investment analyst.

${facts}

Analyze the UPCOMING IPO of "${n}" (${sc} sector). Do NOT invent historical listing events. Return ONLY JSON:
{"axes":[
{"id":"float","score":65,"why_matters":"[2 sentences Japanese]","description":"[3-4 sentences Japanese - analysis specific to ${n} IPO]","verdict":"[1-2 sentences Japanese]","doc_guide":"[Japanese - specific prospectus sections to check]"},
{"id":"lockup","score":60,"why_matters":"[Japanese]","description":"[Japanese]","verdict":"[Japanese]","doc_guide":"[Japanese]"},
{"id":"timing","score":70,"why_matters":"[Japanese]","description":"[Japanese]","verdict":"[Japanese]","doc_guide":"[Japanese]"},
{"id":"valuation","score":55,"why_matters":"[Japanese]","description":"[Japanese]","verdict":"[Japanese]","doc_guide":"[Japanese]"},
{"id":"vc_sell","score":50,"why_matters":"[Japanese]","description":"[Japanese]","verdict":"[Japanese]","doc_guide":"[Japanese]"},
{"id":"growth","score":75,"why_matters":"[Japanese]","description":"[Japanese]","verdict":"[Japanese]","doc_guide":"[Japanese]"},
{"id":"management","score":65,"why_matters":"[Japanese]","description":"[Japanese]","verdict":"[Japanese]","doc_guide":"[Japanese]"},
{"id":"unit_econ","score":60,"why_matters":"[Japanese]","description":"[Japanese]","verdict":"[Japanese]","doc_guide":"[Japanese]"},
{"id":"competitor","score":55,"why_matters":"[Japanese]","description":"[Japanese]","verdict":"[Japanese]","doc_guide":"[Japanese]"}
]}`;

    const metaContent = `You are a Japanese IPO investment analyst.

${facts}
${eCtx ? `\nEDINET prospectus data:\n${eCtx}\n` : ""}

TASK: Search the web for current information about "${n}" (ticker: ${tk}) IPO listing on ${ld}, then write investment analysis.

Search for: business overview, revenue/profit data, major shareholders, competitors, management team, market size.

After searching, return ONLY this JSON:
{"summary":"[200 char Japanese - specific with real data]","total_score":65,"grade":"B","insights":[{"title":"[Japanese specific title based on research]","body":"[2-3 sentences Japanese with specific facts]"},{"title":"[Japanese]","body":"[Japanese]"},{"title":"[Japanese]","body":"[Japanese]"}],"scenarios":[{"id":"A","verdict":"\u5f37\u6c17","name":"[Japanese scenario name]","vsIpo":"\u516c\u52df\u4fa1\u683c\u306e1.5\u500d","prob":"[Japanese specific condition]"},{"id":"B","verdict":"\u4e2d\u7acb","name":"[Japanese]","vsIpo":"\u516c\u52df\u4fa1\u683c\u00b110%","prob":"[Japanese]"},{"id":"C","verdict":"\u5f31\u6c17","name":"[Japanese]","vsIpo":"\u516c\u52df\u4fa1\u683c\u306e0.8\u500d","prob":"[Japanese]"}]}`;

    const [axesMsg, metaText] = await Promise.all([
      claude.messages.create({ model: "claude-haiku-4-5", max_tokens: 6000, messages: [{ role: "user", content: axesPrompt }] }),
      runWithWebSearch([{ role: "user", content: metaContent }]).catch(async (e) => {
        console.log("web_search_failed, fallback:", e?.message);
        return generateMetaFallback([{ role: "user", content: metaContent }]);
      })
    ]);

    const axR = (axesMsg.content[0] as any).text ?? "";
    console.log("axes_prev:", axR.slice(0,100));
    console.log("meta_prev:", metaText.slice(0,100));

    const axD = extractJson(axR);
    const mtD = extractJson(metaText);

    const all = Array.isArray(axD?.axes) ? axD.axes.map((x:any) => ({...x, label: JP[x.id] ?? x.id})) : [];
    const us = all.filter((x:any) => ["float","lockup","timing"].includes(x.id));
    const sh = all.filter((x:any) => ["valuation","vc_sell","growth"].includes(x.id));
    const lo = all.filter((x:any) => ["management","unit_econ","competitor"].includes(x.id));

    console.log(`axes:${all.length} us:${us.length} sh:${sh.length} lo:${lo.length} ins:${(mtD?.insights||[]).length} scen:${(mtD?.scenarios||[]).length}`);

    const analysis = {
      summary:         mtD?.summary ?? `${n}IPO\u5206\u6790`,
      total_score:     mtD?.total_score ?? 65,
      grade:           mtD?.grade ?? "B",
      insights:        Array.isArray(mtD?.insights)  ? mtD.insights.slice(0,3)  : [],
      scenarios_short: Array.isArray(mtD?.scenarios) ? mtD.scenarios.slice(0,3) : [],
      axes:            { ultra_short: us, short: sh, long: lo },
      data_source:     hasE ? "EDINET+WebSearch" : "WebSearch+AI",
      sources: [
        { label: "\u6771\u8a3c\u65b0\u898f\u4e0a\u5834\u60c5\u5831",       url: "https://www.jpx.co.jp/listing/stocks/new/index.html" },
        { label: "EDINET\u30fb\u6709\u4fa1\u8a3c\u5238\u5c4a\u51fa\u66f8", url: "https://disclosure2.edinet-fsa.go.jp/" },
        { label: "IPOkabu", url: "https://ipokabu.net/" },
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
