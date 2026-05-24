"use client";
import { useState, useEffect } from "react";
import { Zap, TrendingUp, Users, Shield, BarChart2, Star, ArrowUpRight, ArrowDownRight, Minus, Info, Clock, Calendar, ChevronRight, AlertTriangle } from "lucide-react";

interface AxisItem { id:string;title:string;score:number;index:string;why_matters:string;description:string;verdict:string;doc_guide:string; }
interface Insight { title:string;desc:string;detail:string; }
interface Scenario { id:string;name:string;verdict:string;prob:string;vsIpo:string;positives:string[];negatives:string[];conclusion:string; }
interface Analysis {
  summary:string;total_score:number;grade:string;
  insights?:Insight[];scenarios_short?:Scenario[];
  axes:{ultra_short:AxisItem[];short:AxisItem[];long:AxisItem[]};
  sources:{label:string;url:string}[];
}
interface IpoCompany { id:string;name:string;ticker?:string;exchange?:string;sector?:string;biz_type?:string;listing_date?:string; }

const C = { primary:"#66c3c6", dark:"#082b2e", mid:"#0d4f52", light:"#e8f9f9", border:"#b3e8ea", text:"#2a7a7e" };

function ScoreRing({score,size=100}:{score:number;size?:number}) {
  const r=size*0.375,circ=2*Math.PI*r,dash=(score/100)*circ;
  const color=score>=80?C.primary:score>=60?"#f59e0b":"#ef4444";
  return (
    <div className="relative flex items-center justify-center" style={{width:size,height:size}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={size*0.08}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={size*0.08}
          strokeDasharray={`${dash} ${circ-dash}`} strokeLinecap="round"/>
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-black text-slate-800" style={{fontSize:size*0.22,lineHeight:1}}>{score}</span>
        <span className="text-slate-400 font-semibold" style={{fontSize:size*0.09}}>/ 100</span>
      </div>
    </div>
  );
}

function RadarSVG({data}:{data:{metric:string;value:number}[]}) {
  if(!data.length) return null;
  const n=data.length,cx=100,cy=100,r=72;
  const pt=(i:number,v:number)=>{const a=(i*(360/n)-90)*Math.PI/180;return{x:cx+v*r/100*Math.cos(a),y:cy+v*r/100*Math.sin(a)};};
  const rings=[20,40,60,80,100];
  return (
    <svg viewBox="0 0 200 200" style={{width:"100%",height:"100%"}}>
      {rings.map(rv=>(
        <polygon key={rv} fill="none" stroke="#e2e8f0" strokeWidth="0.8"
          points={data.map((_,i)=>{const p=pt(i,rv);return`${p.x},${p.y}`;}).join(" ")}/>
      ))}
      {data.map((_,i)=>{const p=pt(i,100);return<line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#e2e8f0" strokeWidth="0.8"/>;}) }
      <polygon fill={C.primary} fillOpacity={0.2} stroke={C.primary} strokeWidth={1.5}
        points={data.map((d,i)=>{const p=pt(i,d.value);return`${p.x},${p.y}`;}).join(" ")}/>
      {data.map((d,i)=>{const p=pt(i,d.value);return<circle key={i} cx={p.x} cy={p.y} r="2.5" fill={C.primary}/>;}) }
      {data.map((d,i)=>{const p=pt(i,115);return(
        <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
          style={{fontSize:8.5,fontWeight:700,fill:"#64748b"}}>{d.metric}</text>
      );})}
    </svg>
  );
}

const INSIGHT_ICONS=[<Zap size={14} key="z"/>,<TrendingUp size={14} key="t"/>,<Users size={14} key="u"/>];
function InsightCard({ins,idx}:{ins:Insight;idx:number}) {
  const [open,setOpen]=useState(false);
  return (
    <div className="rounded-xl overflow-hidden" style={{border:`1px solid ${C.border}`}}>
      <button onClick={()=>setOpen(!open)} className="w-full flex gap-2 p-3 text-left hover:opacity-80" style={{backgroundColor:C.light}}>
        <span style={{color:C.primary,marginTop:2,flexShrink:0}}>{INSIGHT_ICONS[idx]||<Star size={14}/>}</span>
        <div className="flex-1 min-w-0">
          <div className="font-black text-xs leading-tight" style={{color:C.dark}}>{ins.title}</div>
          <div className="text-[10px] text-slate-500 leading-relaxed mt-0.5">{ins.desc}</div>
        </div>
        <span style={{color:C.primary,fontSize:10,flexShrink:0,display:"inline-block",transform:open?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▼</span>
      </button>
      {open&&(
        <div className="bg-white border-t p-3" style={{borderColor:C.border}}>
          <p className="text-[11px] text-slate-700 leading-relaxed">{ins.detail}</p>
        </div>
      )}
    </div>
  );
}

function DeepDiveCard({item,accentColor}:{item:AxisItem;accentColor:string}) {
  const [open,setOpen]=useState(false);
  const sc=item.score;
  const sLabel=sc>=80?"A":sc>=70?"B+":sc>=60?"B":sc>=50?"C+":"C";
  const r=22,circ=2*Math.PI*r,dash=(sc/100)*circ;
  return (
    <div style={{borderLeft:`3px solid ${open?accentColor:"#e2e8f0"}`,backgroundColor:open?"#fafffe":"white"}}>
      <button onClick={()=>setOpen(!open)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:opacity-90"
        style={{backgroundColor:open?"#f4fbfc":"white"}}>
        <div className="relative flex items-center justify-center shrink-0" style={{width:52,height:52}}>
          <svg width="52" height="52" style={{transform:"rotate(-90deg)"}}>
            <circle cx="26" cy="26" r={r} fill="none" stroke={open?"rgba(255,255,255,0.3)":"#e2e8f0"} strokeWidth="4"/>
            <circle cx="26" cy="26" r={r} fill="none" stroke={open?"white":accentColor} strokeWidth="4"
              strokeDasharray={`${dash} ${circ-dash}`} strokeLinecap="round"/>
          </svg>
          <div className="absolute" style={{width:52,height:52,borderRadius:"50%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",backgroundColor:open?accentColor:"transparent"}}>
            <span className="font-black text-sm" style={{color:open?"white":accentColor,lineHeight:1}}>{sLabel}</span>
            <span style={{fontSize:"8px",fontWeight:700,color:open?"rgba(255,255,255,0.8)":C.text}}>{sc}</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-black tracking-widest" style={{fontSize:10,color:accentColor}}>{item.index}</div>
          <div className="font-black leading-tight" style={{fontSize:15,color:C.dark}}>{item.title}</div>
        </div>
        <span style={{color:accentColor,fontSize:12,flexShrink:0,display:"inline-block",transform:open?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▼</span>
      </button>
      {open&&(
        <div style={{borderTop:`1px solid ${C.border}`}}>
          <div className="px-4 pt-3 pb-4 space-y-3">
            <div className="rounded-xl p-3" style={{backgroundColor:C.light,border:`1px solid ${C.border}`}}>
              <div className="font-black mb-1" style={{fontSize:10,color:C.text}}>💡 なぜ重要か</div>
              <p className="text-slate-700 leading-relaxed" style={{fontSize:11}}>{item.why_matters}</p>
            </div>
            <div className="rounded-xl p-3" style={{backgroundColor:"white",border:`1px solid ${C.border}`}}>
              <div className="font-black mb-1" style={{fontSize:10,color:C.text}}>📋 詳細分析</div>
              <p className="text-slate-700 leading-relaxed" style={{fontSize:11}}>{item.description}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="rounded-xl p-2.5" style={{backgroundColor:"#f0fdf4",border:"1px solid #bbf7d0"}}>
                <div className="font-black mb-0.5" style={{fontSize:9,color:"#15803d"}}>✅ 総評</div>
                <p style={{fontSize:11,color:"#0d3d40",lineHeight:1.6}}>{item.verdict}</p>
              </div>
              <div className="rounded-xl p-2.5" style={{backgroundColor:"#fffbeb",border:"1px solid #fde68a"}}>
                <div className="font-black mb-0.5" style={{fontSize:9,color:"#92400e"}}>📄 参照書類確認箇所</div>
                <p style={{fontSize:11,color:"#0d3d40",lineHeight:1.6}}>{item.doc_guide}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScenarioCard({s}:{s:Scenario}) {
  const [open,setOpen]=useState(false);
  const isUp=s.verdict==="強気",isDown=s.verdict==="弱気";
  const vs=isUp?{bg:"#f0fdf4",text:"#15803d",border:"#bbf7d0"}:isDown?{bg:"#fef2f2",text:"#b91c1c",border:"#fecaca"}:{bg:"#fffbeb",text:"#92400e",border:"#fde68a"};
  const icon=isUp?<ArrowUpRight size={12}/>:isDown?<ArrowDownRight size={12}/>:<Minus size={12}/>;
  return (
    <div className="rounded-xl overflow-hidden" style={{border:`1px solid ${vs.border}`}}>
      <button onClick={()=>setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2 text-left" style={{backgroundColor:vs.bg}}>
        <span className="font-black text-[10px] px-2 py-0.5 rounded-full bg-white" style={{color:vs.text,border:`1px solid ${vs.border}`}}>{s.id}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 font-black text-[11px]" style={{color:vs.text}}>{icon}{s.name||s.verdict}</div>
        </div>
        <div className="font-black text-xs shrink-0" style={{color:vs.text}}>{s.vsIpo}</div>
        <span className="font-black text-[10px] px-1.5 py-0.5 rounded-full bg-white ml-1 shrink-0" style={{color:vs.text,border:`1px solid ${vs.border}`}}>{s.prob}</span>
        <span style={{color:vs.text,fontSize:10,flexShrink:0,display:"inline-block",transform:open?"rotate(90deg)":"none"}}>▶</span>
      </button>
      {open&&(
        <div className="bg-white border-t px-3 py-2.5 space-y-2" style={{borderColor:vs.border}}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <div className="flex items-center gap-1 text-[10px] font-black text-emerald-600 mb-1"><ArrowUpRight size={10}/>好材料</div>
              <ul className="space-y-0.5">{(s.positives||[]).map((p,i)=><li key={i} className="flex gap-1.5 text-[10px] text-slate-600"><span className="text-emerald-500 shrink-0">✓</span>{p}</li>)}</ul>
            </div>
            <div>
              <div className="flex items-center gap-1 text-[10px] font-black text-red-500 mb-1"><ArrowDownRight size={10}/>リスク</div>
              <ul className="space-y-0.5">{(s.negatives||[]).map((n,i)=><li key={i} className="flex gap-1.5 text-[10px] text-slate-600"><span className="text-red-400 shrink-0">✕</span>{n}</li>)}</ul>
            </div>
          </div>
          {s.conclusion&&<div className="px-2.5 py-2 rounded-lg text-[10px] text-slate-700 leading-relaxed" style={{backgroundColor:vs.bg,border:`1px solid ${vs.border}`}}><Info size={9} className="inline mr-1"/><span className="font-black" style={{color:vs.text}}>要点：</span>{s.conclusion}</div>}
        </div>
      )}
    </div>
  );
}

export default function AnalysisClient({company,initialAnalysis}:{company:IpoCompany;initialAnalysis:Analysis|null}) {
  const [analysis,setAnalysis]=useState<Analysis|null>(initialAnalysis);
  const [loading,setLoading]=useState(!initialAnalysis);
  const [scenTab,setScenTab]=useState<"short"|"long">("short");

  useEffect(()=>{
    if(!company?.id) return;
    (async()=>{
      try {
        const res=await fetch("/api/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(company)});
        if(res.ok) setAnalysis(await res.json());
      } catch(e){console.error(e);}
      finally{setLoading(false);}
    })();
  },[company?.id]);

  const axes=analysis?.axes;
  const radarData=[
    {metric:"成長性",value:axes?.long?.find(x=>x.id==="competitor")?.score||65},
    {metric:"収益性",value:axes?.long?.find(x=>x.id==="unit_econ")?.score||60},
    {metric:"需給の軽さ",value:axes?.ultra_short?.find(x=>x.id==="float")?.score||65},
    {metric:"経営陣",value:axes?.long?.find(x=>x.id==="management")?.score||70},
    {metric:"競合優位性",value:axes?.long?.find(x=>x.id==="competitor")?.score||65},
  ];

  const GROUPS=[
    {key:"ultra_short" as const,label:"超短期",sub:"初値売り・当日トレード",icon:"⚡",color:"#ef4444",bg:"#fef2f2",border:"#fecaca"},
    {key:"short" as const,label:"短期",sub:"数週間〜数ヶ月",icon:"📈",color:"#d97706",bg:"#fffbeb",border:"#fde68a"},
    {key:"long" as const,label:"長期",sub:"数年〜",icon:"🏔",color:"#7c3aed",bg:"#f5f3ff",border:"#ddd6fe"},
  ];

  if(loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{backgroundColor:"#eef9f9"}}>
      <div className="text-center">
        <div className="w-12 h-12 rounded-full border-4 animate-spin mx-auto mb-4" style={{borderColor:C.primary,borderTopColor:"transparent"}}/>
        <p className="font-bold text-slate-600">AI分析を生成中...</p>
        <p className="text-sm text-slate-400 mt-1">30秒ほどお待ちください</p>
      </div>
    </div>
  );

  if(!analysis) return (
    <div className="min-h-screen flex items-center justify-center" style={{backgroundColor:"#eef9f9"}}>
      <div className="text-center p-6">
        <AlertTriangle size={32} className="text-amber-500 mx-auto mb-3"/>
        <p className="font-bold text-slate-700">分析データを取得できませんでした</p>
        <a href="/calendar" className="mt-4 inline-block text-sm px-4 py-2 rounded-xl text-white font-bold" style={{backgroundColor:C.primary}}>← カレンダーへ戻る</a>
      </div>
    </div>
  );

  const score=analysis.total_score||65;
  const grade=analysis.grade||"B";
  const insights=analysis.insights||[];
  const scenarios=analysis.scenarios_short||[];

  return (
    <div style={{backgroundColor:"#eef9f9",fontFamily:"'Noto Sans JP','Hiragino Kaku Gothic ProN',sans-serif",minHeight:"100vh"}}>
      {/* ナビ */}
      <div style={{backgroundColor:C.dark}} className="px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded p-1" style={{backgroundColor:C.primary}}><BarChart2 size={14} className="text-white"/></div>
          <div>
            <div className="text-white font-black text-sm leading-tight">IPO企業情報AI分析レポート</div>
            <div className="font-semibold" style={{fontSize:9,color:C.primary}}>担当：大手町調査室九課</div>
          </div>
        </div>
        <a href="/calendar" className="text-slate-400 hover:text-white text-xs flex items-center gap-1">
          <ChevronRight size={12} style={{transform:"rotate(180deg)"}}/> カレンダーへ
        </a>
      </div>

      <div className="px-3 sm:px-4 py-3 max-w-3xl mx-auto space-y-3">

        {/* 企業ヘッダー */}
        <div className="rounded-2xl overflow-hidden" style={{border:`2px solid ${C.primary}`}}>
          <div className="px-4 py-4" style={{backgroundColor:C.primary}}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  {company.exchange&&<span className="font-black text-[10px] px-2 py-0.5 rounded-lg" style={{backgroundColor:"rgba(255,255,255,0.25)",color:C.dark}}>{company.exchange}</span>}
                  {company.ticker&&<span className="font-bold text-[10px]" style={{color:C.mid}}>{company.ticker}</span>}
                </div>
                <h1 className="font-black leading-tight mb-1" style={{fontSize:22,color:C.dark}}>{company.name}</h1>
                {company.sector&&<div className="font-semibold" style={{fontSize:11,color:C.mid}}>{company.sector}</div>}
                <div className="flex flex-wrap gap-2 mt-2.5">
                  {company.listing_date&&(
                    <div className="rounded-lg px-2.5 py-1.5" style={{backgroundColor:"rgba(255,255,255,0.8)"}}>
                      <div style={{fontSize:9,color:C.mid,fontWeight:700}}>上場日</div>
                      <div className="font-black" style={{fontSize:12,color:C.dark}}>{company.listing_date}</div>
                    </div>
                  )}
                  {company.biz_type&&(
                    <div className="rounded-lg px-2.5 py-1.5" style={{backgroundColor:"rgba(255,255,255,0.8)"}}>
                      <div style={{fontSize:9,color:C.mid,fontWeight:700}}>業態</div>
                      <div className="font-black" style={{fontSize:12,color:C.dark}}>{company.biz_type}</div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-center shrink-0 rounded-xl px-3 py-2" style={{backgroundColor:"rgba(255,255,255,0.85)"}}>
                <ScoreRing score={score} size={80}/>
                <div className="font-black mt-1" style={{fontSize:10,color:C.text}}>AI総合評価</div>
                <div className="font-black" style={{fontSize:11,color:C.primary}}>{grade}ランク</div>
              </div>
            </div>
          </div>
        </div>

        {/* AI分析要約 */}
        <div className="bg-white rounded-2xl p-4" style={{border:`1px solid ${C.border}`}}>
          <div className="flex items-center gap-2 mb-2">
            <Zap size={14} style={{color:C.primary}}/><h2 className="font-black text-sm" style={{color:C.dark}}>AI分析要約</h2>
          </div>
          <p className="text-slate-700 leading-relaxed" style={{fontSize:13}}>{analysis.summary}</p>
        </div>

        {/* まずここに注目！*/}
        {insights.length>0&&(
          <div className="bg-white rounded-2xl p-4" style={{border:`1px solid ${C.border}`}}>
            <div className="flex items-center gap-1.5 mb-3">
              <Star size={14} className="text-amber-500"/>
              <h2 className="font-black text-sm text-slate-800">まずここに注目！</h2>
            </div>
            <div className="space-y-2">
              {insights.map((ins,i)=><InsightCard key={i} ins={ins} idx={i}/>)}
            </div>
          </div>
        )}

        {/* レーダー + VC分析 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl p-4" style={{border:`1px solid ${C.border}`}}>
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 size={15} style={{color:C.primary}}/>
              <h2 className="font-black text-sm text-slate-800">パフォーマンス・レーダー</h2>
            </div>
            <div style={{height:180}}><RadarSVG data={radarData}/></div>
            <div className="space-y-1.5 mt-2">
              {radarData.map(({metric,value})=>(
                <div key={metric} className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-600 w-20 shrink-0">{metric}</span>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{backgroundColor:C.border}}>
                    <div className="h-full rounded-full" style={{width:`${value}%`,backgroundColor:value>=80?C.primary:value>=65?"#f59e0b":"#f97316"}}/>
                  </div>
                  <span className="text-[11px] font-black text-slate-700 w-6 text-right">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4" style={{border:`1px solid ${C.border}`}}>
            <div className="flex items-center gap-2 mb-3">
              <Shield size={15} style={{color:C.primary}}/>
              <h2 className="font-black text-sm text-slate-800">需給・VC分析</h2>
              <span className="text-[9px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">参考値</span>
            </div>
            {[{label:"創業者・役員持分",pct:38,risk:"high",unlock:"上場後180日"},{label:"主要VCファンド",pct:29,risk:"medium",unlock:"上場後90日"},{label:"事業会社（戦略株主）",pct:18,risk:"low",unlock:"上場後360日"},{label:"一般投資家（公募）",pct:15,risk:"none",unlock:"上場時より流通"}].map((d,i)=>(
              <div key={i} className="flex items-center gap-2 mb-2">
                <div className="w-24 shrink-0">
                  <div className="text-[10px] font-bold text-slate-600 leading-tight">{d.label}</div>
                  <div className="text-[9px] text-slate-400">{d.unlock}</div>
                </div>
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{backgroundColor:C.border}}>
                  <div className="h-full rounded-full" style={{width:`${d.pct}%`,backgroundColor:d.risk==="high"?"#f87171":d.risk==="medium"?"#fbbf24":d.risk==="low"?C.primary:"#34d399"}}/>
                </div>
                <div className="w-7 text-right text-[10px] font-black text-slate-600">{d.pct}%</div>
              </div>
            ))}
            <div className="grid grid-cols-3 gap-1.5 mt-3">
              {[{label:"VC保有合計",val:"29%",c:"text-amber-600"},{label:"90日後解放",val:"約29%",c:"text-red-500"},{label:"売り圧力",val:"中〜高",c:"text-slate-600"}].map(({label,val,c})=>(
                <div key={label} className="rounded-xl p-2 text-center" style={{backgroundColor:C.light,border:`1px solid ${C.border}`}}>
                  <div className={`text-[9px] font-bold mb-0.5 ${c}`}>{label}</div>
                  <div className="text-xs font-black text-slate-800">{val}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 株価シナリオ分析 */}
        <div className="bg-white rounded-2xl p-4" style={{border:`1px solid ${C.border}`}}>
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 size={15} style={{color:C.primary}}/><h2 className="font-black text-sm text-slate-800">株価シナリオ分析</h2>
          </div>
          <div className="flex gap-2 mb-3">
            {(["short","long"] as const).map(tab=>(
              <button key={tab} onClick={()=>setScenTab(tab)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all"
                style={{backgroundColor:scenTab===tab?C.dark:"#f1f5f9",color:scenTab===tab?"white":"#64748b"}}>
                {tab==="short"?<><Clock size={11}/>短期（〜6ヶ月）</>:<><Calendar size={11}/>長期（5〜10年）</>}
              </button>
            ))}
          </div>
          {scenTab==="short"?(
            <div className="space-y-1.5">
              {scenarios.length>0?scenarios.map(s=><ScenarioCard key={s.id} s={s}/>)
                :<div className="text-center py-6 text-slate-400 text-sm">シナリオ生成中...</div>}
            </div>
          ):(
            <div className="space-y-1.5">
              {[{id:"α",name:"成長実現シナリオ",verdict:"強気",prob:"25%",vsIpo:"+200〜500%",positives:["事業の商業化成功","大型契約締結"],negatives:["長期間必要"],conclusion:"長期成長シナリオ実現なら大きなリターン可能性"},
                {id:"β",name:"安定成長シナリオ",verdict:"中立",prob:"45%",vsIpo:"+50〜150%",positives:["着実な成長","市場での地位確立"],negatives:["急激な成長見込みにくい"],conclusion:"最も現実的なシナリオ"},
                {id:"γ",name:"停滞シナリオ",verdict:"弱気",prob:"30%",vsIpo:"▲20〜50%",positives:["事業消滅リスクは低い"],negatives:["競合台頭","成長鈍化"],conclusion:"長期的な株価低迷に注意"}
              ].map(s=><ScenarioCard key={s.id} s={s}/>)}
            </div>
          )}
        </div>

        {/* 詳細分析 深掘りレポート */}
        <div className="rounded-2xl overflow-hidden" style={{border:`2px solid ${C.border}`}}>
          <div className="px-4 py-4" style={{backgroundColor:C.primary}}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <span className="font-black tracking-widest px-2 py-0.5 rounded text-white text-[9px] inline-block mb-2" style={{backgroundColor:C.dark}}>DEEP ANALYSIS</span>
                <h2 className="font-black leading-tight" style={{fontSize:17,color:C.dark}}>詳細分析 深掘りレポート</h2>
                <p style={{fontSize:10,color:C.mid,marginTop:2}}>投資時間軸（超短期・短期・長期）で整理した9軸分析</p>
              </div>
              <div className="flex flex-col items-center shrink-0 rounded-xl px-3 py-2" style={{backgroundColor:"rgba(255,255,255,0.85)"}}>
                <div className="font-black" style={{fontSize:26,color:C.dark,lineHeight:1}}>{score}</div>
                <div style={{fontSize:9,color:C.text,fontWeight:700}}>総合 / 100</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {GROUPS.map(g=>{
                const items=axes?.[g.key]||[];
                const avg=items.length?Math.round(items.reduce((s:number,x:AxisItem)=>s+x.score,0)/items.length):0;
                return (
                  <div key={g.key} className="rounded-xl p-2 text-center" style={{backgroundColor:"rgba(255,255,255,0.82)"}}>
                    <div style={{fontSize:16,lineHeight:1,marginBottom:3}}>{g.icon}</div>
                    <div className="font-black" style={{fontSize:10,color:C.dark}}>{g.label}</div>
                    <div className="font-black" style={{fontSize:20,color:g.color,lineHeight:1}}>{avg}</div>
                    <div style={{fontSize:8,color:C.text}}>/ 100</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="bg-white divide-y" style={{borderColor:"#f1f5f9"}}>
            {GROUPS.map(g=>{
              const items=axes?.[g.key]||[];
              if(!items.length) return null;
              const avg=items.length?Math.round(items.reduce((s:number,x:AxisItem)=>s+x.score,0)/items.length):0;
              return (
                <div key={g.key}>
                  <div className="px-4 py-3" style={{backgroundColor:g.bg,borderBottom:`1px solid ${g.border}`}}>
                    <div className="flex items-center gap-3">
                      <span style={{fontSize:20,lineHeight:1}}>{g.icon}</span>
                      <div className="flex-1">
                        <span className="font-black" style={{fontSize:16,color:C.dark}}>{g.label}</span>
                        <span className="font-bold rounded-full px-2.5 py-0.5 text-white text-[10px] ml-2" style={{backgroundColor:g.color}}>{g.sub}</span>
                      </div>
                      <div className="font-black" style={{fontSize:22,color:g.color,lineHeight:1}}>{avg}<span style={{fontSize:10,color:C.text}}>/100</span></div>
                    </div>
                  </div>
                  <div className="divide-y" style={{borderColor:"#f1f5f9"}}>
                    {items.map((item:AxisItem)=><DeepDiveCard key={item.id} item={item} accentColor={g.color}/>)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 参考文献 */}
        {(analysis.sources||[]).length>0&&(
          <div className="bg-white rounded-2xl p-4" style={{border:`1px solid ${C.border}`}}>
            <div className="flex items-center gap-2 mb-2"><Info size={14} className="text-slate-400"/><h2 className="font-black text-sm text-slate-700">参考文献・確認先</h2></div>
            <ul className="space-y-1.5">
              {(analysis.sources||[]).map(src=>(
                <li key={src.url} className="flex items-start gap-1.5">
                  <span className="text-slate-300 text-[10px] shrink-0 mt-0.5">→</span>
                  <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-[11px] hover:underline" style={{color:C.text}}>{src.label}</a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* フッター */}
        <div className="text-center text-[10px] text-slate-400 pb-6 space-y-1.5">
          <div className="font-black text-slate-500 text-xs">⚠ 免責事項</div>
          <p className="leading-relaxed max-w-lg mx-auto">本レポートはAIによる情報整理・判断材料の提供を目的としており、<span className="font-bold text-slate-600">投資勧誘ではありません。</span>スコア・価格目標はAIの試算値であり将来の結果を保証しません。最終的な投資判断はご自身の責任において行ってください。</p>
          <p className="text-slate-300">© 大手町調査室九課</p>
        </div>
      </div>
    </div>
  );
}