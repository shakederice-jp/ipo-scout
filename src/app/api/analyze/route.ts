export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const indexMap: Record<string,string> = {
  float:"週・1",lockup:"週・2",timing:"週・3",
  valuation:"週・1",vc_sell:"週・2",growth:"週・3",
  management:"長・1",unit_econ:"長・2",competitor:"長・3"
};

function safeParseArr(text: string): any[] {
  if (!text) return [];
  const s = text.indexOf('['), e = text.lastIndexOf(']');
  if (s === -1 || e === -1) return [];
  const raw = text.slice(s, e + 1);
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length > 0)
      return arr.map((x: any) => ({...x, index: indexMap[x.id] || x.id}));
  } catch {}
  try {
    let fixed = '', inString = false, escaped = false;
    for (const ch of raw) {
      if (escaped) { fixed += ch; escaped = false; continue; }
      if (ch === '\\') { fixed += ch; escaped = true; continue; }
      if (ch === '"') { inString = !inString; fixed += ch; continue; }
      if (inString && (ch === '\n' || ch === '\r')) { fixed += '\\n'; continue; }
      fixed += ch;
    }
    const arr = JSON.parse(fixed);
    if (Array.isArray(arr) && arr.length > 0)
      return arr.map((x: any) => ({...x, index: indexMap[x.id] || x.id}));
  } catch {}
  return [];
}

const getText = (msg: any) => (msg?.content?.[0] as any)?.text || "";

export async function POST(req: NextRequest) {
  try {
    const company = await req.json();
    const supabase = getSupabase();
    const { data } = await supabase
      .from("ipo_companies")
      .select("analysis_detail")
      .eq("id", company.id)
      .single();

    if(data?.analysis_detail){
      const d=data.analysis_detail as any;
      const hasAxes=(d.axes?.ultra_short?.length||0)>0;
      const fresh=(Date.now()-new Date(d.generated_at||0).getTime())/3600000<48;
      if(fresh&&hasAxes) return NextResponse.json(d);
    }

    const n=company.name, sec=company.sector||"不明";

    const axes = [
      {id:"float",title:"需給・ロック内容"},{id:"lockup",title:"VC・株主構成"},{id:"timing",title:"上場タイミング"},
      {id:"valuation",title:"バリュエーション"},{id:"vc_sell",title:"売り圧力リスク"},{id:"growth",title:"成長性"},
      {id:"management",title:"経営陣・ガバナンス"},{id:"unit_econ",title:"収益性・ユニットエコノミクス"},{id:"competitor",title:"競合・差別化"},
    ];

    // 2コールのみ（レート制限回避）
    const [metaMsg, axesMsg] = await Promise.all([
      // Call 1: Haiku でサマリー・インサイト・シナリオをまとめて
      claude.messages.create({
        model:"claude-haiku-4-5-20251001", max_tokens:1000,
        system:"JSONのみ返答。コードブロック禁止。",
        messages:[{role:"user",content:
          `「${n}」（${sec}業）のIPO分析をJSON1つで返答：
{"summary":"投資価値とリスクを200字で","total_score":65,"grade":"B",
"insights":[{"title":"注目点1","desc":"60字","icon":"trend-up"},{"title":"注目点2","desc":"60字","icon":"bar-chart"},{"title":"注目点3","desc":"60字","icon":"users"}],
"scenarios":[{"id":"A","label":"強気","price_target":"+30%","rationale":"根拠"},{"id":"B","label":"中立","price_target":"+5%","rationale":"根拠"},{"id":"C","label":"弱気","price_target":"-15%","rationale":"根拠"}]}`
        }]
      }),
      // Call 2: Sonnet で9軸分析（簡潔な説明）
      claude.messages.create({
        model:"claude-sonnet-4-6", max_tokens:2500,
        system:"JSON配列のみ返答。コードブロック禁止。",
        messages:[{role:"user",content:
          `「${n}」（${sec}業）のIPO投資分析。専門用語はカッコで説明。「目論見書・〇〇によると〜」で出典明示。①②③の小見出しで各1〜2文。最後は「つまり初心者へのポイントは〜」で締め。
JSON配列のみ：[${axes.map(({id,title})=>`{"id":"${id}","title":"${title}","score":65,"why_matters":"重要理由2文","description":"①見出し\\n内容\\n\\n②見出し\\n内容\\n\\n③つまり初心者へのポイントは〜","verdict":"一言","doc_guide":"確認箇所"}`).join(",")}]`
        }]
      }),
    ]);

    // メタデータのパース
    let summary=`${n}は${sec}分野のIPO企業です。`, total_score=65, grade="B";
    let insights: any[] = [], scenarios_short: any[] = [];
    try {
      const metaText = getText(metaMsg);
      const s=metaText.indexOf('{'), e=metaText.lastIndexOf('}');
      if(s!==-1&&e!==-1){
        const meta = JSON.parse(metaText.slice(s,e+1));
        if(meta.summary) summary=meta.summary;
        if(meta.total_score) total_score=meta.total_score;
        if(meta.grade) grade=meta.grade;
        if(Array.isArray(meta.insights)) insights=meta.insights.slice(0,3);
        if(Array.isArray(meta.scenarios)) scenarios_short=meta.scenarios.slice(0,3);
      }
    } catch {}

    // 軸データのパース
    const allAxes = safeParseArr(getText(axesMsg));
    const ultra_short = allAxes.filter(x=>["float","lockup","timing"].includes(x.id));
    const short = allAxes.filter(x=>["valuation","vc_sell","growth"].includes(x.id));
    const long = allAxes.filter(x=>["management","unit_econ","competitor"].includes(x.id));

    console.log(`allAxes:${allAxes.length} us:${ultra_short.length} sh:${short.length} lo:${long.length} ins:${insights.length} scen:${scenarios_short.length}`);

    const analysis = {
      summary, total_score, grade,
      insights: insights.length ? insights : [],
      scenarios_short,
      axes: { ultra_short, short, long },
      sources: [
        {label:"東証新規上場情報",url:"https://www.jpx.co.jp/listing/stocks/new/index.html"},
        {label:"EDINET・有価証券届出書",url:"https://disclosure2.edinet-fsa.go.jp/"},
        {label:"IPOkabu",url:"https://ipokabu.net/"},
      ],
      generated_at: new Date().toISOString()
    };

    await supabase.from("ipo_companies").update({analysis_detail:analysis}).eq("id",company.id);
    return NextResponse.json(analysis);
  } catch(e:any){
    console.error("error:",e?.message);
    return NextResponse.json({error:e?.message},{status:500});
  }
}