"use client";
import VizCharts from "@/components/VizCharts";
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

function ScenarioCompareChart({scenarios}:{scenarios:Scenario[]}) {
  if(!scenarios||scenarios.length===0) return null;
  const rows=scenarios.map(s=>{
    const probVal=Math.max(0,Math.min(100,avg(parseNumbers(s.prob))));
    const retVal=avg(parseNumbers(s.vsIpo));
    return {...s,probVal,retVal};
  });
  const maxAbsRet=Math.max(10,...rows.map(r=>Math.abs(r.retVal)));
  const colorFor=(v:string)=>v==="強気"?"#15803d":v==="弱気"?"#b91c1c":"#92400e";
  const bgFor=(v:string)=>v==="強気"?"#f0fdf4":v==="弱気"?"#fef2f2":"#fffbeb";
  const borderFor=(v:string)=>v==="強気"?"#bbf7d0":v==="弱気"?"#fecaca":"#fde68a";
  return (
    <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
      {rows.map(r=>(
        <div key={r.id} style={{backgroundColor:bgFor(r.verdict),border:`1px solid ${borderFor(r.verdict)}`,borderRadius:10,padding:"8px 10px"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
            <span style={{fontWeight:900,fontSize:10,padding:"1px 8px",borderRadius:20,backgroundColor:"white",color:colorFor(r.verdict),border:`1px solid ${borderFor(r.verdict)}`}}>{r.verdict}</span>
            <span style={{fontWeight:900,fontSize:11,color:DARK}}>{r.name||r.verdict}</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
            <span style={{fontSize:9,color:"#94a3b8",width:60,flexShrink:0}}>確率</span>
            <div style={{flex:1,height:6,borderRadius:3,backgroundColor:"#ffffff",overflow:"hidden"}}>
              <div style={{height:"100%",borderRadius:3,width:`${r.probVal}%`,backgroundColor:PRIMARY}}/>
            </div>
            <span style={{fontSize:10,fontWeight:900,color:"#1e293b",width:44,textAlign:"right"}}>{r.prob}</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:9,color:"#94a3b8",width:60,flexShrink:0}}>期待リターン</span>
            <div style={{flex:1,height:6,borderRadius:3,backgroundColor:"#ffffff",position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",top:0,bottom:0,width:1,backgroundColor:"#cbd5e1",left:"50%"}}/>
              <div style={{position:"absolute",top:0,height:"100%",borderRadius:3,
                ...(r.retVal>=0?{left:"50%"}:{right:"50%"}),
                width:`${Math.min(50,(Math.abs(r.retVal)/maxAbsRet)*50)}%`,
                backgroundColor:r.retVal>=0?"#22c55e":"#f87171"}}/>
            </div>
            <span style={{fontSize:10,fontWeight:900,color:"#1e293b",width:44,textAlign:"right"}}>{r.vsIpo}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function LockupTimeline({lockupPeriod}:{lockupPeriod:string}) {
  return (
    <div style={{marginTop:10,padding:"16px 10px 24px"}}>
      <div style={{position:"relative",height:2,backgroundColor:"#e2e8f0",borderRadius:1}}>
        <div style={{position:"absolute",left:0,top:-5,width:12,height:12,borderRadius:"50%",backgroundColor:PRIMARY,border:"2px solid white",boxShadow:"0 0 0 1px #e2e8f0"}}/>
        <div style={{position:"absolute",right:0,top:-5,width:12,height:12,borderRadius:"50%",backgroundColor:"#ef4444",border:"2px solid white",boxShadow:"0 0 0 1px #e2e8f0"}}/>
        <div style={{position:"absolute",left:0,top:10,fontSize:9,fontWeight:700,color:TTEXT,whiteSpace:"nowrap"}}>🔔 上場日</div>
        <div style={{position:"absolute",right:0,top:10,fontSize:9,fontWeight:700,color:"#ef4444",textAlign:"right",whiteSpace:"nowrap"}}>🔓 解除：{lockupPeriod}</div>
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

export default function AnalysisClient({company,initialAnalysis,visualizationData}:{company:IpoCompany;initialAnalysis:Analysis|null;visualizationData?:any}) {
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
    {key:"ultra_short" as const,label:"超短期",sub:"初値売り・当日トレード",icon:"⚡",color:"#ef4444",bg:"#fef2f2",border:"#fecaca"},
    {key:"short"       as const,label:"短期",  sub:"数週間〜数ヶ月",        icon:"📈",color:"#d97706",bg:"#fffbeb",border:"#fde68a"},
    {key:"long"        as const,label:"長期",  sub:"数年〜",                icon:"🏔",color:"#7c3aed",bg:"#f5f3ff",border:"#ddd6fe"},
  ];

  const wrap:React.CSSProperties={maxWidth:720,margin:"0 auto",padding:"0 16px"};

  return (
    <div style={{backgroundColor:"#eef9f9",minHeight:"100vh",fontFamily:"'Noto Sans JP',sans-serif"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 16px",backgroundColor:"#e8f4f5",borderBottom:"1px solid #d0e8ea"}}>
        <button onClick={()=>setShowNotify(true)} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:6,backgroundColor:"#0d4f52",border:"none",cursor:"pointer",color:"white",fontSize:11,fontWeight:700}}>🔔 通知</button>
        <a href="/calendar" style={{color:"#0d4f52",fontSize:11,display:"flex",alignItems:"center",gap:3,textDecoration:"none",fontWeight:600}}>‹ カレンダーへ</a>
        {showNotify&&<NotifyModal company={company} userId={userId} onClose={()=>setShowNotify(false)}/>}
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
        {visualizationData && <VizCharts vizData={visualizationData} />}
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
          <ScenarioCompareChart scenarios={scenTab==="short"?scenarios_short:scenarios_long}/>
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
          <div style={{backgroundColor:"white"}}>
            {GROUPS.map(g=>{
              const items=axes[g.key]||[];
              if(!items.length) return null;
              const avgScore=items.length?Math.round(items.reduce((s,x)=>s+x.score,0)/items.length):0;
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