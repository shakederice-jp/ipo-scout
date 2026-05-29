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

/* Claude Haiku: 9霆ｸ繧ｹ繧ｳ繧｢縺ｮ縺ｿ逕滓・・磯ｫ倬溘・菴弱さ繧ｹ繝茨ｼ・*/
async function generateAxes(name: string, sector: string) {
  const msg = await claude.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 2500,
    messages: [{
      role: "user",
      content: `IPO莨∵･ｭ縲・{name}縲搾ｼ医そ繧ｯ繧ｿ繝ｼ:${sector}・峨・9霆ｸ謚戊ｳ・・譫舌ｒJSON縺ｮ縺ｿ縺ｧ蜃ｺ蜉帙＠縺ｦ縺上□縺輔＞縲ょ燕鄂ｮ縺阪・隱ｬ譏取枚荳崎ｦ√・

{"axes":[
{"id":"float","label":"髴邨ｦ縺ｮ霆ｽ縺・,"score":70,"summary":"蜈ｬ蜍滓ｪ謨ｰ繝ｻ繧ｪ繝ｼ繝舌・繧｢繝ｭ繝・ヨ繝｡繝ｳ繝育ｭ峨・髴邨ｦ蛻・梵","detail":"髴邨ｦ縺ｫ髢｢縺吶ｋ隧ｳ邏ｰ蛻・梵繧・縲・譁・〒"},
{"id":"lockup","label":"繝ｭ繝・け繧｢繝・・","score":65,"summary":"荳ｻ隕∵ｪ荳ｻ縺ｮ繝ｭ繝・け繧｢繝・・迥ｶ豕・,"detail":"繝ｭ繝・け繧｢繝・・譛滄俣繝ｻ隗｣髯､蠕後Μ繧ｹ繧ｯ縺ｮ隧ｳ邏ｰ"},
{"id":"timing","label":"荳雁ｴ繧ｿ繧､繝溘Φ繧ｰ","score":75,"summary":"蟶ょｴ迺ｰ蠅・・讌ｭ逡後ヨ繝ｬ繝ｳ繝峨→縺ｮ驕ｩ蜷域ｧ","detail":"繝槭け繝ｭ迺ｰ蠅・・繧ｻ繧ｯ繧ｿ繝ｼ繝医Ξ繝ｳ繝峨・隧ｳ邏ｰ"},
{"id":"valuation","label":"繝舌Μ繝･繧ｨ繝ｼ繧ｷ繝ｧ繝ｳ","score":60,"summary":"PER繝ｻPSR遲峨・蜑ｲ螳峨・蜑ｲ鬮伜愛譁ｭ","detail":"鬘樔ｼｼ莨∵･ｭ豈碑ｼ・・謌宣聞邇・・・縺ｮ隧ｳ邏ｰ"},
{"id":"vc_sell","label":"VC螢ｲ繧雁悸蜉・,"score":55,"summary":"VC繝ｻPE菫晄怏豈皮紫縺ｨ螢ｲ繧雁悸蜉帙Μ繧ｹ繧ｯ","detail":"荳ｻ隕∵ｪ荳ｻ讒区・繝ｻ貎懷惠逧・｣ｲ繧雁悸蜉帙・隧ｳ邏ｰ"},
{"id":"growth","label":"謌宣聞諤ｧ","score":80,"summary":"螢ｲ荳頑・髟ｷ邇・・TAM繝ｻ遶ｶ莠牙━菴肴ｧ","detail":"謌宣聞繝峨Λ繧､繝舌・縺ｨ謖∫ｶ壼庄閭ｽ諤ｧ縺ｮ隧ｳ邏ｰ"},
{"id":"management","label":"邨悟霧髯｣","score":70,"summary":"蜑ｵ讌ｭ閠・・邨悟霧繝√・繝縺ｮ螳溽ｸｾ縺ｨ雉ｪ","detail":"邨悟霧髯｣縺ｮ閭梧勹繝ｻ螳溽ｸｾ繝ｻ蝣ｱ驟ｬ菴鍋ｳｻ縺ｮ隧ｳ邏ｰ"},
{"id":"unit_econ","label":"繝ｦ繝九ャ繝医お繧ｳ繝弱Α繧ｯ繧ｹ","score":65,"summary":"LTV/CAC繝ｻ邊怜茜邇・・蝟ｶ讌ｭ繝ｬ繝舌Ξ繝・ず","detail":"蜿守寢繝｢繝・Ν縺ｮ蜉ｹ邇・ｧ縺ｨ謾ｹ蝟・ｽ吝慍縺ｮ隧ｳ邏ｰ"},
{"id":"competitor","label":"遶ｶ蜷育腸蠅・,"score":60,"summary":"遶ｶ蜷亥━菴肴ｧ縺ｨ蟶ょｴ繝昴ず繧ｷ繝ｧ繝ｳ","detail":"遶ｶ蜷井ｻ也､ｾ豈碑ｼ・・蜿ょ・髫懷｣√・隧ｳ邏ｰ"}
]}`
    }]
  });
  const raw = (msg.content[0] as any).text ?? "";
  console.log("axes_raw_preview:", raw.slice(0, 100));
  return extractJson(raw);
}

/* Claude Sonnet: 隕∫ｴ・・繧､繝ｳ繧ｵ繧､繝医・繧ｷ繝翫Μ繧ｪ逕滓・・磯ｫ伜刀雉ｪ・・*/
async function generateMeta(name: string, sector: string) {
  const msg = await claude.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: `IPO莨∵･ｭ縲・{name}縲搾ｼ医そ繧ｯ繧ｿ繝ｼ:${sector}・峨・謚戊ｳ・ｮｶ蜷代￠蛻・梵繧谷SON縺ｮ縺ｿ縺ｧ蜃ｺ蜉帙＠縺ｦ縺上□縺輔＞縲ょ燕鄂ｮ縺阪・隱ｬ譏取枚荳崎ｦ√・

{"summary":"縺薙・莨∵･ｭ縺ｮ繝薙ず繝阪せ繝｢繝・Ν繝ｻIPO縺ｮ豕ｨ逶ｮ轤ｹ繝ｻ謚戊ｳ・ｮｶ縺檎衍繧九∋縺阪・繧､繝ｳ繝医ｒ200蟄礼ｨ句ｺｦ縺ｧ","total_score":65,"grade":"B",
"insights":[
{"title":"譛驥崎ｦ∵ｳｨ逶ｮ繝昴う繝ｳ繝医・繧ｿ繧､繝医Ν","body":"2縲・譁・・蜈ｷ菴鍋噪縺ｪ隱ｬ譏・},
{"title":"隨ｬ2縺ｮ豕ｨ逶ｮ繝昴う繝ｳ繝・,"body":"2縲・譁・},
{"title":"隨ｬ3縺ｮ豕ｨ逶ｮ繝昴う繝ｳ繝・,"body":"2縲・譁・}
],
"scenarios":[
{"label":"蠑ｷ豌励す繝翫Μ繧ｪ","target":"蜈ｬ蜍滉ｾ｡譬ｼ縺ｮ笳ｯ蛟・,"condition":"縺薙・繧ｷ繝翫Μ繧ｪ縺悟ｮ溽樟縺吶ｋ蜈ｷ菴鍋噪譚｡莉ｶ"},
{"label":"荳ｭ遶九す繝翫Μ繧ｪ","target":"蜈ｬ蜍滉ｾ｡譬ｼﾂｱ笳ｯ%","condition":"譛繧り搭辟ｶ諤ｧ縺ｮ鬮倥＞螻暮幕"},
{"label":"蠑ｱ豌励す繝翫Μ繧ｪ","target":"蜈ｬ蜍滉ｾ｡譬ｼ縺ｮ笳ｯ蛟・,"condition":"荳区険繧後Μ繧ｹ繧ｯ縺ｨ譚｡莉ｶ"}
]}`
    }]
  });
  const raw = (msg.content[0] as any).text ?? "";
  console.log("meta_raw_preview:", raw.slice(0, 100));
  return extractJson(raw);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = createSupabaseServerClient();`n    if (!supabase) return NextResponse.json({ error: "db error" }, { status: 500 });`n    const { data: company } = await supabase
      .from("ipo_companies")
      .select("*")
      .eq("id", body.id)
      .single();

    if (!company) return NextResponse.json({ error: "not found" }, { status: 404 });

    const n   = company.name   ?? "荳肴・";
    const sec = company.sector ?? "繝・け繝弱Ο繧ｸ繝ｼ";

    /* Haiku・・霆ｸ・峨→ Sonnet・郁ｦ∫ｴ・・insights・峨ｒ荳ｦ蛻怜ｮ溯｡・*/
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
      summary:         metaData?.summary         ?? `${n}縺ｯ${sec}蛻・㍽縺ｮIPO莨∵･ｭ縺ｧ縺吶Ａ,
      total_score:     metaData?.total_score      ?? 65,
      grade:           metaData?.grade            ?? "B",
      insights:        Array.isArray(metaData?.insights)  ? metaData.insights.slice(0,3)  : [],
      scenarios_short: Array.isArray(metaData?.scenarios) ? metaData.scenarios.slice(0,3) : [],
      axes:            { ultra_short, short, long },
      sources: [
        { label: "譚ｱ險ｼ譁ｰ隕丈ｸ雁ｴ諠・ｱ",       url: "https://www.jpx.co.jp/listing/stocks/new/index.html" },
        { label: "EDINET繝ｻ譛我ｾ｡險ｼ蛻ｸ螻雁・譖ｸ", url: "https://disclosure2.edinet-fsa.go.jp/" },
        { label: "IPOkabu",               url: "https://ipokabu.net/" },
      ],
      generated_at: new Date().toISOString(),
    };

    await supabase
      .from("ipo_companies")
      .update({ analysis_detail: analysis })
      .eq("id", company.id);

    return NextResponse.json(analysis);
  } catch (e: any) {
    console.error("analyze error:", e?.message);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
