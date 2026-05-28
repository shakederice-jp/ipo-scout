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

const parseArr = (text: string): any[] => {
  if (!text) return [];
  try {
    const s=text.indexOf('['), e=text.lastIndexOf(']');
    if(s===-1||e===-1) return [];
    const raw = text.slice(s, e+1);
    try {
      const arr = JSON.parse(raw);
      if(Array.isArray(arr)&&arr.length>0) return arr.map((x:any)=>({...x,index:indexMap[x.id]||x.id}));
    } catch {}
    try {
      const arr = JSON.parse(raw.replace(/\r?\n/g,'\\n'));
      if(Array.isArray(arr)&&arr.length>0) return arr.map((x:any)=>({...x,index:indexMap[x.id]||x.id}));
    } catch {}
    return [];
  } catch { return []; }
};

const parseObj = (text: string): any => {
  if (!text) return null;
  try {
    const s=text.indexOf('{'), e=text.lastIndexOf('}');
    if(s===-1||e===-1) return null;
    return JSON.parse(text.slice(s,e+1));
  } catch { return null; }
};

const ALL_AXES = [
  {id:"float",title:"需給・ロック内容"},
  {id:"lockup",title:"VC・株主構成"},
  {id:"timing",title:"上場タイミング"},
  {id:"valuation",title:"バリュエーション"},
  {id:"vc_sell",title:"売り圧力リスク"},
  {id:"growth",title:"成長性"},
  {id:"management",title:"経営陣・ガバナンス"},
  {id:"unit_econ",title:"収益性・ユニットエコノミクス"},
  {id:"competitor",title:"競合・差別化"},
];

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

    const allAxesPrompt = `あなたは20年以上の経験を持つIPOアナリストです。「${n}」（${sec}業）について9つの投資軸を分析してください。

【ルール】専門用語はカッコで説明。出典明示（「目論見書・〇〇によると〜」）。①②③の小見出しで3段落。「つまり、初心者の方へのポイントは〜」で締め。平易な言葉。

JSON配列のみ返答（コードブロック禁止）：
[${ALL_AXES.map(({id,title})=>`{"id":"${id}","title":"${title}","score":65,"why_matters":"重要な理由を2文で","description":"①見出し\\n分析内容\\n\\n②見出し\\n独自の視点\\n\\n③まとめ。つまり、初心者の方へのポイントは〜","verdict":"一言評価","doc_guide":"目論見書の確認箇所"}`).join(",")}]`;

    const [sumRes, axesRes, insRes, scenRes] = await Promise.all([
      claude.messages.create({
        model:"claude-haiku-4-5-20251001", max_tokens:500,
        system:"JSONのみ返答。コードブロック禁止。",
        messages:[{role:"user",content:`「${n}」（${sec}業）IPO分析。初心者向け。JSON：{"summary":"投資価値と最大リスクを200字で","total_score":65,"grade":"B"}`}]
      }),
      claude.messages.create({
        model:"claude-sonnet-4-6", max_tokens:8000,
        system:"JSON配列のみ返答。コードブロック禁止。",
        messages:[{role:"user",content:allAxesPrompt}]
      }),
      claude.messages.create({
        model:"claude-haiku-4-5-20251001", max_tokens:500,
        system:"JSONのみ返答。コードブロック禁止。",
        messages:[{role:"user",content:`「${n}」（${sec}業）IPO投資で見落とされがちな重要ポイントTOP3。JSON配列のみ：[{"title":"タイトル","desc":"説明60字","icon":"trend-up"}]`}]
      }),
      claude.messages.create({
        model:"claude-haiku-4-5-20251001", max_tokens:500,
        system:"JSONのみ返答。コードブロック禁止。",
        messages:[{role:"user",content:`「${n}」（${sec}業）上場後6ヶ月の株価シナリオ3つ。JSON配列のみ：[{"id":"A","label":"強気","price_target":"+30%","rationale":"根拠"},{"id":"B","label":"中立","price_target":"+5%","rationale":"根拠"},{"id":"C","label":"弱気","price_target":"-15%","rationale":"根拠"}]`}]
      }),
    ]);

    const getText = (msg: any) => (msg.content[0] as any)?.text || "";

    let summary=`${n}は${sec}分野のIPO企業です。`, total_score=65, grade="B";
    try {
      const p=parseObj(getText(sumRes));
      if(p){summary=p.summary||summary;total_score=p.total_score||total_score;grade=p.grade||grade;}
    } catch {}

    const allAxes = parseArr(getText(axesRes));
    const ultra_short = allAxes.filter(x=>["float","lockup","timing"].includes(x.id));
    const short = allAxes.filter(x=>["valuation","vc_sell","growth"].includes(x.id));
    const long = allAxes.filter(x=>["management","unit_econ","competitor"].includes(x.id));
    const insights = parseArr(getText(insRes)).slice(0,3);
    const scenarios_short = parseArr(getText(scenRes)).slice(0,3);

    console.log(`allAxes:${allAxes.length} us:${ultra_short.length} sh:${short.length} lo:${long.length} ins:${insights.length} scen:${scenarios_short.length}`);

    const analysis = {
      summary, total_score, grade,
      insights: insights.length ? insights : [],
      scenarios_short: scenarios_short.length ? scenarios_short : [],
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