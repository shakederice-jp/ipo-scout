"use client";
import VizCharts from "@/components/VizCharts";
import VizTables from "@/components/VizTables";
import { useState, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
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

const ALL_AXIS_ORDER=["float","lockup","timing","valuation","vc_sell","growth","management","unit_econ","competitor"];
const ALL_AXIS_LABELS:Record<string,string>={
  float:"需給の軽さ",lockup:"ロックアップ",timing:"上場タイミング",
  valuation:"バリュエーション",vc_sell:"VC売圧",growth:"成長性",
  management:"経営陣",unit_econ:"ユニットエコノミクス",competitor:"競合環境",
};
const ALL_AXIS_SHORT:Record<string,string>={
  float:"需給",lockup:"ロックアップ",timing:"タイミング",
  valuation:"バリュエ",vc_sell:"VC売圧",growth:"成長性",
  management:"経営陣",unit_econ:"収益性",competitor:"競合",
};

function parseAxisReport(text:string):{sections:Record<string,string>;positives:string[];negatives:string[];summary:string} {
  const sections:Record<string,string>={};
  let current="";
  (text||"").split("\n").forEach(line=>{
    const m=line.match(/^###\s+(.+)/);
    if(m){current=m[1].trim();sections[current]="";}
    else if(current){sections[current]+=line+"\n";}
  });
  const extractBullets=(key:string)=>(sections[key]||"")
    .split("\n")
    .map(l=>l.trim())
    .filter(l=>l.startsWith("- "))
    .map(l=>l.replace(/^- /,"").replace(/\*\*([^*]+)\*\*/g,"$1").trim())
    .filter(Boolean);
  const positives=extractBullets("ポジティブ要因");
  const negatives=extractBullets("ネガティブ要因・リスク");
  const sugg=(sections["まとめ"]||sections["投資家への示唆"]||sections["なぜ重要か"]||"").replace(/\*\*([^*]+)\*\*/g,"$1").trim();
  const summary=sugg.split("\n").map(l=>l.trim()).filter(Boolean).join(" ").slice(0,110);
  return {sections,positives,negatives,summary};
}



function parseNumbers(s?:string):number[] {
  if(!s) return [];
  const m=s.match(/-?\d+(\.\d+)?/g);
  return m?m.map(Number):[];
}

function avg(nums:number[]):number {
  if(!nums.length) return 0;
  return nums.reduce((a,b)=>a+b,0)/nums.length;
}

function parseScenarioRange(vsIpo:string):[number,number] {
  const pm=vsIpo.match(/±\s*(\d+(\.\d+)?)\s*%/);
  if(pm){const d=parseFloat(pm[1]);return[100-d,100+d];}
  const bai=vsIpo.match(/(\d+(\.\d+)?)\s*倍/);
  if(bai){const c=parseFloat(bai[1])*100;return[c-10,c+10];}
  const pct=vsIpo.match(/([+-]?\d+(\.\d+)?)\s*%/);
  if(pct){const c=100+parseFloat(pct[1]);return[c-10,c+10];}
  return[90,110];
}

function ScenarioCompareChart({scenarios,periodLabel,isLong}:{scenarios:Scenario[];periodLabel?:string;isLong?:boolean}) {
  if(!scenarios||scenarios.length===0) return null;
  const colorFor=(v:string)=>v==="強気"?"#22c55e":v==="弱気"?"#f87171":"#f59e0b";
  const textColorFor=(v:string)=>v==="強気"?"#15803d":v==="弱気"?"#b91c1c":"#92400e";
  const rows=scenarios.map(s=>{const[lo,hi]=parseScenarioRange(s.vsIpo);return{...s,lo,hi};});
  const allVals=rows.flatMap(r=>[r.lo,r.hi,100]);
  const minV=Math.floor((Math.min(...allVals)-20)/10)*10;
  const maxV=Math.ceil((Math.max(...allVals)+20)/10)*10;
  const range=(maxV-minV)||1;
  const W=600,H=300,padL=58,padR=150,padT=24,padB=40;
  const chartW=W-padL-padR,chartH=H-padT-padB;
  const x0=padL,x1=padL+chartW;
  const xMid=x0+chartW*0.06; // 上場直後(約5営業日≒全体の6%地点)
  const yFor=(v:number)=>padT+chartH-((v-minV)/range)*chartH;
  const y100=yFor(100);

  // 目盛り刻み幅をデータ範囲に応じて自動決定
  const rawRange=maxV-minV;
  const tickStep=rawRange>300?100:rawRange>150?50:rawRange>60?20:10;
  const ticks:number[]=[];
  for(let v=Math.ceil(minV/tickStep)*tickStep;v<=maxV;v+=tickStep) ticks.push(v);

  // 各シナリオの制御点を計算
  // xMid地点: 公募価格から一気に動く(上場直後の急騰・急落を表現)
  // 帯の幅: xMid地点で広く、x1地点で短期は狭く・長期は広く
  const getPoints=(lo:number,hi:number,verdict:string)=>{
    const mid=(lo+hi)/2;
    // 上場直後の急激な動き(xMid地点)
    const earlySpread=isLong?25:30; // 上場直後の不確実性(帯の広さ)
    const earlyMidOffset=verdict==="強気"?15:verdict==="弱気"?-15:0;
    const earlyMid=100+earlyMidOffset;
    const earlyHi=earlyMid+earlySpread;
    const earlyLo=earlyMid-earlySpread;
    // 期間終了時点
    const lateSpread=isLong?(hi-lo)*1.3:(hi-lo)*0.7; // 長期は不確実性拡大、短期は収束
    const lateHi=mid+lateSpread/2;
    const lateLo=mid-lateSpread/2;
    return {earlyHi,earlyLo,lateHi,lateLo};
  };

  return (
    <div style={{width:"100%",overflowX:"auto",marginBottom:14}}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:H,minWidth:480}}>
        {/* グリッド線と目盛り */}
        {ticks.map(v=>(
          <g key={v}>
            <line x1={x0} y1={yFor(v)} x2={x1} y2={yFor(v)}
              stroke={v===100?"#475569":"#e2e8f0"}
              strokeWidth={v===100?1.5:0.8}
              strokeDasharray={v===100?"5 3":"none"}/>
            <text x={x0-6} y={yFor(v)+4} textAnchor="end" fontSize={8}
              fill={v===100?"#475569":"#94a3b8"}>
              {(v/100).toFixed(v%100===0&&rawRange>60?1:2)}倍
            </text>
          </g>
        ))}
        {/* 縦軸・横軸 */}
        <line x1={x0} y1={padT} x2={x0} y2={padT+chartH} stroke="#475569" strokeWidth={1.5}/>
        <line x1={x0} y1={padT+chartH} x2={x1} y2={padT+chartH} stroke="#475569" strokeWidth={1.5}/>
        {/* 上場直後フェーズの区切り線 */}
        <line x1={xMid} y1={padT} x2={xMid} y2={padT+chartH}
          stroke="#cbd5e1" strokeWidth={0.8} strokeDasharray="3 3"/>
        <text x={xMid} y={padT-6} textAnchor="middle" fontSize={8} fill="#94a3b8">上場直後</text>
        {/* シナリオ帯(2段階の折れ線帯) */}
        {[...rows].reverse().map(r=>{
          const{earlyHi,earlyLo,lateHi,lateLo}=getPoints(r.lo,r.hi,r.verdict);
          return (
            <polygon key={r.id}
              points={`${x0},${y100} ${xMid},${yFor(earlyHi)} ${x1},${yFor(lateHi)} ${x1},${yFor(lateLo)} ${xMid},${yFor(earlyLo)}`}
              fill={colorFor(r.verdict)} fillOpacity={0.15}
              stroke={colorFor(r.verdict)} strokeWidth={1.5} strokeOpacity={0.8}/>
          );
        })}
        {/* 各シナリオの中心線 */}
        {rows.map(r=>{
          const{earlyHi,earlyLo,lateHi,lateLo}=getPoints(r.lo,r.hi,r.verdict);
          const earlyMid=(earlyHi+earlyLo)/2;
          const lateMid=(lateHi+lateLo)/2;
          return (
            <polyline key={r.id+"-mid"}
              points={`${x0},${y100} ${xMid},${yFor(earlyMid)} ${x1},${yFor(lateMid)}`}
              fill="none" stroke={colorFor(r.verdict)}
              strokeWidth={1.2} strokeDasharray="4 3" strokeOpacity={0.7}/>
          );
        })}
        {/* 起点マーカー */}
        <circle cx={x0} cy={y100} r={5} fill="#0d4f52" stroke="white" strokeWidth={2}/>
        <text x={x0+8} y={y100-7} fontSize={9} fontWeight={900} fill="#0d4f52">公募価格</text>
        {/* 横軸ラベル */}
        <text x={x0} y={padT+chartH+14} textAnchor="middle" fontSize={9} fill="#64748b">上場日</text>
        <text x={x1} y={padT+chartH+14} textAnchor="middle" fontSize={9} fill="#64748b">{periodLabel||"期間終了"}</text>
        {/* 右側ラベル */}
        {rows.map(r=>{
          const{lateHi,lateLo}=getPoints(r.lo,r.hi,r.verdict);
          const midY=(yFor(lateLo)+yFor(lateHi))/2;
          return (
            <g key={r.id+"-label"}>
              <line x1={x1} y1={yFor(lateHi)} x2={x1+6} y2={yFor(lateHi)} stroke={colorFor(r.verdict)} strokeWidth={1.5}/>
              <line x1={x1} y1={yFor(lateLo)} x2={x1+6} y2={yFor(lateLo)} stroke={colorFor(r.verdict)} strokeWidth={1.5}/>
              <text x={x1+10} y={midY-7} fontSize={10} fontWeight={900} fill={textColorFor(r.verdict)}>{r.verdict}</text>
              <text x={x1+10} y={midY+5} fontSize={9} fill="#475569">
                {(r.lo/100).toFixed(2)}〜{(r.hi/100).toFixed(2)}倍
              </text>
              <text x={x1+10} y={midY+17} fontSize={8} fill="#94a3b8">確率{r.prob}</text>
            </g>
          );
        })}
      </svg>
      <p style={{fontSize:9,color:"#cbd5e1",marginTop:2}}>
        ※ 上場直後の急激な価格変動を考慮した目安レンジです（AI試算の中心値に対し前後10%を仮定）
      </p>
    </div>
  );
}

function LockupTimeline({lockupPeriod}:{lockupPeriod:string}) {
  return (
    <div style={{marginTop:10,padding:"16px 10px 8px"}}>
      <div style={{position:"relative",height:2,backgroundColor:"#e2e8f0",borderRadius:1,marginBottom:24}}>
        <div style={{position:"absolute",left:0,top:-5,width:12,height:12,borderRadius:"50%",backgroundColor:PRIMARY,border:"2px solid white",boxShadow:"0 0 0 1px #e2e8f0"}}/>
        <div style={{position:"absolute",right:0,top:-5,width:12,height:12,borderRadius:"50%",backgroundColor:"#ef4444",border:"2px solid white",boxShadow:"0 0 0 1px #e2e8f0"}}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
        <div style={{fontSize:9,fontWeight:700,color:TTEXT}}>🔔 上場日</div>
        <div style={{fontSize:9,fontWeight:700,color:"#ef4444",textAlign:"right",maxWidth:"60%",lineHeight:1.4}}>🔓 解除：{lockupPeriod}</div>
      </div>
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
  const parsed=hasReport?parseAxisReport(report):null;

  return (
    <div style={{borderLeft:`3px solid ${open?accentColor:"#e2e8f0"}`,backgroundColor:open?"#fafffe":"white",transition:"background 0.15s"}}>
      <button onClick={()=>setOpen(!open)} style={{width:"100%",display:"flex",alignItems:"flex-start",
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
          {!open&&parsed?.summary&&(
            <p style={{fontSize:11,color:"#64748b",lineHeight:1.6,margin:"4px 0 0",
              display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>
              {parsed.summary}
            </p>
          )}
        </div>
        <span style={{color:accentColor,fontSize:12,flexShrink:0,display:"inline-block",
          transform:open?"rotate(180deg)":"none",transition:"transform 0.2s",marginTop:6}}>▼</span>
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

function NotifyModal({company,userId,onClose}:{company:IpoCompany;userId:string|null;onClose:()=>void}) {
  const [settings,setSettings]=useState({notify_listing:true,notify_bb:true,notify_lockup_90:false,notify_lockup_180:false,method_email:true});
  const [status,setStatus]=useState<"idle"|"saving"|"done"|"error"|"needsPlan">("idle");
  const toggle=(k:keyof typeof settings)=>setSettings(p=>({...p,[k]:!p[k]}));
  const save=async()=>{
    setStatus("saving");
    const res=await fetch("/api/notification",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({user_id:userId??"guest",company_id:company.id,...settings})});
    if(!userId){setStatus("needsPlan");return;}
    const data=await res.json();
    if(data.needsPlan){setStatus("needsPlan");return;}
    if(data.success){setStatus("done");}else{setStatus("error");}
  };
  return (
    <div style={{position:"fixed",inset:0,backgroundColor:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{backgroundColor:"white",borderRadius:16,padding:24,maxWidth:360,width:"100%",border:`2px solid ${PRIMARY}`}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <div style={{fontWeight:900,fontSize:16,color:DARK}}>🔔 通知設定</div>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#94a3b8"}}>✕</button>
        </div>
        <div style={{fontSize:13,fontWeight:700,color:DARK,marginBottom:4}}>{company.name}</div>
        {status==="needsPlan"&&(
          <div style={{backgroundColor:"#fffbeb",border:"1px solid #fde68a",borderRadius:10,padding:12,marginBottom:12,fontSize:12,color:"#92400e"}}>
            {!userId
              ? <>通知機能を使うには<strong>ログイン</strong>が必要です。<a href="/auth" style={{display:"block",marginTop:6,color:PRIMARY,fontWeight:700}}>ログイン・新規登録 →</a></>
              : <>通知機能は<strong>通知プラン（¥890/月）</strong>以上でご利用いただけます。<a href="/" style={{display:"block",marginTop:6,color:PRIMARY,fontWeight:700}}>プランを確認する →</a></>
            }
          </div>
        )}
        {status==="done"&&(
          <div style={{backgroundColor:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:10,padding:12,marginBottom:12,fontSize:12,color:"#15803d"}}>
            ✅ 通知設定を保存しました！毎週金曜18時にお知らせします。
          </div>
        )}
        {status!=="needsPlan"&&status!=="done"&&(
          <>
            <div style={{fontSize:11,color:"#64748b",marginBottom:12}}>通知を受け取るイベントを選択してください（前週金曜18時送信）</div>
            {([["notify_listing","🔴 上場日"],["notify_bb","🟦 BB開始日"],["notify_lockup_90","🔓 ロックアップ90日解除"],["notify_lockup_180","🔓 ロックアップ180日解除"]] as [keyof typeof settings,string][]).map(([k,label])=>(
              <div key={k} onClick={()=>toggle(k)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #f1f5f9",cursor:"pointer"}}>
                <span style={{fontSize:12,color:DARK}}>{label}</span>
                <div style={{width:36,height:20,borderRadius:10,backgroundColor:settings[k]?PRIMARY:"#e2e8f0",position:"relative",transition:"background 0.2s"}}>
                  <div style={{position:"absolute",top:2,left:settings[k]?18:2,width:16,height:16,borderRadius:"50%",backgroundColor:"white",transition:"left 0.2s"}}/>
                </div>
              </div>
            ))}
            <button onClick={save} disabled={status==="saving"} style={{width:"100%",marginTop:16,padding:"12px",backgroundColor:PRIMARY,color:"white",border:"none",borderRadius:10,fontWeight:900,fontSize:14,cursor:"pointer"}}>
              {status==="saving"?"保存中...":"通知を設定する"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function AnalysisClient({company,initialAnalysis,visualizationData,allCompanies,hasAccess=true}:{company:IpoCompany;initialAnalysis:Analysis|null;visualizationData?:any;allCompanies?:any[];hasAccess?:boolean}) {
  const [analysis]=useState<Analysis|null>(initialAnalysis);
  const [scenTab,setScenTab]=useState<"short"|"long">("short");
  const [showNotify,setShowNotify]=useState(false);
  const [userId,setUserId]=useState<string|null>(null);

  useEffect(()=>{
    const supabase=createSupabaseBrowserClient();
    supabase.auth.getSession().then(({data})=>{
      setUserId(data.session?.user?.id??null);
    });
  },[]);

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
  const scenarios_short=(analysis as any).scenarios_short||(analysis as any).scenarios||[];
  const scenarios_long=(analysis as any).scenarios_long||[];

  const allAxesFlat=[...(axes.ultra_short||[]),...(axes.short||[]),...(axes.long||[])];
  const radarData=ALL_AXIS_ORDER.map(id=>{
    const found=allAxesFlat.find(x=>x.id===id);
    const sc=Math.max(0,Math.min(100,found?.score??0));
    return {
      id,
      metric:ALL_AXIS_SHORT[id]||id,
      fullLabel:ALL_AXIS_LABELS[id]||id,
      value:sc,
      grade:found?.grade||(sc>=80?"A":sc>=65?"B":sc>=50?"C":sc>=35?"D":"E"),
    };
  });

  const GROUPS=[
    {key:"ultra_short" as const,label:"超短期",sub:"初値売り・当日トレード",icon:"⚡",color:"#ef4444",bg:"#fee2e2",anchor:"ultra"},
    {key:"short"       as const,label:"短期",  sub:"数週間〜数ヶ月",        icon:"📈",color:"#d97706",bg:"#fef3c7",anchor:"short"},
    {key:"long"        as const,label:"長期",  sub:"数年〜",                icon:"🏛",color:"#7c3aed",bg:"#ede9fe",anchor:"long"},
  ];

  const wrap:React.CSSProperties={maxWidth:720,margin:"0 auto",padding:"0 16px"};

  return (
    <div style={{backgroundColor:"#eef9f9",minHeight:"100vh",fontFamily:"'Noto Sans JP',sans-serif"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 16px",backgroundColor:"#e8f4f5",borderBottom:"1px solid #d0e8ea"}}>
        <button onClick={()=>setShowNotify(true)} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:6,backgroundColor:"#0d4f52",border:"none",cursor:"pointer",color:"white",fontSize:11,fontWeight:700}}>🔔 通知</button>
        <a href="/" style={{color:"#0d4f52",fontSize:11,display:"flex",alignItems:"center",gap:3,textDecoration:"none",fontWeight:600}}>‹ トップへ</a>
        {allCompanies && allCompanies.length > 0 && (
          <select onChange={e => { if(e.target.value) window.location.href=`/analysis/${e.target.value}`; }}
            style={{fontSize:11,padding:"2px 6px",borderRadius:6,border:"1px solid #b3e8ea",color:"#0d4f52",backgroundColor:"white",cursor:"pointer",maxWidth:160}}>
            <option value="">他の銘柄を選ぶ</option>
            {allCompanies.map((c:any) => (
              <option key={c.id} value={c.id} selected={c.id===company.id}>{c.name}</option>
            ))}
          </select>
        )}
        {showNotify&&<NotifyModal company={company} userId={userId} onClose={()=>setShowNotify(false)}/>}
        <button
          onClick={() => {
            const grade = analysis?.grade ?? "B";
            const score = analysis?.total_score ?? 0;
            const text = `📊【IPO分析】${company.name}（${company.ticker ?? ""}）\nAI総合評価：${grade}ランク ${score}点/100点\n\n目論見書をAIが解析した詳細レポートはこちら👇\n#IPO #新規上場 #IPO投資`;
            const shareId = company.ticker ?? company.id;
            const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(`https://ipo-jp.vercel.app/analysis/${shareId}`)}`;
            window.open(url, "_blank");
          }}
          style={{display:"flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:6,backgroundColor:"#000000",border:"none",cursor:"pointer",color:"white",fontSize:11,fontWeight:700}}
        >
          𝕏 シェア
        </button>
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
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:6,marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <Zap size={14} color={PRIMARY}/>
              <span style={{fontWeight:900,fontSize:14,color:DARK}}>AI分析要約</span>
            </div>
            {(analysis as any).data_confidence && (
              <span style={{
                fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:20,
                backgroundColor:
                  (analysis as any).data_confidence === "high" ? "#dcfce7" :
                  (analysis as any).data_confidence === "medium" ? "#fef3c7" : "#fef2f2",
                color:
                  (analysis as any).data_confidence === "high" ? "#15803d" :
                  (analysis as any).data_confidence === "medium" ? "#92400e" : "#b91c1c",
              }}>
                {(analysis as any).data_confidence === "high" ? "✅ 実データ引用" :
                 (analysis as any).data_confidence === "medium" ? "⚠️ 一部推定含む" : "❌ データ不足"}
              </span>
            )}
          </div>
          <p style={{fontSize:13,color:"#475569",lineHeight:1.8}}>{analysis.summary}</p>
          {(analysis as any).data_citations?.length > 0 && (
            <div style={{marginTop:10,padding:"10px 12px",backgroundColor:"#f8fafc",borderRadius:8,border:"1px solid #e2e8f0"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#64748b",marginBottom:6}}>📄 引用データ根拠</div>
              {(analysis as any).data_citations.map((c:string, i:number) => (
                <div key={i} style={{fontSize:11,color:"#475569",display:"flex",gap:6,marginBottom:3}}>
                  <span style={{color:"#66c3c6",flexShrink:0}}>›</span>{c}
                </div>
              ))}
            </div>
          )}
        </Card>
        {!hasAccess && (
          <div style={{borderRadius:14,padding:"20px",backgroundColor:"#0d4f52",color:"white",textAlign:"center"}}>
            <div style={{fontSize:15,fontWeight:900,marginBottom:6}}>🔒 ここから先は有料コンテンツです</div>
            <p style={{fontSize:12,color:"#a0d4d6",margin:"0 0 14px",lineHeight:1.7}}>
            軸別スコア・シナリオ分析・詳細インサイトをご覧いただくには、レポート無制限プラン以上へのご加入、またはこの銘柄の単品購入（¥500）が必要です。
            </p>
            <a href="/plans" style={{display:"inline-block",padding:"10px 24px",backgroundColor:"#66c3c6",color:"#082b2e",borderRadius:8,fontWeight:800,fontSize:13,textDecoration:"none"}}>
              料金プランを見る →
            </a>
          </div>
        )}

        {/* 通知促進バナー */}
        {!userId && (
          <div style={{borderRadius:12,padding:"14px 16px",backgroundColor:"#fffbeb",border:"1px solid #fde68a",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:20}}>🔔</span>
              <div>
                <div style={{fontWeight:900,fontSize:13,color:"#082b2e"}}>BB開始・上場日・公募価格確定をお知らせ</div>
                <div style={{fontSize:11,color:"#92400e",marginTop:2}}>通知プランで前週金曜18時に自動配信</div>
              </div>
            </div>
            <button onClick={() => setShowNotify(true)}
              style={{padding:"8px 18px",backgroundColor:"#f59e0b",color:"white",border:"none",borderRadius:20,cursor:"pointer",fontWeight:900,fontSize:12,whiteSpace:"nowrap",flexShrink:0}}>
              今すぐ通知設定 →
            </button>
          </div>
        )}
        {visualizationData && <VizCharts vizData={visualizationData} />}
        {visualizationData && <VizTables vizData={visualizationData} section="top" />}
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
              <span style={{fontWeight:900,fontSize:14,color:"#1e293b"}}>パフォーマンス・レーダー（9軸）</span>
            </div>
            <div style={{height:200}}><RadarSVG data={radarData}/></div>
            <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:5}}>
              {radarData.map(({id,fullLabel,value,grade})=>(
                <div key={id} style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:10,fontWeight:700,color:"#475569",width:92,flexShrink:0}}>{fullLabel}</span>
                  <div style={{flex:1,height:6,borderRadius:3,backgroundColor:BORDER,overflow:"hidden"}}>
                    <div style={{height:"100%",borderRadius:3,width:`${value}%`,backgroundColor:value>=80?PRIMARY:value>=65?"#f59e0b":"#f97316"}}/>
                  </div>
                  <span style={{fontSize:11,fontWeight:900,color:"#1e293b",width:24,textAlign:"right"}}>{value}</span>
                  <span style={{fontSize:9,fontWeight:900,color:TTEXT,width:18,textAlign:"center",backgroundColor:LIGHT,borderRadius:4,padding:"1px 0",flexShrink:0}}>{grade}</span>
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
  {(()=>{
    const sd=(company as any).structured_data;
    const lockupPeriod=sd?.ipo_details?.lockup_period||"上場後180日";
    const floatRatio=sd?.ipo_details?.float_ratio||"参考値";
    const shareholders:any[]=sd?.shareholders||[];
    const valid=(Array.isArray(shareholders)?shareholders:[]).filter((s:any)=>parseFloat(String(s.ratio||'0').replace('%',''))>0);
    const colors=["#f87171","#fb923c","#facc15","#4ade80","#60a5fa"];
    const chart=valid.length>0
      ?valid.slice(0,4).map((s:any,i:number)=>({label:s.name||`株主${i+1}`,pct:parseFloat(String(s.ratio||'0').replace('%','')),color:colors[i],lockup:s.lockup==="有"?"ロックアップあり":"上場時より流通"}))
      :[{label:"創業者・役員",pct:50,color:"#f87171",lockup:lockupPeriod},{label:"その他株主",pct:35,color:"#fb923c",lockup:"各種条件あり"},{label:"一般投資家（公募）",pct:15,color:"#4ade80",lockup:"上場時より流通"}];
    const sz=160,cx=80,cy=80,r=60,ir=36;
    let ang=-Math.PI/2;
    const slices=chart.map((d:any)=>{const a=2*Math.PI*(d.pct/100);const x1=cx+r*Math.cos(ang),y1=cy+r*Math.sin(ang),x2=cx+r*Math.cos(ang+a),y2=cy+r*Math.sin(ang+a),ix1=cx+ir*Math.cos(ang),iy1=cy+ir*Math.sin(ang),ix2=cx+ir*Math.cos(ang+a),iy2=cy+ir*Math.sin(ang+a),lg=a>Math.PI?1:0,path=`M ${ix1} ${iy1} L ${x1} ${y1} A ${r} ${r} 0 ${lg} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${ir} ${ir} 0 ${lg} 0 ${ix1} ${iy1} Z`;ang+=a;return{...d,path};});
    return(
      <>
        <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:10}}>
          <svg width={sz} height={sz} style={{flexShrink:0}}>
            {slices.map((s:any,i:number)=><path key={i} d={s.path} fill={s.color} stroke="white" strokeWidth={2}/>)}
            <text x={cx} y={cy-6} textAnchor="middle" fontSize={9} fill="#64748b">株主構成</text>
            <text x={cx} y={cy+8} textAnchor="middle" fontSize={9} fill="#64748b">{valid.length>0?"(実データ)":"(概算)"}</text>
          </svg>
          <div style={{flex:1,display:"flex",flexDirection:"column",gap:6}}>
            {chart.map((d:any,i:number)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{width:10,height:10,borderRadius:2,backgroundColor:d.color,flexShrink:0}}/>
                <div style={{flex:1}}><div style={{fontSize:10,fontWeight:700,color:"#475569"}}>{d.label}</div><div style={{fontSize:9,color:"#94a3b8"}}>{d.lockup}</div></div>
                <span style={{fontSize:11,fontWeight:900,color:"#1e293b"}}>{valid.length>0?`${d.pct}%`:"目論見書参照"}</span>
              </div>
            ))}
            {valid.length===0&&shareholders.length>0&&(
              <div style={{fontSize:9,color:"#94a3b8",padding:"4px 6px",backgroundColor:"#f8fafc",borderRadius:6}}>
              主要株主：{(Array.isArray(shareholders)?shareholders:[]).slice(0,3).map((s:any)=>s.name).filter(Boolean).join('、')}
              </div>
            )}
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
          {[{label:"流通比率",val:floatRatio,c:"#d97706"},{label:"ロックアップ",val:lockupPeriod.replace("上場後","").replace("間",""),c:"#ef4444"},{label:"売り圧力",val:valid.length>0&&parseFloat(String(valid[valid.length-1]?.ratio||'0').replace('%',''))<=20?"低":"参考値",c:"#475569"}].map(({label,val,c})=>(
            <div key={label} style={{backgroundColor:"#f8fafc",borderRadius:8,padding:"6px",textAlign:"center",border:"1px solid #e2e8f0"}}>
              <div style={{fontSize:9,fontWeight:700,color:c,marginBottom:2}}>{label}</div>
              <div style={{fontSize:11,fontWeight:900,color:"#1e293b"}}>{val}</div>
            </div>
          ))}
        </div>
        <LockupTimeline lockupPeriod={lockupPeriod}/>
      </>
    );
  })()}
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
          <ScenarioCompareChart scenarios={scenTab==="short"?scenarios_short:scenarios_long} periodLabel={scenTab==="short"?"6ヶ月後":"5〜10年後"} isLong={scenTab==="long"}/>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {scenTab==="short"?(
  scenarios_short.length>0
    ?scenarios_short.map((s:any)=><ScenarioCard key={s.id} s={s}/>)
    :<div style={{textAlign:"center",padding:"24px",color:"#94a3b8",fontSize:13}}>シナリオ生成中...</div>
):(
  scenarios_long.length>0
    ?scenarios_long.map((s:any)=><ScenarioCard key={s.id} s={s}/>)
    :<div style={{textAlign:"center",padding:"24px",color:"#94a3b8",fontSize:13}}>シナリオ生成中...</div>
)}
          </div>
          <div style={{marginTop:16,padding:"10px 14px",borderRadius:10,backgroundColor:"#f0f9ff",border:"1px solid #bae6fd",display:"flex",alignItems:"flex-start",gap:8}}>
  <span style={{fontSize:16,flexShrink:0}}>💡</span>
  <p style={{fontSize:11,color:"#0369a1",margin:0,lineHeight:1.7}}>
    各シナリオの背景にある財務データ・需給構造・市場環境の詳細は、<br/>
    <strong>下部の「詳細分析 深掘りレポート」</strong>に9軸で体系的に整理しています。
  </p>
</div>
{/* 投資シミュレーション */}
{(()=>{
            const ipoPrice = (company as any).ipo_price;
            const scenarios = scenTab==="short" ? scenarios_short : scenarios_long;
            const periodLabel = scenTab==="short" ? "6ヶ月後" : "5〜10年後";

            return (
              <div style={{marginTop:16,borderRadius:12,overflow:"hidden",border:"1px solid #d0f0f0"}}>
                <div style={{backgroundColor:"white",padding:"12px 16px",display:"flex",alignItems:"center",gap:8,borderBottom:"1px solid #d0f0f0"}}>
                  <span style={{fontSize:16}}>💰</span>
                  <div>
                  <div style={{fontWeight:900,fontSize:14,color:"#082b2e"}}>投資シミュレーション（100株購入の場合）</div>
                  <div style={{fontSize:10,color:"#6b9ea0"}}>公募価格が決定した場合の試算</div>
                  </div>
                </div>

                {!ipoPrice ? (
                  <div style={{backgroundColor:"white",padding:"20px 16px",textAlign:"center"}}>
                    <div style={{fontSize:28,marginBottom:8}}>📅</div>
                    <div style={{fontWeight:900,fontSize:14,color:"#082b2e",marginBottom:8}}>公募価格確定後に自動表示されます</div>
                    <p style={{fontSize:12,color:"#64748b",lineHeight:1.8,marginBottom:16}}>
                      {company.name}（{(company as any).ticker ?? ""}）の公募価格はブックビルディング期間終了後に決定されます。<br/>
                      価格決定後は当サイトに再度ご訪問いただくと、具体的な投資金額シミュレーションをご確認いただけます。
                    </p>
                    <button
                      onClick={() => setShowNotify(true)}
                      style={{display:"inline-flex",alignItems:"center",gap:6,padding:"10px 20px",backgroundColor:"#66c3c6",borderRadius:20,border:"none",cursor:"pointer",boxShadow:"0 2px 8px rgba(102,195,198,0.3)"}}>
                      <span style={{fontSize:14}}>🔔</span>
                      <span style={{fontSize:12,color:"white",fontWeight:900}}>通知設定をする</span>
                    </button>
                  </div>
                ) : (
                  <div style={{backgroundColor:"white",padding:"16px"}}>
                    <div style={{display:"flex",gap:12,marginBottom:16,padding:"10px 14px",backgroundColor:"#f0fafa",borderRadius:10}}>
                      <div style={{textAlign:"center"}}>
                        <div style={{fontSize:10,color:"#6b9ea0"}}>公募価格</div>
                        <div style={{fontWeight:900,fontSize:18,color:"#082b2e"}}>¥{ipoPrice.toLocaleString()}</div>
                      </div>
                      <div style={{width:1,backgroundColor:"#d0f0f0"}}/>
                      <div style={{textAlign:"center"}}>
                        <div style={{fontSize:10,color:"#6b9ea0"}}>最小投資額（100株）</div>
                        <div style={{fontWeight:900,fontSize:18,color:"#082b2e"}}>¥{(ipoPrice*100).toLocaleString()}</div>
                      </div>
                    </div>

                    <div style={{fontSize:11,fontWeight:700,color:"#0d4f52",marginBottom:8}}>{periodLabel}のシナリオ別試算</div>
                    <div style={{overflowX:"auto"}}>
                      <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                        <thead>
                          <tr style={{backgroundColor:"#f0fafa"}}>
                            <th style={{padding:"8px 10px",textAlign:"left",color:"#6b9ea0",fontWeight:700,borderBottom:"1px solid #d0f0f0"}}>シナリオ</th>
                            <th style={{padding:"8px 10px",textAlign:"right",color:"#6b9ea0",fontWeight:700,borderBottom:"1px solid #d0f0f0"}}>株価レンジ</th>
                            <th style={{padding:"8px 10px",textAlign:"right",color:"#6b9ea0",fontWeight:700,borderBottom:"1px solid #d0f0f0"}}>評価額(100株)</th>
                            <th style={{padding:"8px 10px",textAlign:"right",color:"#6b9ea0",fontWeight:700,borderBottom:"1px solid #d0f0f0"}}>損益</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scenarios.map((s:any)=>{
                            const isUp=s.verdict==="強気",isDown=s.verdict==="弱気";
                            const bg=isUp?"#f0fdf4":isDown?"#fef2f2":"#fffbeb";
                            const col=isUp?"#15803d":isDown?"#b91c1c":"#92400e";
                            const icon=isUp?"🟢":isDown?"🔴":"🟡";
                            const nums=s.vsIpo.match(/[\d.]+/g)?.map(Number)??[];
                            let loPrice=0,hiPrice=0,loVal=0,hiVal=0,loPnl=0,hiPnl=0;
                            const base=ipoPrice*100;
                            if(s.vsIpo.includes("倍")&&nums.length>=1){
                              const lo=nums[0],hi=nums[1]??nums[0];
                              loPrice=Math.round(ipoPrice*lo);
                              hiPrice=Math.round(ipoPrice*hi);
                              loVal=loPrice*100; hiVal=hiPrice*100;
                              loPnl=loVal-base; hiPnl=hiVal-base;
                            } else if(s.vsIpo.includes("%")&&nums.length>=1){
                              const lo=1+(nums[0]/100)*(s.vsIpo.includes("-")?-1:1);
                              const hi=nums[1]?1+(nums[1]/100):lo;
                              loPrice=Math.round(ipoPrice*lo);
                              hiPrice=Math.round(ipoPrice*hi);
                              loVal=loPrice*100; hiVal=hiPrice*100;
                              loPnl=loVal-base; hiPnl=hiVal-base;
                            }
                            const samePrice=loPrice===hiPrice;
                            const samePnl=loPnl===hiPnl;
                            const pnlStr=(v:number)=>`${v>=0?"+":""}¥${Math.abs(v).toLocaleString()}`;
                            return (
                              <tr key={s.id} style={{backgroundColor:bg,borderBottom:"1px solid #f0fafa"}}>
                                <td style={{padding:"10px 10px",fontWeight:900,color:col}}>
                                  {icon} {s.verdict}<br/>
                                  <span style={{fontSize:9,fontWeight:400,color:"#94a3b8"}}>確率{s.prob}</span>
                                </td>
                                <td style={{padding:"10px 10px",textAlign:"right",color:"#082b2e",fontWeight:700}}>
                                  {loPrice>0?(samePrice?`¥${loPrice.toLocaleString()}`:`¥${loPrice.toLocaleString()}〜¥${hiPrice.toLocaleString()}`):"計算中"}
                                </td>
                                <td style={{padding:"10px 10px",textAlign:"right",color:"#082b2e",fontWeight:700}}>
                                  {loVal>0?(loVal===hiVal?`¥${loVal.toLocaleString()}`:`¥${loVal.toLocaleString()}〜¥${hiVal.toLocaleString()}`):"計算中"}
                                </td>
                                <td style={{padding:"10px 10px",textAlign:"right",fontWeight:900,color:loPnl>=0?"#15803d":"#b91c1c"}}>
                                  {loPnl!==0?(samePnl?pnlStr(loPnl):`${pnlStr(loPnl)}〜${pnlStr(hiPnl)}`):"計算中"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* 免責文言 */}
                    <div style={{marginTop:12,padding:"10px 12px",backgroundColor:"#fffbeb",borderRadius:8,border:"1px solid #fde68a"}}>
                      <p style={{fontSize:10,color:"#92400e",lineHeight:1.8,margin:0}}>
                        ⚠️ 【重要】本シミュレーションは、IPO企業が金融庁に提出した目論見書をAIが分析した結果に基づく試算値であり、実際の株価を保証するものではありません。実際の株価は市場環境・需給・業績等により大きく影響を受け、試算値より大幅に乖離することがあります。想定外の値動きが生じた場合は、ご自身の判断で躊躇なく損切り等の対応をご検討ください。投資判断および結果に対する責任は当サービスでは負いかねます。
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
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
                const avgScore=items.length?Math.round(items.reduce((s,x)=>s+x.score,0)/items.length):0;
                return (
                  <div key={g.key} style={{backgroundColor:"rgba(255,255,255,0.85)",borderRadius:10,padding:"8px",textAlign:"center"}}>
                    <div style={{fontSize:18,lineHeight:1,marginBottom:2}}>{g.icon}</div>
                    <div style={{fontWeight:900,fontSize:10,color:DARK}}>{g.label}</div>
                    <div style={{fontWeight:900,fontSize:22,color:g.color,lineHeight:1}}>{avgScore}</div>
                    <div style={{fontSize:8,color:TTEXT}}>/100</div>
                  </div>
                );
              })}
           </div>
          </div>
          <div style={{display:"flex",justifyContent:"center",padding:"8px 0 4px"}}>
            <a href="/ipo-guide" style={{fontSize:12,color:"#66c3c6",textDecoration:"none",fontWeight:700,display:"flex",alignItems:"center",gap:6,padding:"8px 20px",borderRadius:20,border:"1px solid #66c3c6",background:"#f0fdf4"}}>
              <span style={{fontSize:16}}>💡</span>
              <span style={{display:"flex",flexDirection:"column",lineHeight:1.5}}>
                <span>IPO投資で資産を増やす</span>
                <span>実践的法則（超短期・短期・長期別）</span>
              </span>
              <span>→</span>
            </a>
          </div>
          <div style={{backgroundColor:"white"}}>
            {GROUPS.map(g=>{
              const items=axes[g.key]||[];
              if(!items.length) return null;
              const avgScore=items.length?Math.round(items.reduce((s,x)=>s+x.score,0)/items.length):0;
              return (
                <div key={g.key} style={{borderBottom:"1px solid #f1f5f9"}}>
                  <div style={{backgroundColor:g.bg,borderBottom:`1px solid ${g.color}`,padding:"12px 16px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:20,lineHeight:1}}>{g.icon}</span>
                      <div style={{flex:1}}>
                        <span style={{fontWeight:900,fontSize:16,color:DARK}}>{g.label}</span>
                        <span style={{fontWeight:700,fontSize:10,padding:"2px 8px",borderRadius:20,backgroundColor:g.color,color:"white",marginLeft:8}}>{g.sub}</span>
                      </div>
                      <div style={{fontWeight:900,fontSize:22,color:g.color,lineHeight:1}}>
                        {avgScore}<span style={{fontSize:10,color:TTEXT}}>/100</span>
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

        {(()=>{
          const cf=(analysis as any).market_data?.competitor_financials;
          if(!cf||!cf.length) return null;
          const valid=cf.filter((c:any)=>!c.error&&(c.revenue!=null||c.net_profit!=null));
          if(!valid.length) return null;
          const sd=(company as any).structured_data;
          const km=sd?.key_metrics;
          const latestKm=Array.isArray(km)&&km.length>0?km[km.length-1]:null;
          const parseJpNum=(s:string|null|undefined)=>{
            if(!s) return null;
            const neg=s.includes("△")||s.includes("-");
            const n=parseFloat(s.replace(/[△▲\-,△円千万億]/g,"").replace(/,/g,""));
            if(isNaN(n)) return null;
            return neg?-n:n;
          };
          const toOku=(sen:number|null)=>sen==null?null:Math.round(sen/10000)/10;
          const ownRevenue=toOku(parseJpNum(latestKm?.revenue));
          const ownProfit=toOku(parseJpNum(latestKm?.ordinary_profit));
          const ownNetProfit=toOku(parseJpNum(latestKm?.net_profit));
          const ownFiscalYear=latestKm?.period??null;
          return (
            <Card>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:12}}>
                <BarChart2 size={14} color={PRIMARY}/>
                <span style={{fontWeight:900,fontSize:14,color:DARK}}>競合他社 財務比較</span>
                <span style={{fontSize:9,color:"#94a3b8",backgroundColor:"#f1f5f9",padding:"2px 6px",borderRadius:10}}>有価証券報告書より</span>
              </div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead>
                    <tr style={{backgroundColor:LIGHT}}>
                      <th style={{padding:"8px 10px",textAlign:"left",fontWeight:900,color:TTEXT,fontSize:10,borderBottom:`1px solid ${BORDER}`}}>企業名</th>
                      <th style={{padding:"8px 10px",textAlign:"right",fontWeight:900,color:TTEXT,fontSize:10,borderBottom:`1px solid ${BORDER}`}}>売上高</th>
                      <th style={{padding:"8px 10px",textAlign:"right",fontWeight:900,color:TTEXT,fontSize:10,borderBottom:`1px solid ${BORDER}`}}>経常利益</th>
                      <th style={{padding:"8px 10px",textAlign:"right",fontWeight:900,color:TTEXT,fontSize:10,borderBottom:`1px solid ${BORDER}`}}>当期純利益</th>
                      <th style={{padding:"8px 10px",textAlign:"right",fontWeight:900,color:TTEXT,fontSize:10,borderBottom:`1px solid ${BORDER}`}}>PER</th>
                      <th style={{padding:"8px 10px",textAlign:"right",fontWeight:900,color:TTEXT,fontSize:10,borderBottom:`1px solid ${BORDER}`}}>決算期</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{borderBottom:`1px solid ${BORDER}`,backgroundColor:PRIMARY+"22"}}>
                      <td style={{padding:"8px 10px",fontWeight:900,color:DARK}}>🎯 {company.name}（IPO銘柄）</td>
                      <td style={{padding:"8px 10px",textAlign:"right",fontWeight:700,color:"#1e293b"}}>{ownRevenue!=null?`${ownRevenue}億円`:"-"}</td>
                      <td style={{padding:"8px 10px",textAlign:"right",fontWeight:700,color:"#1e293b"}}>{ownProfit!=null?`${ownProfit}億円`:"-"}</td>
                      <td style={{padding:"8px 10px",textAlign:"right",fontWeight:700,color:"#1e293b"}}>{ownNetProfit!=null?`${ownNetProfit}億円`:"-"}</td>
                      <td style={{padding:"8px 10px",textAlign:"right",fontWeight:700,color:"#1e293b"}}>
                        {(()=>{const ipoPrice=(company as any).ipo_price;const eps=parseJpNum(latestKm?.eps);return ipoPrice&&eps&&eps>0?`${Math.round(ipoPrice/eps*10)/10}倍`:"-";})()}
                      </td>
                      <td style={{padding:"8px 10px",textAlign:"right",color:"#64748b",fontSize:10}}>{ownFiscalYear||"目論見書参照"}</td>
                    </tr>
                    {valid.map((c:any,i:number)=>(
                      <tr key={i} style={{borderBottom:`1px solid ${BORDER}`,backgroundColor:i%2===0?"white":LIGHT}}>
                        <td style={{padding:"8px 10px",fontWeight:700,color:DARK}}>{c.name}</td>
                        <td style={{padding:"8px 10px",textAlign:"right",color:"#1e293b"}}>{c.revenue!=null?`${c.revenue}億円`:"–"}</td>
                        <td style={{padding:"8px 10px",textAlign:"right",color:c.operating_profit>=0?"#15803d":"#ef4444"}}>{c.operating_profit!=null?`${c.operating_profit}億円`:"–"}</td>
                        <td style={{padding:"8px 10px",textAlign:"right",color:c.net_profit>=0?"#15803d":"#ef4444"}}>{c.net_profit!=null?`${c.net_profit}億円`:"–"}</td>
                        <td style={{padding:"8px 10px",textAlign:"right",color:"#1e293b"}}>{c.per!=null?`${c.per}倍`:"–"}</td>
                        <td style={{padding:"8px 10px",textAlign:"right",color:"#64748b",fontSize:10}}>{c.fiscal_year||"–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{fontSize:10,color:"#94a3b8",marginTop:8,lineHeight:1.6}}>※ EDINETの有価証券報告書から自動取得。単位：億円（百万円未満切り捨て）</p>
            </Card>
          );
        })()}

        {visualizationData && <VizTables vizData={visualizationData} section="bottom" />}
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
{allCompanies && allCompanies.length > 1 && (()=>{
          const sorted=[...allCompanies].sort((a,b)=>new Date(a.listing_date??0).getTime()-new Date(b.listing_date??0).getTime());
          const idx=sorted.findIndex(c=>c.id===company.id);
          const prev=idx>0?sorted[idx-1]:null;
          const next=idx<sorted.length-1?sorted[idx+1]:null;
          return (
            <div style={{display:"flex",gap:8,justifyContent:"space-between"}}>
              <a href={prev?`/analysis/${prev.id}`:undefined as any}
                style={{flex:1,padding:"12px 16px",borderRadius:12,backgroundColor:prev?"white":"#f1f5f9",border:`1px solid ${prev?"#b3e8ea":"#e2e8f0"}`,textDecoration:"none",opacity:prev?1:0.4,pointerEvents:prev?"auto":"none"}}>
                <div style={{fontSize:10,color:"#94a3b8",marginBottom:2}}>← 前の銘柄</div>
                <div style={{fontSize:13,fontWeight:700,color:"#082b2e"}}>{prev?.name??""}</div>
                <div style={{fontSize:10,color:"#66c3c6"}}>{prev?.listing_date??""}</div>
              </a>
              <a href={next?`/analysis/${next.id}`:undefined as any}
                style={{flex:1,padding:"12px 16px",borderRadius:12,backgroundColor:next?"white":"#f1f5f9",border:`1px solid ${next?"#b3e8ea":"#e2e8f0"}`,textDecoration:"none",textAlign:"right",opacity:next?1:0.4,pointerEvents:next?"auto":"none"}}>
                <div style={{fontSize:10,color:"#94a3b8",marginBottom:2}}>次の銘柄 →</div>
                <div style={{fontSize:13,fontWeight:700,color:"#082b2e"}}>{next?.name??""}</div>
                <div style={{fontSize:10,color:"#66c3c6"}}>{next?.listing_date??""}</div>
              </a>
            </div>
          );
        })()}
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