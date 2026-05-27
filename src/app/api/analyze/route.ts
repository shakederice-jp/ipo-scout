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
  try {
    const s=text.indexOf('['), e=text.lastIndexOf(']');
    if(s===-1||e===-1) return [];
    const cleaned=text.slice(s,e+1).replace(/\r?\n/g,'\\n');
    const arr=JSON.parse(cleaned);
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

function buildProspectusContext(raw: Record<string,string> | null): string {
  if (!raw || Object.keys(raw).length === 0) return "";
  const parts: string[] = [];
  if (raw["事業の概況"]) parts.push(`【有価証券届出書・事業の概況】\n${raw["事業の概況"].slice(0,800)}`);
  if (raw["リスク要因"]) parts.push(`【目論見書・リスク要因】\n${raw["リスク要因"].slice(0,800)}`);
  if (raw["財務諸表"]) parts.push(`【有価証券届出書・財務諸表】\n${raw["財務諸表"].slice(0,400)}`);
  if (raw["株主構成"]) parts.push(`【目論見書・株主の状況】\n${raw["株主構成"].slice(0,400)}`);
  if (raw["資金使途"]) parts.push(`【目論見書・調達資金の使途】\n${raw["資金使途"].slice(0,300)}`);
  if (raw["経営陣"]) parts.push(`【有価証券届出書・役員の状況】\n${raw["経営陣"].slice(0,300)}`);
  return parts.join("\n\n");
}

export async function POST(req: NextRequest) {
  try {
    const company = await req.json();
    const supabase = getSupabase();
    const { data } = await supabase
      .from("ipo_companies")
      .select("analysis_detail, raw_prospectus")
      .eq("id", company.id)
      .single();

    if(data?.analysis_detail){
      const d=data.analysis_detail as any;
      const hasAxes=(d.axes?.ultra_short?.length||0)>0;
      const fresh=(Date.now()-new Date(d.generated_at||0).getTime())/3600000<48;
      if(fresh&&hasAxes) return NextResponse.json(d);
    }

    const n=company.name, sec=company.sector||"不明";
    const prospectus = buildProspectusContext(data?.raw_prospectus as any);
    const hasProspectus = prospectus.length > 0;

    console.log(`prospectus: ${hasProspectus} (${prospectus.length}chars)`);

    const makeAxesPrompt=(items:{id:string,title:string}[])=>
      `あなたは20年以上の経験を持つトップクラスのIPOアナリストです。「${n}」（${sec}業）について、機関投資家レベルの深い分析を、株式投資の初心者にもわかる言葉で書いてください。
${hasProspectus ? `\n【実際の有価証券届出書・目論見書データ（最優先で活用すること）】\n${prospectus}\n` : ""}
【分析の哲学】
・表面的な事実の羅列ではなく、「なぜそれが重要か」「他の人が見落としている点は何か」を掘り下げる
・目論見書の数字を複数組み合わせて、他のIPOサイトやブログが書かない独自の洞察を導く
・リスクは「可能性がある」ではなく「具体的にどう顕在化するか」のシナリオで書く
・ポジティブな面もネガティブな面も、証拠となる数字・事実を必ず添えて書く
・「つまりこの銘柄で投資家が本当に確認すべき1点は何か」を明確にする

【文章のルール】
・専門用語には必ずカッコで説明（例：PER（株価収益率）、ロックアップ（一定期間の売却禁止））
${hasProspectus ? "・「目論見書・リスク要因によると〜」「有価証券届出書・株主の状況によると〜」など必ず出典を明示" : "・「目論見書・〇〇によると〜」の出典スタイルを使う"}
・①②③の小見出しで3段落に分け、各段落は3〜4文の充実した内容にする
・最後は「つまり、初心者の方へのポイントは〜」で、他では読めない核心的な一言で締める

JSON配列のみ返答（コードブロック不要）：
[${items.map(({id,title})=>`{"id":"${id}","title":"${title}","score":65,"why_matters":"この指標が今回のIPOで特に重要な理由を、数字や具体的事実を交えて2文で","description":"①[見出し]\\n具体的な分析内容（数字・事実・出典付き）\\n\\n②[見出し]\\n他のサイトが書かない独自の視点からの分析\\n\\n③[見出し]\\nリスクと機会の両面を踏まえた結論。つまり、初心者の方へのポイントは〜","verdict":"この軸での核心的な一言評価","doc_guide":"目論見書のどのページ・どの項目を確認すべきか具体的に"}`).join(",")}]`;

    const [sumMsg, usMsg, shMsg, loMsg, insMsg, scenMsg] = await Promise.all([
      claude.messages.create({
        model:"claude-sonnet-4-6", max_tokens:800,
        system:"JSONのみ返答。",
        messages:[{role:"user",content:`あなたはIPO分析の専門家です。「${n}」（${sec}業）を機関投資家の視点で分析し、初心者にもわかる言葉で要約してください。${hasProspectus?`\n実際の目論見書データ：${prospectus.slice(0,600)}`:""}
JSON：{"summary":"この企業の本質的な投資価値と最大のリスクを200字で。数字や具体的事実を含めること","total_score":65,"grade":"B"}`}]
      }),
      claude.messages.create({
        model:"claude-sonnet-4-6", max_tokens:4000,
        system:"JSON配列のみ返答。コードブロック不要。文字列内の改行は\\nで表現。",
        messages:[{role:"user",content:makeAxesPrompt([{id:"float",title:"需給・ロック内容"},{id:"lockup",title:"VC・株主構成"},{id:"timing",title:"上場タイミング"}])}]
      }),
      claude.messages.create({
        model:"claude-sonnet-4-6", max_tokens:4000,
        system:"JSON配列のみ返答。コードブロック不要。文字列内の改行は\\nで表現。",
        messages:[{role:"user",content:makeAxesPrompt([{id:"valuation",title:"バリュエーション"},{id:"vc_sell",title:"売り圧力リスク"},{id:"growth",title:"成長性"}])}]
      }),
      claude.messages.create({
        model:"claude-sonnet-4-6", max_tokens:4000,
        system:"JSON配列のみ返答。コードブロック不要。文字列内の改行は\\nで表現。",
        messages:[{role:"user",content:makeAxesPrompt([{id:"management",title:"経営陣・ガバナンス"},{id:"unit_econ",title:"収益性・ユニットエコノミクス"},{id:"competitor",title:"競合・差別化"}])}]
      }),
      claude.messages.create({
        model:"claude-sonnet-4-6", max_tokens:800,
        system:"JSONのみ返答。",
        messages:[{role:"user",content:`IPOアナリストとして「${n}」（${sec}業）の投資判断で見落とされがちな重要ポイントTOP3を、初心者向けに具体的に。${hasProspectus?`目論見書データ：${prospectus.slice(0,400)}`:""}
JSON配列のみ：[{"title":"注目点のタイトル（具体的に）","desc":"なぜ重要かを60字で。数字や事実を含めること","icon":"trend-up"}]`}]
      }),
      claude.messages.create({
        model:"claude-haiku-4-5-20251001", max_tokens:700,
        system:"JSONのみ返答。",
        messages:[{role:"user",content:`「${n}」（${sec}業）の上場後6ヶ月の株価シナリオ3つ。各シナリオに具体的な根拠を含めること。JSON配列のみ：[{"id":"A","label":"強気","price_target":"+30%","rationale":"具体的な根拠を平易に"},{"id":"B","label":"中立","price_target":"+5%","rationale":"具体的な根拠を平易に"},{"id":"C","label":"弱気","price_target":"-15%","rationale":"具体的な根拠を平易に"}]`}]
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