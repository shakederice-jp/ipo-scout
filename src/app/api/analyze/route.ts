export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
const indexMap: Record<string, string> = {
  float:"難・1",lockup:"難・2",timing:"難・3",
  valuation:"週1-1",vc_sell:"週1-2",growth:"週1-3",
  management:"長キ-1",unit_econ:"長キ-2",competitor:"長キ-3"
};
const parseArr = (text: string): any[] => {
  try {
    const s = text.indexOf('['), e = text.lastIndexOf(']');
    if (s===-1||e===-1) return [];
    const arr = JSON.parse(text.slice(s,e+1));
    if (Array.isArray(arr)&&arr.length>0) return arr.map((x:any)=>({...x,index:indexMap[x.id]||x.id}));
    return [];
  } catch { return []; }
};
const parseObj = (text: string): any => {
  try {
    const s = text.indexOf('{'), e = text.lastIndexOf('}');
    if (s===-1||e===-1) return null;
    return JSON.parse(text.slice(s,e+1));
  } catch { return null; }
};
const h = (content: string, max=900) => claude.messages.create({
  model:"claude-haiku-4-5-20251001", max_tokens:max,
  system:"JSONのみ返答。余計な説明不要。",
  messages:[{role:"user",content}]
});
const s4 = (content: string, max=1200) => claude.messages.create({
  model:"claude-sonnet-4-6", max_tokens:max,
  system:"JSONのみ返答。余計な説明不要。",
  messages:[{role:"user",content}]
});

export async function POST(req: NextRequest) {
  try {
    const company = await req.json();
    const supabase = getSupabase();
    const { data } = await supabase.from("ipo_companies").select("analysis_detail").eq("id",company.id).single();
    if (data?.analysis_detail) {
      const d = data.analysis_detail as any;
      const hasAxes=(d.axes?.ultra_short?.length||0)>0;
      const fresh=(Date.now()-new Date(d.generated_at||0).getTime())/3600000<48;
      if (fresh&&hasAxes) return NextResponse.json(d);
    }
    const n=company.name, sec=company.sector||"不明", tone="「〜です」「〜ます」調で丁寧に。専門用語はカッコで説明。";
    const axP=(items:{id:string,title:string}[])=>`「${n}」（${sec}業）の以下の観点でIPO分析。${tone}\nJSON配列のみ：\n[\n${items.map(({id,title})=>`  {"id":"${id}","title":"${title}","score":65,"why_matters":"なぜ重要か説明","description":"詳細分析を120字以上で丁寧に","verdict":"総評","doc_guide":"目論見書の確認箇所"}`).join(',\n')}\n]`;

    const [sumMsg,usMsg,shMsg,loMsg,insMsg,scenMsg] = await Promise.all([
      h(`「${n}」（${sec}業）IPO分析。${tone}JSON：{"summary":"事業内容と投資ポイントを200字で丁寧に説明","total_score":65,"grade":"B"}`,500),
      s4(axP([{id:"float",title:"需給・ロック内容"},{id:"lockup",title:"VC保有・売り圧力"},{id:"timing",title:"市場環境・タイミング"}])),
      s4(axP([{id:"valuation",title:"バリュエーション"},{id:"vc_sell",title:"ロックアップ解除後の売り圧力"},{id:"growth",title:"成長性・市場規模"}])),
      s4(axP([{id:"management",title:"経営陣・ガバナンス"},{id:"unit_econ",title:"ユニットエコノミクス"},{id:"competitor",title:"競合優位性"}])),
      h(`「${n}」（${sec}業）のIPO投資で特に注目すべき点TOP3。${tone}JSONのみ：[{"title":"15字以内","desc":"40字","detail":"100字以上"},{"title":"","desc":"","detail":""},{"title":"","desc":"","detail":""}]`,600),
      h(`「${n}」（${sec}業）の上場後6ヶ月株価シナリオ3つ（強気・中立・弱気）。${tone}JSONのみ：[{"id":"A","name":"シナリオ名","verdict":"強気","prob":"30%","vsIpo":"+50〜100%","positives":["好材料1","好材料2"],"negatives":["リスク1"],"conclusion":"50字の要点"},{"id":"B","name":"","verdict":"中立","prob":"45%","vsIpo":"±20%","positives":[""],"negatives":[""],"conclusion":""},{"id":"C","name":"","verdict":"弱気","prob":"25%","vsIpo":"▲20〜50%","positives":[""],"negatives":["",""],"conclusion":""}]`,700),
    ]);

    let summary=`${n}は${sec}分野のIPO企業です。`, total_score=65, grade="B";
    try {
      const p=parseObj((sumMsg.content[0] as any).text);
      if(p){summary=p.summary||summary;total_score=p.total_score||total_score;grade=p.grade||grade;}
    } catch {}

    const insights=parseArr((insMsg.content[0] as any).text).map(x=>({title:x.title||"",desc:x.desc||"",detail:x.detail||""}));
    const scenarios_short=parseArr((scenMsg.content[0] as any).text);

    const analysis = {
      summary,total_score,grade,highlight_reason:null,
      insights:insights.length?insights:[{title:"分析中",desc:"データを準備しています",detail:"詳細分析は準備中です。"}],
      scenarios_short:scenarios_short.length?scenarios_short:[],
      axes:{
        ultra_short:parseArr((usMsg.content[0] as any).text),
        short:parseArr((shMsg.content[0] as any).text),
        long:parseArr((loMsg.content[0] as any).text),
      },
      sources:[
        {label:"東証新規上場情報",url:"https://www.jpx.co.jp/listing/stocks/new/index.html"},
        {label:"EDINET・有価証券届出書",url:"https://disclosure2.edinet-fsa.go.jp/"},
        {label:"IPOkabu",url:"https://ipokabu.net/"},
      ],
      generated_at:new Date().toISOString()
    };

    console.log("axes:",analysis.axes.ultra_short.length,analysis.axes.short.length,analysis.axes.long.length,"insights:",insights.length);
    await supabase.from("ipo_companies").update({analysis_detail:analysis}).eq("id",company.id);
    return NextResponse.json(analysis);
  } catch(e:any){
    console.error("error:",e?.message);
    return NextResponse.json({error:e?.message},{status:500});
  }
}