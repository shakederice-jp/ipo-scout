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
  float:"難・1",lockup:"難・2",timing:"難・3",
  valuation:"週・1",vc_sell:"週・2",growth:"週・3",
  management:"長・1",unit_econ:"長・2",competitor:"長・3"
};
const parseArr = (text: string): any[] => {
  try {
    const s=text.indexOf('['), e=text.lastIndexOf(']');
    if(s===-1||e===-1) return [];
    const arr=JSON.parse(text.slice(s,e+1));
    if(Array.isArray(arr)&&arr.length>0) return arr.map((x:any)=>({...x,index:indexMap[x.id]||x.id}));
    return [];
  } catch { return []; }
};
const parseObj = (text: string): any => {
  try {
    const s=text.indexOf('{'), e=text.lastIndexOf('}');
    if(s===-1||e===-1) return null;
    return JSON.parse(text.slice(s,e+1));
  } catch { return null; }
};

export async function POST(req: NextRequest) {
  try {
    const company = await req.json();
    const supabase = getSupabase();
    const { data } = await supabase.from("ipo_companies").select("analysis_detail").eq("id",company.id).single();
    if(data?.analysis_detail){
      const d=data.analysis_detail as any;
      const hasAxes=(d.axes?.ultra_short?.length||0)>0;
      const fresh=(Date.now()-new Date(d.generated_at||0).getTime())/3600000<48;
      if(fresh&&hasAxes) return NextResponse.json(d);
    }

    const n=company.name, sec=company.sector||"不明";

    const makeAxesPrompt=(items:{id:string,title:string}[])=>
      `「${n}」（${sec}業）のIPO投資分析。下記JSONの各フィールドを日本語で埋めて返答。scoreは0〜100の整数。descriptionは100字以上。\n[${items.map(({id,title})=>`{"id":"${id}","title":"${title}","score":65,"why_matters":"この指標がIPO投資で重要な理由","description":"${n}について具体的に分析した内容","verdict":"総合評価一言","doc_guide":"目論見書の確認箇所"}`).join(",")}]`;

    const [sumMsg, usMsg, shMsg, loMsg, insMsg, scenMsg] = await Promise.all([
      claude.messages.create({
        model:"claude-haiku-4-5-20251001", max_tokens:500,
        system:"JSONのみ返答。",
        messages:[{role:"user",content:`「${n}」（${sec}業）のIPO分析。JSON：{"summary":"事業内容と投資ポイントを200字で説明","total_score":65,"grade":"B"}`}]
      }),
      claude.messages.create({
        model:"claude-sonnet-4-6", max_tokens:2000,
        system:"JSONのみ返答。",
        messages:[{role:"user",content:makeAxesPrompt([{id:"float",title:"需給・ロック内容"},{id:"lockup",title:"VC保有・売り圧力"},{id:"timing",title:"市場環境・タイミング"}])}]
      }),
      claude.messages.create({
        model:"claude-sonnet-4-6", max_tokens:2000,
        system:"JSONのみ返答。",
        messages:[{role:"user",content:makeAxesPrompt([{id:"valuation",title:"バリュエーション"},{id:"vc_sell",title:"VC売り圧力の詳細"},{id:"growth",title:"成長性・市場規模"}])}]
      }),
      claude.messages.create({
        model:"claude-sonnet-4-6", max_tokens:2000,
        system:"JSONのみ返答。",
        messages:[{role:"user",content:makeAxesPrompt([{id:"management",title:"経営陣・ガバナンス"},{id:"unit_econ",title:"収益性・ユニットエコノミクス"},{id:"competitor",title:"競合優位性・参入障壁"}])}]
      }),
      claude.messages.create({
        model:"claude-haiku-4-5-20251001", max_tokens:600,
        system:"JSONのみ返答。",
        messages:[{role:"user",content:`「${n}」（${sec}業）のIPO投資で特に注目すべき点TOP3。JSON配列のみ：[{"title":"15字以内","desc":"40字","detail":"100字以上"},{"title":"","desc":"","detail":""},{"title":"","desc":"","detail":""}]`}]
      }),
      claude.messages.create({
        model:"claude-haiku-4-5-20251001", max_tokens:700,
        system:"JSONのみ返答。",
        messages:[{role:"user",content:`「${n}」（${sec}業）の上場後6ヶ月の株価シナリオ3つ。JSON配列のみ：[{"id":"A","name":"強気シナリオ名","verdict":"強気","prob":"30%","vsIpo":"+50〜100%","positives":["好材料1","好材料2"],"negatives":["リスク1"],"conclusion":"要点50字"},{"id":"B","name":"中立シナリオ名","verdict":"中立","prob":"45%","vsIpo":"±20%","positives":[""],"negatives":[""],"conclusion":""},{"id":"C","name":"弱気シナリオ名","verdict":"弱気","prob":"25%","vsIpo":"▲20〜50%","positives":[""],"negatives":["",""],"conclusion":""}]`}]
      }),
    ]);

    let summary=`${n}は${sec}分野のIPO企業です。`, total_score=65, grade="B";
    try {
      const p=parseObj((sumMsg.content[0] as any).text);
      if(p){summary=p.summary||summary;total_score=p.total_score||total_score;grade=p.grade||grade;}
    } catch {}

    const insRaw=(insMsg.content[0] as any).text;
console.log('insights_raw:', insRaw?.slice(0,300));
const insights=parseArr(insRaw).slice(0,3);
    const scenarios_short=parseArr((scenMsg.content[0] as any).text).slice(0,3);
    const ultra_short=parseArr((usMsg.content[0] as any).text);
    const short=parseArr((shMsg.content[0] as any).text);
    const long=parseArr((loMsg.content[0] as any).text);

    console.log(`axes: ${ultra_short.length} ${short.length} ${long.length} insights: ${insights.length} scenarios: ${scenarios_short.length}`);

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