"use client";
import { useState } from "react";
import { Zap, TrendingUp, Users, Shield, BarChart2, Star, ArrowUpRight, ArrowDownRight, Minus, Info, Clock, Calendar, ChevronRight, AlertTriangle } from "lucide-react";

interface AxisItem { id:string;title:string;score:number;index:string;why_matters:string;description:string;verdict:string;doc_guide:string;grade?:string;label?:string; }
interface Insight { title:string;desc?:string;detail?:string;body?:string; }
interface Scenario { id:string;name:string;verdict:string;prob:string;vsIpo:string;positives:string[];negatives:string[];conclusion:string; }
interface Analysis {
  summary:string;total_score:number;grade:string;
  insights?:Insight[];scenarios_short?:Scenario[];
  axes:{ultra_short:AxisItem[];short:AxisItem[];long:AxisItem[]};
  sources:{label:string;url:string}[];
}
interface IpoCompany { id:string;name:string;ticker?:string;exchange?:string;sector?:string;biz_type?:string;listing_date?:string; }

const PRIMARY="#66c3c6",DARK="#082b2e",MID="#0d4f52",LIGHT="#e8f9f9",BORDER="#b3e8ea",TTEXT="#2a7a7e";

function ScoreRing({score,size=80}:{score:number;size?:number}) {
  const r=size*0.38,circ=2*Math.PI*r,dash=(Math.min(score,100)/100)*circ;
  const col=score>=80?PRIMARY:score>=60?"#f59e0b":"#ef4444";
  return (
    <div style={{position:"relative",width:size,height:size,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)",position:"absolute"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={size*0.08}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={size*0.08}
          strokeDasharray={`${dash} ${circ-dash}`} strokeLinecap="round"/>
      </svg>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",zIndex:1}}>
        <span style={{fontWeight:900,fontSize:size*0.24,color:"#1e293b",lineHeight:1}}>{score}</span>
        <span style={{fontSize:size*0.1,color:"#94a3b8",fontWeight:600}}>/100</span>
      </div>
    </div>
  );
}

function RadarSVG({data}:{data:{metric:string;value:number}[]}) {
  if(!data||!data.length) return null;
  const n=data.length,cx=100,cy=100;
  const pt=(i:number,v:number)=>{const a=(i*(360/n)-90)*Math.PI/180,rv=v*0.72;return{x:cx+rv*Math.cos(a),y:cy+rv*Math.sin(a)};};
  return (
    <svg viewBox="0 0 200 200" style={{width:"100%",height:"100%"}}>
      {[20,40,60,80,100].map(rv=>(
        <polygon key={rv} fill="none" stroke="#e2e8f0" strokeWidth="0.8"
          points={data.map((_,i)=>{const p=pt(i,rv);return`${p.x},${p.y}`;}).join(" ")}/>
      ))}
      {data.map((_,i)=>{const p=pt(i,100);return<line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#e2e8f0" strokeWidth="0.8"/>;}) }
      <polygon fill={PRIMARY} fillOpacity={0.18} stroke={PRIMARY} strokeWidth={2}
        points={data.map((d,i)=>{const p=pt(i,d.value);return`${p.x},${p.y}`;}).join(" ")}/>
      {data.map((d,i)=>{const p=pt(i,d.value);return<circle key={i} cx={p.x} cy={p.y} r="3" fill={PRIMARY}/>;}) }
      {data.map((d,i)=>{const p=pt(i,118);return(
        <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
          style={{fontSize:9,fontWeight:700,fill:"#64748b"}}>{d.metric}</text>
      );})}
    </svg>
  );
}

function Card({children,style={}}:{children:React.ReactNode;style?:React.CSSProperties}) {
  return (
    <div style={{backgroundColor:"white",borderRadius:16,border:`1px solid ${BORDER}`,
      boxShadow:"0 1px 4px rgba(102,195,198,0.12)",padding:"16px",...style}}>
      {children}
    </div>
  );
}

function MarkdownReport({text}:{text:string}) {
  return (
    <div style={{fontSize:12,color:"#334155",lineHeight:1.9}}>
      {text.split('\n').map((line,i)=>{
        if(line.startsWith('#### ')) return <div key={i} style={{fontWeight:900,fontSize:13,color:"#0d4f52",margin:"10px 0 4px"}}>{line.replace(/^#### /,'')}</div>;
        if(line.startsWith('### ')) return <div key={i} style={{fontWeight:900,fontSize:14,color:"#082b2e",margin:"12px 0 6px"}}>{line.replace(/^### /,'')}</div>;
        if(line.startsWith('## ')) return <div key={i} style={{fontWeight:900,fontSize:15,color:"#082b2e",margin:"14px 0 8px"}}>{line.replace(/^## /,'')}</div>;
        if(line.startsWith('- ')) return <div key={i} style={{paddingLeft:12,marginBottom:3}}>{'• '}{line.replace(/^- /,'').replace(/\*\*([^*]+)\*\*/g,'$1')}</div>;
        if(line.trim()==='') return <div key={i} style={{height:6}}/>;
        return <div key={i} style={{marginBottom:3}}>{line.replace(/\*\*([^*]+)\*\*/g,'$1')}</div>;
      })}
    </div>
  );
}

const ICONS=[<Zap size={13} key="z"/>,<TrendingUp size={13} key="t"/>,<Users size={13} key="u"/>];
function InsightCard({ins,idx}:{ins:Insight;idx:number}) {
  const [open,setOpen]=useState(false);
  return (
    <div style={{borderRadius:10,overflow:"hidden",border:`1px solid ${BORDER}`}}>
      <button onClick={()=>setOpen(!open)} style={{width:"100%",display:"flex",gap:8,padding:"10px 12px",
        backgroundColor:LIGHT,textAlign:"left",cursor:"pointer",border:"none",alignItems:"flex-start"}}>
        <span style={{color:PRIMARY,marginTop:2,flexShrink:0}}>{ICONS[idx]||<Star size={13}/>}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:900,fontSize:12,color:DARK,lineHeight:1.3}}>{ins.title}</div>
          <div style={{fontSize:10,color:"#64748b",marginTop:2,lineHeight:1.5}}>{ins.desc||ins.body||""}</div>
        </div>
        <span style={{color:PRIMARY,fontSize:10,flexShrink:0,transition:"transform 0.2s",
          display:"inline-block",transform:open?"rotate(180deg)":"none"}}>▼</span>
      </button>
      {open&&(
        <div style={{backgroundColor:"white",borderTop:`1px solid ${BORDER}`,padding:"10px 12px"}}>
          <p style={{fontSize:11,color:"#475569",lineHeight:1.7,whiteSpace:"pre-wrap"}}>{ins.detail}</p>
        </div>
      )}
    </div>
  );
}

function DeepDiveCard({item,accentColor}:{item:AxisItem;accentColor:string}) {
  const [open,setOpen]=useState(false);
  const sc=Math.max(0,Math.min(100,item.score||0));
  const grade=item.grade||(sc>=80?"A":sc>=65?"B":sc>=50?"C":sc>=35?"D":"E");
  const r=22,circ=2*Math.PI*r,dash=(sc/100)*circ;
  const hasReport=!!(item as any).report;
  const report=(item as any).report??"";

  return (
    <div style={{borderLeft:`3px solid ${open?accentColor:"#e2e8f0"}`,backgroundColor:open?"#fafffe":"white",transition:"background 0.15s"}}>
      <button onClick={()=>setOpen(!open)} style={{width:"100%",display:"flex",alignItems:"center",
        gap:12,padding:"12px 16px",textAlign:"left",cursor:"pointer",border:"none",
        backgroundColor:open?"#f4fbfc":"white"}}>
        <div style={{position:"relative",width:52,height:52,flexShrink:0}}>
          <svg width="52" height="52" style={{transform:"rotate(-90deg)",position:"absolute"}}>
            <circle cx="26" cy="26" r={r} fill="none" stroke={open?"rgba(255,255,255,0.3)":"#e2e8f0"} strokeWidth="4"/>
            <circle cx="26" cy="26" r={r} fill="none" stroke={open?"white":accentColor} strokeWidth="4"
              strokeDasharray={`${dash} ${circ-dash}`} strokeLinecap="round"/>
          </svg>
          <div style={{position:"absolute",inset:0,borderRadius:"50%",display:"flex",flexDirection:"column",
            alignItems:"center",justifyContent:"center",backgroundColor:open?accentColor:"transparent"}}>
            <span style={{fontWeight:900,fontSize:14,color:open?"white":accentColor,lineHeight:1}}>{grade}</span>
            <span style={{fontSize:8,fontWeight:700,color:open?"rgba(255,255,255,0.8)":TTEXT}}>{sc}</span>
          </div>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:900,fontSize:10,color:accentColor,letterSpacing:"0.05em"}}>{item.id}</div>
          <div style={{fontWeight:900,fontSize:15,color:DARK,lineHeight:1.3}}>{item.label||item.title||item.id}</div>
        </div>
        <span style={{color:accentColor,fontSize:12,flexShrink:0,display:"inline-block",
          transform:open?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▼</span>
      </button>
      {open&&(
        <div style={{borderTop:`1px solid ${BORDER}`,padding:"12px 16px 16px"}}>
          {hasReport?(
            <div style={{backgroundColor:"white",borderRadius:10,padding:"12px",border:`1px solid ${BORDER}`}}>
              <MarkdownReport text={report}/>
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div style={{backgroundColor:LIGHT,borderRadius:10,padding:"10px 12px",border:`1px solid ${BORDER}`}}>
                <div style={{fontWeight:900,fontSize:10,color:TTEXT,marginBottom:4}}>💡 なぜ重要か</div>
                <p style={{fontSize:11,color:"#475569",lineHeight:1.7,whiteSpace:"pre-wrap"}}>{item.why_matters}</p>
              </div>
              <div style={{backgroundColor:"white",borderRadius:10,padding:"10px 12px",border:`1px solid ${BORDER}`}}>
                <div style={{fontWeight:900,fontSize:10,color:TTEXT,marginBottom:4}}>📋 詳細分析</div>
                <p style={{fontSize:11,color:"#475569",lineHeight:1.7,whiteSpace:"pre-wrap"}}>{item.description}</p>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div style={{backgroundColor:"#f0fdf4",borderRadius:10,padding:"8px 10px",border:"1px solid #bbf7d0"}}>
                  <div style={{fontWeight:900,fontSize:9,color:"#15803d",marginBottom:3}}>✅ 総評</div>
                  <p style={{fontSize:11,color:"#0d3d40",lineHeight:1.6}}>{item.verdict}</p>
                </div>
                <div style={{backgroundColor:"#fffbeb",borderRadius:10,padding:"8px 10px",border:"1px solid #fde68a"}}>
                  <div style={{fontWeight:900,fontSize:9,color:"#92400e",marginBottom:3}}>📄 確認書類</div>
                  <p style={{fontSize:11,color:"#0d3d40",lineHeight:1.6}}>{item.doc_guide}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScenarioCard({s}:{s:Scenario}) {
  const [open,setOpen]=useState(false);
  const isUp=s.verdict==="強気",isDown=s.verdict==="弱気";
  const vs=isUp?{bg:"#f0fdf4",text:"#15803d",border:"#bbf7d0"}:isDown?{bg:"#fef2f2",text:"#b91c1c",border:"#fecaca"}:{bg:"#fffbeb",text:"#92400e",border:"#fde68a"};
  const icon=isUp?<ArrowUpRight size={11}/>:isDown?<ArrowDownRight size={11}/>:<Minus size={11}/>;
  return (
    <div style={{borderRadius:10,overflow:"hidden",border:`1px solid ${vs.border}`}}>
      <button onClick={()=>setOpen(!open)} style={{width:"100%",display:"flex",alignItems:"center",gap:6,padding:"8px 12px",backgroundColor:vs.bg,textAlign:"left",cursor:"pointer",border:"none"}}>
        <span style={{fontWeight:900,fontSize:10,padding:"2px 8px",borderRadius:20,backgroundColor:"white",color:vs.text,border:`1px solid ${vs.border}`,flexShrink:0,whiteSpace:"nowrap"}}>{s.verdict}</span>
        <div style={{flex:1,minWidth:0,overflow:"hidden",whiteSpace:"nowrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:4,fontWeight:900,fontSize:11,color:vs.text}}>
            {icon}{s.name||s.verdict}
          </div>
        </div>
        <span style={{fontWeight:900,fontSize:12,color:vs.text,flexShrink:0}}>{s.vsIpo}</span>
        <span style={{fontWeight:900,fontSize:10,padding:"2px 6px",borderRadius:20,backgroundColor:"white",color:vs.text,border:`1px solid ${vs.border}`,marginLeft:4,flexShrink:0}}>{s.prob}</span>
        <span style={{color:vs.text,fontSize:10,flexShrink:0,display:"inline-block",transform:open?"rotate(90deg)":"none"}}>▶</span>
      </button>
      {open&&(
        <div style={{backgroundColor:"white",borderTop:`1px solid ${vs.border}`,padding:"10px 12px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
            <div>
              <div style={{fontSize:10,fontWeight:900,color:"#15803d",marginBottom:4,display:"flex",alignItems:"center",gap:3}}><ArrowUpRight size={9}/>好材料</div>
              {(s.positives||[]).map((p,i)=><div key={i} style={{fontSize:10,color:"#475569",display:"flex",gap:4,marginBottom:2}}><span style={{color:"#22c55e",flexShrink:0}}>✓</span>{p}</div>)}
            </div>
            <div>
              <div style={{fontSize:10,fontWeight:900,color:"#ef4444",marginBottom:4,display:"flex",alignItems:"center",gap:3}}><ArrowDownRight size={9}/>リスク</div>
              {(s.negatives||[]).map((n,i)=><div key={i} style={{fontSize:10,color:"#475569",display:"flex",gap:4,marginBottom:2}}><span style={{color:"#f87171",flexShrink:0}}>✕</span>{n}</div>)}
            </div>
          </div>
          {s.conclusion&&(
            <div style={{backgroundColor:vs.bg,borderRadius:8,padding:"8px 10px",border:`1px solid ${vs.border}`,fontSize:10,color:"#475569",lineHeight:1.6}}>
              <span style={{fontWeight:900,color:vs.text}}><Info size={8} style={{display:"inline",marginRight:3}}/>要点：</span>{s.conclusion}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AnalysisClient({company,initialAnalysis}:{company:IpoCompany;initialAnalysis:Analysis|null}) {
  const [analysis]=useState<Analysis|null>(initialAnalysis);
  const [scenTab,setScenTab]=useState<"short"|"long">("short");

  if(!analysis) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",backgroundColor:"#eef9f9"}}>
      <div style={{textAlign:"center",padding:24}}>
        <AlertTriangle size={32} color="#f59e0b" style={{margin:"0 auto 12px"}}/>
        <p style={{fontWeight:700,color:"#475569"}}>分析データを取得できませんでした</p>
        <a href="/calendar" style={{display:"inline-block",marginTop:16,padding:"8px 16px",borderRadius:10,
          backgroundColor:PRIMARY,color:"white",fontWeight:700,fontSize:13,textDecoration:"none"}}>← カレンダーへ戻る</a>
      </div>
    </div>
  );

  const score=analysis.total_score||65;
  const grade=analysis.grade||"B";
  const axes=analysis.axes||{ultra_short:[],short:[],long:[]};
  const insights=analysis.insights||[];
  const scenarios=(analysis as any).scenarios_short||(analysis as any).scenarios||[];

  const radarData=[
    {metric:"成長性",   value:axes.long?.find(x=>x.id==="competitor")?.score||65},
    {metric:"収益性",   value:axes.long?.find(x=>x.id==="unit_econ")?.score||60},
    {metric:"需給の軽さ",value:axes.ultra_short?.find(x=>x.id==="float")?.score||65},
    {metric:"経営陣",   value:axes.long?.find(x=>x.id==="management")?.score||70},
    {metric:"競合優位性",value:axes.long?.find(x=>x.id==="competitor")?.score||65},
  ];

  const GROUPS=[
    {key:"ultra_short" as const,label:"超短期",sub:"初値売り・当日トレード",icon:"⚡",color:"#ef4444",bg:"#fef2f2",border:"#fecaca"},
    {key:"short"       as const,label:"短期",  sub:"数週間〜数ヶ月",        icon:"📈",color:"#d97706",bg:"#fffbeb",border:"#fde68a"},
    {key:"long"        as const,label:"長期",  sub:"数年〜",                icon:"🏔",color:"#7c3aed",bg:"#f5f3ff",border:"#ddd6fe"},
  ];

  const wrap:React.CSSProperties={maxWidth:720,margin:"0 auto",padding:"0 16px"};

  return (
    <div style={{backgroundColor:"#eef9f9",minHeight:"100vh",fontFamily:"'Noto Sans JP',sans-serif"}}>
      <div style={{backgroundColor:DARK,padding:"8px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{backgroundColor:PRIMARY,borderRadius:6,padding:5,display:"flex"}}>
            <BarChart2 size={14} color="white"/>
          </div>
          <div>
            <div style={{color:"white",fontWeight:900,fontSize:13,lineHeight:1.2}}>IPO企業情報AI分析レポート</div>
            <div style={{color:PRIMARY,fontWeight:600,fontSize:9}}>担当：大手町調査室九課</div>
          </div>
        </div>
        <a href="/calendar" style={{color:"#94a3b8",fontSize:12,display:"flex",alignItems:"center",gap:4,textDecoration:"none"}}>
          <ChevronRight size={12} style={{transform:"rotate(180deg)"}}/>カレンダーへ
        </a>
      </div>

      <div style={{...wrap,paddingTop:12,paddingBottom:40,display:"flex",flexDirection:"column",gap:12}}>
        <div style={{borderRadius:16,overflow:"hidden",border:`2px solid ${PRIMARY}`}}>
          <div style={{backgroundColor:PRIMARY,padding:"16px 20px"}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:8}}>
                  {company.exchange&&<span style={{fontWeight:900,fontSize:10,padding:"2px 8px",borderRadius:8,backgroundColor:"rgba(255,255,255,0.25)",color:DARK}}>{company.exchange}</span>}
                  {company.ticker&&<span style={{fontWeight:700,fontSize:10,color:MID}}>{company.ticker}</span>}
                </div>
                <h1 style={{fontWeight:900,fontSize:24,color:DARK,lineHeight:1.2,margin:"0 0 4px"}}>{company.name}</h1>
                {company.sector&&<div style={{fontWeight:600,fontSize:12,color:MID,marginBottom:10}}>{company.sector}</div>}
                <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                  {company.listing_date&&(
                    <div style={{backgroundColor:"rgba(255,255,255,0.85)",borderRadius:8,padding:"6px 10px"}}>
                      <div style={{fontSize:9,color:MID,fontWeight:700}}>上場日</div>
                      <div style={{fontWeight:900,fontSize:13,color:DARK}}>{company.listing_date}</div>
                    </div>
                  )}
                  {company.biz_type&&(
                    <div style={{backgroundColor:"rgba(255,255,255,0.85)",borderRadius:8,padding:"6px 10px"}}>
                      <div style={{fontSize:9,color:MID,fontWeight:700}}>業態</div>
                      <div style={{fontWeight:900,fontSize:13,color:DARK}}>{company.biz_type}</div>
                    </div>
                  )}
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",flexShrink:0,backgroundColor:"rgba(255,255,255,0.9)",borderRadius:12,padding:"10px 14px"}}>
                <ScoreRing score={score} size={80}/>
                <div style={{fontWeight:900,fontSize:10,color:TTEXT,marginTop:4}}>AI総合評価</div>
                <div style={{fontWeight:900,fontSize:12,color:PRIMARY}}>{grade}ランク</div>
              </div>
            </div>
          </div>
        </div>

        <Card>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
            <Zap size={14} color={PRIMARY}/>
            <span style={{fontWeight:900,fontSize:14,color:DARK}}>AI分析要約</span>
          </div>
          <p style={{fontSize:13,color:"#475569",lineHeight:1.8}}>{analysis.summary}</p>
        </Card>

        {insights.length>0&&(
          <Card>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
              <Star size={14} color="#f59e0b"/>
              <span style={{fontWeight:900,fontSize:14,color:"#1e293b"}}>まずここに注目！</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {insights.map((ins,i)=><InsightCard key={i} ins={ins} idx={i}/>)}
            </div>
          </Card>
        )}

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:12}}>
          <Card>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
              <BarChart2 size={14} color={PRIMARY}/>
              <span style={{fontWeight:900,fontSize:14,color:"#1e293b"}}>パフォーマンス・レーダー</span>
            </div>
            <div style={{height:180}}><RadarSVG data={radarData}/></div>
            <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:5}}>
              {radarData.map(({metric,value})=>(
                <div key={metric} style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:10,fontWeight:700,color:"#475569",width:72,flexShrink:0}}>{metric}</span>
                  <div style={{flex:1,height:6,borderRadius:3,backgroundColor:BORDER,overflow:"hidden"}}>
                    <div style={{height:"100%",borderRadius:3,width:`${value}%`,backgroundColor:value>=80?PRIMARY:value>=65?"#f59e0b":"#f97316"}}/>
                  </div>
                  <span style={{fontSize:11,fontWeight:900,color:"#1e293b",width:24,textAlign:"right"}}>{value}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
              <Shield size={14} color={PRIMARY}/>
              <span style={{fontWeight:900,fontSize:14,color:"#1e293b"}}>需給・VC分析</span>
              <span style={{fontSize:9,color:"#94a3b8",backgroundColor:"#f1f5f9",padding:"2px 6px",borderRadius:10}}>参考値</span>
            </div>
            {[{label:"創業者・役員持分",pct:38,risk:"high",unlock:"上場後180日"},
              {label:"主要VCファンド",pct:29,risk:"medium",unlock:"上場後90日"},
              {label:"事業会社（戦略株主）",pct:18,risk:"low",unlock:"上場後360日"},
              {label:"一般投資家（公募）",pct:15,risk:"none",unlock:"上場時より流通"}
            ].map((d,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <div style={{width:96,flexShrink:0}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#475569",lineHeight:1.3}}>{d.label}</div>
                  <div style={{fontSize:9,color:"#94a3b8"}}>{d.unlock}</div>
                </div>
                <div style={{flex:1,height:8,borderRadius:4,backgroundColor:BORDER,overflow:"hidden"}}>
                  <div style={{height:"100%",borderRadius:4,width:`${d.pct}%`,backgroundColor:d.risk==="high"?"#f87171":d.risk==="medium"?"#fbbf24":d.risk==="low"?PRIMARY:"#34d399"}}/>
                </div>
                <span style={{fontSize:10,fontWeight:900,color:"#1e293b",width:28,textAlign:"right"}}>{d.pct}%</span>
              </div>
            ))}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginTop:8}}>
              {[{label:"VC保有合計",val:"29%",c:"#d97706"},{label:"90日後解放",val:"約29%",c:"#ef4444"},{label:"売り圧力",val:"中〜高",c:"#475569"}].map(({label,val,c})=>(
                <div key={label} style={{backgroundColor:LIGHT,borderRadius:10,padding:"8px",textAlign:"center",border:`1px solid ${BORDER}`}}>
                  <div style={{fontSize:9,fontWeight:700,color:c,marginBottom:2}}>{label}</div>
                  <div style={{fontSize:12,fontWeight:900,color:"#1e293b"}}>{val}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
            <BarChart2 size={14} color={PRIMARY}/>
            <span style={{fontWeight:900,fontSize:14,color:"#1e293b"}}>株価シナリオ分析</span>
          </div>
          <div style={{display:"flex",gap:6,marginBottom:10}}>
            {(["short","long"] as const).map(tab=>(
              <button key={tab} onClick={()=>setScenTab(tab)} style={{display:"flex",alignItems:"center",gap:4,padding:"6px 12px",borderRadius:8,fontSize:12,fontWeight:900,cursor:"pointer",border:"none",backgroundColor:scenTab===tab?DARK:"#f1f5f9",color:scenTab===tab?"white":"#64748b"}}>
                {tab==="short"?<><Clock size={10}/>短期（〜6ヶ月）</>:<><Calendar size={10}/>長期（5〜10年）</>}
              </button>
            ))}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {scenTab==="short"?(
              scenarios.length>0?scenarios.map((s:any)=><ScenarioCard key={s.id} s={s}/>)
                :<div style={{textAlign:"center",padding:"24px",color:"#94a3b8",fontSize:13}}>シナリオ生成中...</div>
            ):(
              [{id:"α",name:"成長実現シナリオ",verdict:"強気",prob:"25%",vsIpo:"+200〜500%",positives:["商業化成功","大型契約"],negatives:["長期間必要"],conclusion:"長期成長シナリオ実現なら大きなリターン可能性"},
               {id:"β",name:"安定成長シナリオ",verdict:"中立",prob:"45%",vsIpo:"+50〜150%",positives:["着実な成長","市場での地位確立"],negatives:["急成長は見込みにくい"],conclusion:"最も現実的なシナリオ"},
               {id:"γ",name:"停滞シナリオ",verdict:"弱気",prob:"30%",vsIpo:"▲20〜50%",positives:["事業消滅リスク低い"],negatives:["競合台頭","成長鈍化"],conclusion:"長期的な株価低迷に注意"}
              ].map((s:any)=><ScenarioCard key={s.id} s={s}/>)
            )}
          </div>
        </Card>

        <div style={{borderRadius:16,overflow:"hidden",border:`2px solid ${BORDER}`}}>
          <div style={{backgroundColor:PRIMARY,padding:"16px 20px"}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,marginBottom:12}}>
              <div>
                <span style={{fontWeight:900,fontSize:9,letterSpacing:"0.1em",padding:"2px 8px",borderRadius:4,backgroundColor:DARK,color:"white",display:"inline-block",marginBottom:6}}>DEEP ANALYSIS</span>
                <h2 style={{fontWeight:900,fontSize:18,color:DARK,margin:"0 0 2px"}}>詳細分析 深掘りレポート</h2>
                <p style={{fontSize:10,color:MID,margin:0}}>投資時間軸（超短期・短期・長期）で整理した9軸分析</p>
              </div>
              <div style={{backgroundColor:"rgba(255,255,255,0.9)",borderRadius:10,padding:"8px 14px",textAlign:"center",flexShrink:0}}>
                <div style={{fontWeight:900,fontSize:26,color:DARK,lineHeight:1}}>{score}</div>
                <div style={{fontSize:9,fontWeight:700,color:TTEXT}}>総合 / 100</div>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              {GROUPS.map(g=>{
                const items=axes[g.key]||[];
                const avg=items.length?Math.round(items.reduce((s,x)=>s+x.score,0)/items.length):0;
                return (
                  <div key={g.key} style={{backgroundColor:"rgba(255,255,255,0.85)",borderRadius:10,padding:"8px",textAlign:"center"}}>
                    <div style={{fontSize:18,lineHeight:1,marginBottom:2}}>{g.icon}</div>
                    <div style={{fontWeight:900,fontSize:10,color:DARK}}>{g.label}</div>
                    <div style={{fontWeight:900,fontSize:22,color:g.color,lineHeight:1}}>{avg}</div>
                    <div style={{fontSize:8,color:TTEXT}}>/100</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{backgroundColor:"white"}}>
            {GROUPS.map(g=>{
              const items=axes[g.key]||[];
              if(!items.length) return null;
              const avg=items.length?Math.round(items.reduce((s,x)=>s+x.score,0)/items.length):0;
              return (
                <div key={g.key} style={{borderBottom:"1px solid #f1f5f9"}}>
                  <div style={{backgroundColor:g.bg,borderBottom:`1px solid ${g.border}`,padding:"12px 16px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:20,lineHeight:1}}>{g.icon}</span>
                      <div style={{flex:1}}>
                        <span style={{fontWeight:900,fontSize:16,color:DARK}}>{g.label}</span>
                        <span style={{fontWeight:700,fontSize:10,padding:"2px 8px",borderRadius:20,backgroundColor:g.color,color:"white",marginLeft:8}}>{g.sub}</span>
                      </div>
                      <div style={{fontWeight:900,fontSize:22,color:g.color,lineHeight:1}}>
                        {avg}<span style={{fontSize:10,color:TTEXT}}>/100</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    {items.map((item:AxisItem)=>(
                      <div key={item.id} style={{borderBottom:"1px solid #f8fafc"}}>
                        <DeepDiveCard item={item} accentColor={g.color}/>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {(analysis.sources||[]).length>0&&(
          <Card>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
              <Info size={13} color="#94a3b8"/>
              <span style={{fontWeight:900,fontSize:13,color:"#475569"}}>参考文献・確認先</span>
            </div>
            {(analysis.sources||[]).map(src=>(
              <div key={src.url} style={{display:"flex",alignItems:"flex-start",gap:6,marginBottom:4}}>
                <span style={{color:"#cbd5e1",fontSize:10,flexShrink:0,marginTop:1}}>→</span>
                <a href={src.url} target="_blank" rel="noopener noreferrer"
                  style={{fontSize:11,color:TTEXT,textDecoration:"none"}}
                  onMouseEnter={e=>(e.target as HTMLElement).style.textDecoration="underline"}
                  onMouseLeave={e=>(e.target as HTMLElement).style.textDecoration="none"}>
                  {src.label}
                </a>
              </div>
            ))}
          </Card>
        )}

        <div style={{textAlign:"center",fontSize:10,color:"#94a3b8",paddingTop:8}}>
          <div style={{fontWeight:900,fontSize:11,color:"#64748b",marginBottom:4}}>⚠ 免責事項</div>
          <p style={{lineHeight:1.7,maxWidth:560,margin:"0 auto 8px"}}>
            本レポートはAIによる情報整理・判断材料の提供を目的としており、
            <strong style={{color:"#475569"}}>投資勧誘ではありません。</strong>
            スコア・価格目標はAIの試算値であり将来の結果を保証しません。最終的な投資判断はご自身の責任において行ってください。
          </p>
          <p style={{color:"#cbd5e1"}}>© 大手町調査室九課</p>
        </div>
      </div>
    </div>
  );
}