"use client";
import { useState, useEffect } from "react";
import { BarChart2, ChevronLeft, Star, Lock, Zap, Crown, Building2, TrendingUp, Shield, AlertCircle, Calendar, Users, Target, Globe, ChevronRight, ChevronDown } from "lucide-react";

const C = { primary:"#66c3c6", primaryDark:"#4aafb3", deep:"#082b2e", mid:"#0d4f52", muted:"#2a7a7e", light:"#e8f9f9", pale:"#f4fbfc", border:"#b3e8ea", borderLight:"#dff3f4" };
const FREE_LIMIT = 3;

interface IpoCompany {
  id: string; name: string; ticker: string | null; exchange: string | null;
  sector: string | null; biz_type: string | null; price_range_min: number | null;
  price_range_max: number | null; listing_date: string | null; source_url?: string | null;
  apply_start_date: string | null; bb_start_date: string | null;
  lockup_90_date: string | null; lockup_180_date: string | null;
  status: string; highlight: boolean; ai_score: number | null; ai_summary: string | null;
}

const JP_DOW = ["日","月","火","水","木","金","土"];
function formatDate(d: string | null) {
  if (!d) return "未定";
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return `${date.getMonth()+1}月${date.getDate()}日（${JP_DOW[date.getDay()]}）`;
}

function ScoreBar({ score, color }: { score: number; color: string }) {
  return <div style={{ width:"100%", height:"6px", borderRadius:"3px", backgroundColor:C.borderLight }}>
    <div style={{ width:`${score}%`, height:"100%", borderRadius:"3px", backgroundColor:color, transition:"width 0.8s ease" }}/>
  </div>;
}

function scoreLabel(score: number) {
  if (score >= 80) return { label:"S", color:"#d97706" };
  if (score >= 65) return { label:"A", color:"#0d4f52" };
  if (score >= 50) return { label:"B", color:C.primary };
  if (score >= 35) return { label:"C", color:"#64748b" };
  return { label:"D", color:"#ef4444" };
}

type Tab = "ultra" | "short" | "long";

function AxisCard({ axis, locked, tabColor }: { axis: any; locked: boolean; tabColor: string }) {
  const [open, setOpen] = useState(false);
  const sl = scoreLabel(axis.score ?? 60);
  return (
    <div style={{ borderRadius:"12px", border:`1px solid ${C.borderLight}`, overflow:"hidden", marginBottom:"10px" }}>
      <div onClick={() => !locked && setOpen(o => !o)}
        style={{ padding:"12px 14px", backgroundColor:"white", cursor: locked ? "default" : "pointer",
          display:"flex", alignItems:"center", justifyContent:"space-between", gap:"10px" }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:"6px", marginBottom:"4px" }}>
            <span style={{ fontSize:"10px", fontWeight:"900", color:tabColor, backgroundColor:`${tabColor}15`,
              borderRadius:"4px", padding:"1px 6px" }}>{axis.index}</span>
            <span style={{ fontSize:"13px", fontWeight:"900", color:C.deep }}>{axis.title}</span>
          </div>
          <ScoreBar score={axis.score ?? 60} color={sl.color}/>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:"8px", flexShrink:0 }}>
          <span style={{ fontWeight:"900", fontSize:"22px", color:sl.color, lineHeight:"1" }}>{sl.label}</span>
          <span style={{ fontSize:"11px", color:C.muted }}>{axis.score}</span>
          {locked ? <Lock size={14} color="#d97706"/> :
            <ChevronDown size={16} color={C.muted} style={{ transform: open ? "rotate(180deg)" : "none", transition:"transform 0.2s" }}/>}
        </div>
      </div>
      {open && !locked && (
        <div style={{ padding:"14px 16px", backgroundColor:C.pale, borderTop:`1px solid ${C.borderLight}` }}>
          {axis.why_matters && (
            <div style={{ marginBottom:"12px" }}>
              <div style={{ fontSize:"10px", fontWeight:"900", color:tabColor, marginBottom:"4px" }}>💡 なぜ重要か</div>
              <p style={{ fontSize:"12px", color:C.mid, lineHeight:"1.8", margin:0 }}>{axis.why_matters}</p>
            </div>
          )}
          {axis.description && (
            <div style={{ marginBottom:"12px" }}>
              <div style={{ fontSize:"10px", fontWeight:"900", color:C.muted, marginBottom:"4px" }}>📊 詳細分析</div>
              <p style={{ fontSize:"12px", color:C.mid, lineHeight:"1.8", margin:0 }}>{axis.description}</p>
            </div>
          )}
          {axis.verdict && (
            <div style={{ marginBottom:"12px", borderRadius:"8px", padding:"10px 12px",
              backgroundColor:"white", border:`1px solid ${C.border}` }}>
              <div style={{ fontSize:"10px", fontWeight:"900", color:"#0d4f52", marginBottom:"4px" }}>✅ 総評</div>
              <p style={{ fontSize:"12px", color:C.deep, lineHeight:"1.8", margin:0, fontWeight:"700" }}>{axis.verdict}</p>
            </div>
          )}
          {axis.doc_guide && (
            <div style={{ borderRadius:"8px", padding:"8px 12px", backgroundColor:"#f0fafa", border:`1px solid ${C.borderLight}` }}>
              <div style={{ fontSize:"10px", fontWeight:"900", color:C.muted, marginBottom:"4px" }}>📄 参照書類</div>
              <p style={{ fontSize:"11px", color:C.muted, lineHeight:"1.7", margin:0 }}>{axis.doc_guide}</p>
            </div>
          )}
        </div>
      )}
      {locked && (
        <div style={{ padding:"10px 14px", backgroundColor:"#fffbeb", borderTop:`1px solid #fde68a`,
          display:"flex", alignItems:"center", gap:"6px" }}>
          <Lock size={12} color="#d97706"/>
          <span style={{ fontSize:"11px", color:"#92400e" }}>詳細はプレミアム会員または¥500の単品購入で閲覧できます</span>
        </div>
      )}
    </div>
  );
}

export function AnalysisClient({ company, order, allCompanies, error }: {
  company: IpoCompany; order: number; allCompanies: IpoCompany[]; error: string | null;
}) {
  const [aiData, setAiData] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("ultra");

  useEffect(() => {
    fetch("/api/analyze", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(company) })
      .then(r => r.json()).then(data => { setAiData(data); setAiLoading(false); }).catch(() => setAiLoading(false));
  }, [company.id]);

  useEffect(() => {
    const isFree = order < FREE_LIMIT;
    if (isFree) { setHasAccess(true); setAccessLoading(false); return; }
    fetch(`/api/access?stock_id=${company.id}&free_rank=${order}`)
      .then(r => r.json()).then(d => { setHasAccess(d.access); setAccessLoading(false); })
      .catch(() => { setHasAccess(false); setAccessLoading(false); });
  }, [company.id, order]);

  if (accessLoading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", backgroundColor:"#f0fafa" }}>
      <p style={{ color:C.muted, fontSize:"14px" }}>読み込み中...</p>
    </div>
  );

  if (!hasAccess) return (
    <div style={{ minHeight:"100vh", backgroundColor:"#f0fafa", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Noto Sans JP',sans-serif" }}>
      <div style={{ backgroundColor:"white", borderRadius:"20px", padding:"40px 32px", maxWidth:"380px", width:"90%", textAlign:"center", boxShadow:"0 8px 32px rgba(0,0,0,0.1)" }}>
        <div style={{ fontSize:"48px", marginBottom:"16px" }}>🔒</div>
        <h2 style={{ fontSize:"18px", fontWeight:"900", color:"#082b2e", marginBottom:"8px" }}>{company.name}</h2>
        <p style={{ fontSize:"13px", color:C.muted, marginBottom:"24px", lineHeight:"1.7" }}>
          この銘柄の詳細分析レポートは有料コンテンツです。<br/>¥500で購入するか、全銘柄読み放題プランをご利用ください。
        </p>
        <button onClick={async () => {
          const r = await fetch("/api/checkout", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ plan:"single", stockId:company.id }) });
          const d = await r.json();
          if (d.url) window.location.href = d.url;
        }} style={{ width:"100%", padding:"14px", backgroundColor:"#f59e0b", color:"white", border:"none", borderRadius:"12px", fontSize:"15px", fontWeight:"900", cursor:"pointer", marginBottom:"12px" }}>
          ¥500 で購入する
        </button>
        <a href="/calendar" style={{ display:"block", fontSize:"12px", color:C.muted, textDecoration:"none" }}>← 銘柄一覧に戻る</a>
      </div>
    </div>
  );

  const isFree = order <= FREE_LIMIT;
  const totalScore = aiData?.total_score ?? company.ai_score ?? 60;
  const overall = scoreLabel(totalScore);
  const price = company.price_range_min && company.price_range_max
    ? `¥${company.price_range_min.toLocaleString()}〜¥${company.price_range_max.toLocaleString()}` : "公募価格未定";

  const sortedAll = [...allCompanies].sort((a, b) => (a.listing_date ?? "") > (b.listing_date ?? "") ? 1 : -1);
  const currentIdx = sortedAll.findIndex(c => c.id === company.id);
  const prevCompany = currentIdx > 0 ? sortedAll[currentIdx - 1] : null;
  const nextCompany = currentIdx < sortedAll.length - 1 ? sortedAll[currentIdx + 1] : null;

  const tabItems = [
    { id:"ultra" as Tab, label:"⚡ 超短期", color:"#ef4444" },
    { id:"short" as Tab, label:"📈 短期",   color:"#d97706" },
    { id:"long"  as Tab, label:"🏔 長期",   color:C.primary },
  ];
  const tabColor = tabItems.find(t => t.id === tab)?.color ?? C.primary;

  const getAxes = () => {
    if (!aiData?.axes) return [];
    if (tab === "ultra") return aiData.axes.ultra_short ?? [];
    if (tab === "short") return aiData.axes.short ?? [];
    return aiData.axes.long ?? [];
  };

  const sources = aiData?.sources ?? [
    { label:"東証・新規上場情報", url:"https://www.jpx.co.jp/listing/stocks/new/index.html" },
    { label:"EDINET（有価証券届出書）", url:"https://disclosure2.edinet-fsa.go.jp/" },
    { label:`みんかぶ`, url:`https://minkabu.jp/stock/${company.ticker ?? ""}` },
    { label:"IPO株", url:"https://ipokabu.net/" },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor:C.pale, fontFamily:"'Noto Sans JP','Hiragino Kaku Gothic ProN',sans-serif" }}>
      <nav style={{ position:"sticky", top:0, zIndex:40, padding:"10px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", backgroundColor:C.mid, borderBottom:`1px solid ${C.muted}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
          <div style={{ borderRadius:"6px", padding:"6px", backgroundColor:C.primary }}><BarChart2 size={14} color="white"/></div>
          <div>
            <div style={{ fontWeight:"900", fontSize:"13px", color:"white", lineHeight:"1.2" }}>IPO企業情報AI分析レポート</div>
            <div style={{ fontWeight:"700", fontSize:"9px", color:"#4aafb3" }}>担当：大手町調査室九課</div>
          </div>
        </div>
        <a href="/calendar" style={{ fontWeight:"700", fontSize:"10px", borderRadius:"999px", padding:"4px 12px", backgroundColor:"#134f53", color:C.primary, textDecoration:"none" }}>← カレンダーへ</a>
      </nav>

      <div style={{ maxWidth:"800px", margin:"0 auto", padding:"16px" }}>
        {/* ヘッダーカード */}
        <div style={{ borderRadius:"16px", overflow:"hidden", marginBottom:"16px", border:`2px solid ${company.highlight ? "#fde68a" : C.border}` }}>
          <div style={{ padding:"16px 20px", backgroundColor:C.primary }}>
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:"12px", flexWrap:"wrap" }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"6px", flexWrap:"wrap" }}>
                  <span style={{ fontWeight:"900", fontSize:"20px", color:C.deep, lineHeight:"1" }}>
                    {["①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩"][order-1] ?? `(${order})`}
                  </span>
                  <span style={{ fontWeight:"700", fontSize:"9px", borderRadius:"999px", padding:"2px 8px", backgroundColor:isFree?"#dcfce7":"#fef3c7", color:isFree?"#15803d":"#92400e" }}>{isFree?"無料":"有料"}</span>
                  {company.exchange && <span style={{ fontWeight:"900", fontSize:"10px", borderRadius:"6px", padding:"2px 8px", backgroundColor:C.light, color:C.mid }}>{company.exchange}</span>}
                  {company.highlight && <Star size={14} color="#d97706" fill="#d97706"/>}
                </div>
                <h1 style={{ fontWeight:"900", fontSize:"20px", color:C.deep, lineHeight:"1.3", margin:0 }}>{company.name}</h1>
                <div style={{ marginTop:"6px", display:"flex", gap:"8px", flexWrap:"wrap" }}>
                  {company.sector && <span style={{ fontSize:"12px", color:C.mid }}>{company.sector}</span>}
                  {company.ticker && <span style={{ fontSize:"12px", fontWeight:"900", color:C.deep }}>{company.ticker}</span>}
                </div>
              </div>
              <div style={{ textAlign:"center", flexShrink:0 }}>
                <div style={{ width:"72px", height:"72px", borderRadius:"50%", backgroundColor:"white", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", border:`3px solid ${overall.color}`, boxShadow:`0 0 0 4px ${overall.color}20` }}>
                  <span style={{ fontWeight:"900", fontSize:"28px", color:overall.color, lineHeight:"1" }}>{overall.label}</span>
                  <span style={{ fontSize:"9px", color:C.muted, fontWeight:"700" }}>総合</span>
                </div>
                <div style={{ marginTop:"4px", fontSize:"11px", fontWeight:"700", color:C.deep }}>{totalScore}点</div>
              </div>
            </div>
          </div>
          <div style={{ padding:"12px 20px", backgroundColor:"white", display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:"8px" }}>
            {[
              { label:"上場日", val:formatDate(company.listing_date) },
              { label:"公募価格帯", val:price },
              { label:"申込開始日", val:formatDate(company.apply_start_date) },
              { label:"BB開始日", val:formatDate(company.bb_start_date) },
            ].map(({ label, val }) => (
              <div key={label} style={{ borderRadius:"10px", padding:"8px 12px", backgroundColor:C.pale, border:`1px solid ${C.borderLight}` }}>
                <div style={{ fontSize:"10px", color:C.muted, fontWeight:"700", marginBottom:"2px" }}>{label}</div>
                <div style={{ fontSize:"12px", color:C.deep, fontWeight:"900" }}>{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* AI要約 */}
        <div style={{ borderRadius:"16px", padding:"16px", marginBottom:"16px", backgroundColor:"white", border:`1px solid ${C.borderLight}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:"6px", marginBottom:"10px" }}>
            <Zap size={15} color={C.primary}/>
            <span style={{ fontWeight:"900", fontSize:"13px", color:C.deep }}>AI分析要約</span>
          </div>
          {aiLoading ? (
            <p style={{ fontSize:"13px", color:C.muted, lineHeight:"1.8", margin:0 }}>AI分析を生成中です（30秒〜1分かかります）...</p>
          ) : (
            <p style={{ fontSize:"13px", color:C.mid, lineHeight:"1.8", margin:0 }}>
              {aiData?.summary ?? company.ai_summary ?? "要約は未登録です。"}
            </p>
          )}
        </div>

        {/* 9軸分析 */}
        <div style={{ borderRadius:"16px", overflow:"hidden", marginBottom:"16px", border:`1px solid ${C.border}` }}>
          <div style={{ display:"flex", backgroundColor:C.light, borderBottom:`1px solid ${C.border}` }}>
            {tabItems.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ flex:1, padding:"10px 4px", fontWeight:"900", fontSize:"12px", border:"none", outline:"none", cursor:"pointer",
                  backgroundColor: tab===t.id ? "white" : "transparent", color: tab===t.id ? t.color : C.muted,
                  borderBottom: tab===t.id ? `3px solid ${t.color}` : "3px solid transparent", transition:"all 0.15s" }}>
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ padding:"14px", backgroundColor:C.pale }}>
            {aiLoading ? (
              <p style={{ fontSize:"12px", color:C.muted, textAlign:"center", padding:"20px" }}>AI分析生成中...</p>
            ) : getAxes().length > 0 ? (
              getAxes().map((axis: any) => (
                <AxisCard key={axis.id} axis={axis} locked={!isFree && tab !== "ultra"} tabColor={tabColor}/>
              ))
            ) : (
              <p style={{ fontSize:"12px", color:C.muted, textAlign:"center", padding:"20px" }}>データを生成中です。しばらくお待ちください。</p>
            )}
            {!isFree && (tab === "short" || tab === "long") && (
              <div style={{ borderRadius:"12px", padding:"14px", textAlign:"center", backgroundColor:"#fffbeb", border:"2px solid #fde68a", marginTop:"8px" }}>
                <Lock size={20} color="#d97706" style={{ margin:"0 auto 8px" }}/>
                <div style={{ fontWeight:"900", fontSize:"13px", color:"#92400e", marginBottom:"8px" }}>詳細分析を読むには</div>
                <div style={{ display:"flex", gap:"8px", justifyContent:"center", flexWrap:"wrap" }}>
                  <button onClick={async () => {
                    const r = await fetch("/api/checkout", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ plan:"single", stockId:company.id }) });
                    const d = await r.json();
                    if (d.url) window.location.href = d.url;
                  }} style={{ fontWeight:"900", fontSize:"12px", borderRadius:"10px", padding:"8px 20px", backgroundColor:"#d97706", color:"white", border:"none", cursor:"pointer" }}>
                    ¥500 でこの銘柄を読む
                  </button>
                  <a href="/#purchase" style={{ fontWeight:"900", fontSize:"12px", borderRadius:"10px", padding:"8px 20px", backgroundColor:C.primary, color:C.deep, textDecoration:"none" }}>
                    プレミアムプランを見る
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ロックアップカレンダー */}
        {(company.lockup_90_date || company.lockup_180_date) && (
          <div style={{ borderRadius:"16px", overflow:"hidden", marginBottom:"16px", border:`1px solid ${C.border}` }}>
            <div style={{ padding:"10px 16px", backgroundColor:C.light, borderBottom:`1px solid ${C.border}`, fontWeight:"900", fontSize:"12px", color:C.mid }}>
              📅 ロックアップ解除スケジュール
            </div>
            <div style={{ backgroundColor:"white" }}>
              {[
                { label:"90日解除", date:company.lockup_90_date, color:"#ef4444", note:"大量売り圧力に注意" },
                { label:"180日解除", date:company.lockup_180_date, color:"#f59e0b", note:"追加の需給悪化リスク" },
              ].filter(r => r.date).map((r, i, arr) => (
                <div key={r.label} style={{ padding:"12px 16px", borderBottom:i<arr.length-1?`1px solid ${C.borderLight}`:"none", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                    <div style={{ width:"10px", height:"10px", borderRadius:"50%", backgroundColor:r.color }}/>
                    <div>
                      <div style={{ fontWeight:"900", fontSize:"13px", color:C.deep }}>{r.label}</div>
                      <div style={{ fontSize:"10px", color:C.muted }}>{r.note}</div>
                    </div>
                  </div>
                  <div style={{ fontWeight:"900", fontSize:"13px", color:C.deep }}>{formatDate(r.date!)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 前後ナビ */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px", marginBottom:"16px" }}>
          {prevCompany ? (
            <a href={`/analysis/${prevCompany.id}`} style={{ borderRadius:"12px", padding:"10px 12px", backgroundColor:"white", border:`1px solid ${C.borderLight}`, textDecoration:"none", display:"flex", alignItems:"center", gap:"6px" }}>
              <ChevronLeft size={14} color={C.muted}/>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:"9px", color:C.muted, fontWeight:"700" }}>前の銘柄</div>
                <div style={{ fontSize:"12px", color:C.deep, fontWeight:"900", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{prevCompany.name}</div>
              </div>
            </a>
          ) : <div/>}
          {nextCompany ? (
            <a href={`/analysis/${nextCompany.id}`} style={{ borderRadius:"12px", padding:"10px 12px", backgroundColor:"white", border:`1px solid ${C.borderLight}`, textDecoration:"none", display:"flex", alignItems:"center", justifyContent:"flex-end", gap:"6px", textAlign:"right" }}>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:"9px", color:C.muted, fontWeight:"700" }}>次の銘柄</div>
                <div style={{ fontSize:"12px", color:C.deep, fontWeight:"900", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{nextCompany.name}</div>
              </div>
              <ChevronRight size={14} color={C.muted}/>
            </a>
          ) : <div/>}
        </div>

        {/* 参考文献 */}
        <div style={{ borderRadius:"12px", padding:"16px", marginBottom:"16px", backgroundColor:"#f0fafa", border:"1px solid #b3e8ea" }}>
          <p style={{ fontSize:"12px", fontWeight:"900", color:"#082b2e", marginBottom:"12px" }}>📚 参考文献・出典</p>
          <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
            {sources.map((s: any) => (
              <a key={s.label} href={s.url} target="_blank" rel="noopener noreferrer"
                style={{ fontSize:"12px", color:C.primary, textDecoration:"underline", display:"flex", alignItems:"center", gap:"4px" }}>
                🔗 {s.label}
              </a>
            ))}
          </div>
          <p style={{ fontSize:"10px", color:"#6b8e8e", marginTop:"12px", lineHeight:"1.6" }}>
            ※本レポートのAI分析はClaude（Anthropic）とGemini（Google）による自動生成です。投資判断はご自身の責任で行ってください。
          </p>
        </div>

        {/* 注意事項 */}
        <div style={{ borderRadius:"12px", padding:"12px 14px", marginBottom:"16px", backgroundColor:"#fffbeb", border:"1px solid #fde68a", display:"flex", alignItems:"flex-start", gap:"8px" }}>
          <AlertCircle size={13} color="#d97706" style={{ flexShrink:0, marginTop:"1px" }}/>
          <p style={{ fontSize:"10px", color:"#92400e", margin:0, lineHeight:"1.7" }}>
            本レポートのスコア・分析はAIによる試算値であり、投資勧誘ではありません。最終的な投資判断はご自身の責任のもとで行ってください。
          </p>
        </div>

        <div style={{ textAlign:"center", paddingBottom:"24px" }}>
          <p style={{ fontSize:"9px", color:C.borderLight }}>© 2025 大手町調査室九課</p>
        </div>
      </div>
    </div>
  );
}