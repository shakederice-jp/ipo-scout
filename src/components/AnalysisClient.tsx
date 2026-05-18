"use client";

import { useState, useEffect } from "react";
import {
  BarChart2, ChevronLeft, Star, Lock, Zap, Crown,
  Building2, TrendingUp, Shield, AlertCircle, Calendar,
  Users, Target, Globe, ChevronRight
} from "lucide-react";

// ── カラー定数 ─────────────────────────────────────────────────────────────
const C = {
  primary:     "#66c3c6",
  primaryDark: "#4aafb3",
  deep:        "#082b2e",
  mid:         "#0d4f52",
  muted:       "#2a7a7e",
  light:       "#e8f9f9",
  pale:        "#f4fbfc",
  border:      "#b3e8ea",
  borderLight: "#dff3f4",
};

const FREE_LIMIT = 3;

// ── 型定義 ─────────────────────────────────────────────────────────────────
interface IpoCompany {
  id: string;
  name: string;
  ticker: string | null;
  exchange: string | null;
  sector: string | null;
  biz_type: string | null;
  price_range_min: number | null;
  price_range_max: number | null;
  listing_date: string | null;`n  source_url: string | null;
  apply_start_date: string | null;
  bb_start_date: string | null;
  lockup_90_date: string | null;
  lockup_180_date: string | null;
  status: string;
  highlight: boolean;
  ai_score: number | null;
  ai_summary: string | null;
}

// ── 日付フォーマット ──────────────────────────────────────────────────────
const JP_DOW = ["日","月","火","水","木","金","土"];
function formatDate(d: string | null): string {
  if (!d) return "未定";
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return `${date.getMonth()+1}月${date.getDate()}日（${JP_DOW[date.getDay()]}）`;
}

// ── スコアバー ────────────────────────────────────────────────────────────
function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div style={{ width:"100%", height:"6px", borderRadius:"3px",
      backgroundColor:C.borderLight, overflow:"hidden" }}>
      <div style={{ width:`${score}%`, height:"100%", borderRadius:"3px",
        backgroundColor:color, transition:"width 0.8s ease" }}/>
    </div>
  );
}

// ── スコアラベル ──────────────────────────────────────────────────────────
function scoreLabel(score: number): { label: string; color: string } {
  if (score >= 80) return { label:"S", color:"#d97706" };
  if (score >= 65) return { label:"A", color:"#0d4f52" };
  if (score >= 50) return { label:"B", color:C.primary };
  if (score >= 35) return { label:"C", color:"#64748b" };
  return { label:"D", color:"#ef4444" };
}

// ── 分析軸定義 ─────────────────────────────────────────────────────────────
const ULTRA_SHORT = [
  { id:"us1", label:"BB人気度予測",    icon:<Zap size={14}/>,       desc:"ブックビルディングの申込倍率予測" },
  { id:"us2", label:"初値上昇余地",    icon:<TrendingUp size={14}/>, desc:"公募価格比の初値騰落率予測" },
  { id:"us3", label:"需給バランス",    icon:<Target size={14}/>,     desc:"売出し比率・VC保有状況など" },
];
const SHORT = [
  { id:"s1",  label:"成長ストーリー",  icon:<Globe size={14}/>,      desc:"TAM・市場成長率・参入余地" },
  { id:"s2",  label:"競合優位性",      icon:<Shield size={14}/>,     desc:"参入障壁・Moat・差別化要因" },
  { id:"s3",  label:"財務健全性",      icon:<Building2 size={14}/>,  desc:"売上成長率・黒字化・キャッシュ" },
];
const LONG = [
  { id:"l1",  label:"経営陣の質",      icon:<Users size={14}/>,      desc:"創業者・経歴・実行力" },
  { id:"l2",  label:"ロックアップリスク", icon:<Calendar size={14}/>, desc:"90日・180日解除の影響度" },
  { id:"l3",  label:"長期成長ポテンシャル", icon:<Crown size={14}/>, desc:"5年後の事業規模・EPS予測" },
];

// スコアをAI総合スコアから軸ごとに分散させる（デモ用）
function deriveScores(aiScore: number | null): Record<string, number> {
  const base = aiScore ?? 60;
  const variance = (seed: number) => Math.min(100, Math.max(20,
    base + Math.round((Math.sin(seed) * 20))));
  return {
    us1: variance(1), us2: variance(2), us3: variance(3),
    s1:  variance(4), s2:  variance(5), s3:  variance(6),
    l1:  variance(7), l2:  variance(8), l3:  variance(9),
  };
}

// ── タブ ──────────────────────────────────────────────────────────────────
type Tab = "ultra" | "short" | "long";

// ── メインコンポーネント ───────────────────────────────────────────────────
export function AnalysisClient({ company, order, allCompanies, error }: {
  company: IpoCompany;
  order: number;
  allCompanies: IpoCompany[];
  error: string | null;
}) {
    const [aiData, setAiData] = useState<any>(null);
const [aiLoading, setAiLoading] = useState(true);

useEffect(() => {
  fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(company),
  })
    .then((r) => r.json())
    .then((data) => { setAiData(data); setAiLoading(false); })
    .catch(() => setAiLoading(false));
}, [company.id]);
  // ── アクセス権チェック ──────────────────────────────
  const [hasAccess,     setHasAccess]     = useState<boolean | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);

  useEffect(() => {
    const isFree = order < FREE_LIMIT;
    if (isFree) { setHasAccess(true); setAccessLoading(false); return; }
    fetch(`/api/access?stock_id=${company.id}&free_rank=${order}`)
      .then(r => r.json())
      .then(d => { setHasAccess(d.access); setAccessLoading(false); })
      .catch(() => { setHasAccess(false); setAccessLoading(false); });
  }, [company.id, order]);

  if (accessLoading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center",
      justifyContent:"center", backgroundColor:"#f0fafa" }}>
      <p style={{ color:"#2a7a7e", fontSize:"14px" }}>読み込み中...</p>
    </div>
  );

  if (!hasAccess) return (
    <div style={{ minHeight:"100vh", backgroundColor:"#f0fafa",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"'Noto Sans JP',sans-serif" }}>
      <div style={{ backgroundColor:"white", borderRadius:"20px", padding:"40px 32px",
        maxWidth:"380px", width:"90%", textAlign:"center",
        boxShadow:"0 8px 32px rgba(0,0,0,0.1)" }}>
        <div style={{ fontSize:"48px", marginBottom:"16px" }}>🔒</div>
        <h2 style={{ fontSize:"18px", fontWeight:"900", color:"#082b2e",
          marginBottom:"8px" }}>{company.name}</h2>
        <p style={{ fontSize:"13px", color:"#2a7a7e", marginBottom:"24px",
          lineHeight:"1.7" }}>
          この銘柄の詳細分析レポートは有料コンテンツです。<br/>
          ¥500で購入するか、全銘柄読み放題プランをご利用ください。
        </p>
        <button onClick={async () => {
          const r = await fetch("/api/checkout", { method:"POST",
            headers:{"Content-Type":"application/json"},
            body: JSON.stringify({ plan:"single", stockId: company.id }) });
          const d = await r.json();
          if (d.url) window.location.href = d.url;
        }} style={{ width:"100%", padding:"14px", backgroundColor:"#f59e0b",
          color:"white", border:"none", borderRadius:"12px", fontSize:"15px",
          fontWeight:"900", cursor:"pointer", marginBottom:"12px" }}>
          ¥500 で購入する
        </button>
        <a href="/calendar" style={{ display:"block", fontSize:"12px",
          color:"#2a7a7e", textDecoration:"none" }}>
          ← 銘柄一覧に戻る
        </a>
      </div>
    </div>
  );
const [tab, setTab] = useState<Tab>("ultra");
  const isFree = order <= FREE_LIMIT;
  const scores = deriveScores(aiData?.total_score ?? company.ai_score);
  const overall = scoreLabel(aiData?.total_score ?? company.ai_score ?? 60);

  const price = company.price_range_min && company.price_range_max
    ? `¥${company.price_range_min.toLocaleString()}〜¥${company.price_range_max.toLocaleString()}`
    : "公募価格未定";

  // 前後の銘柄
  const sortedAll = [...allCompanies].sort((a, b) =>
    (a.listing_date ?? "") > (b.listing_date ?? "") ? 1 : -1);
  const currentIdx = sortedAll.findIndex(c => c.id === company.id);
  const prevCompany = currentIdx > 0 ? sortedAll[currentIdx - 1] : null;
  const nextCompany = currentIdx < sortedAll.length - 1 ? sortedAll[currentIdx + 1] : null;

  const tabItems: { id: Tab; label: string; color: string; icon: React.ReactNode }[] = [
    { id:"ultra", label:"⚡ 超短期", color:"#ef4444", icon:<Zap size={13}/> },
    { id:"short", label:"📈 短期",   color:"#d97706", icon:<TrendingUp size={13}/> },
    { id:"long",  label:"🏔 長期",   color:C.primary, icon:<Crown size={13}/> },
  ];

  const currentAxes = tab === "ultra" ? ULTRA_SHORT : tab === "short" ? SHORT : LONG;
  const tabColor = tabItems.find(t => t.id === tab)?.color ?? C.primary;

  return (
    <div className="min-h-screen" style={{ backgroundColor:C.pale,
      fontFamily:"'Noto Sans JP','Hiragino Kaku Gothic ProN',sans-serif" }}>

      {/* ナビバー */}
      <nav style={{ position:"sticky", top:0, zIndex:40, padding:"10px 16px",
        display:"flex", alignItems:"center", justifyContent:"space-between",
        backgroundColor:C.mid, borderBottom:`1px solid ${C.muted}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
          <div style={{ borderRadius:"6px", padding:"6px", backgroundColor:C.primary }}>
            <BarChart2 size={14} color="white"/>
          </div>
          <div>
            <div style={{ fontWeight:"900", fontSize:"13px", color:"white",
              lineHeight:"1.2" }}>IPO企業情報AI分析レポート</div>
            <div style={{ fontWeight:"700", fontSize:"9px", color:"#4aafb3" }}>
              担当：大手町調査室九課
            </div>
          </div>
        </div>
        <a href="/calendar" style={{ fontWeight:"700", fontSize:"10px",
          borderRadius:"999px", padding:"4px 12px",
          backgroundColor:"#134f53", color:C.primary, textDecoration:"none" }}>
          ← カレンダーへ
        </a>
      </nav>

      <div style={{ maxWidth:"800px", margin:"0 auto", padding:"16px" }}>

        {/* ── ヘッダーカード ── */}
        <div style={{ borderRadius:"16px", overflow:"hidden", marginBottom:"16px",
          border:`2px solid ${company.highlight ? "#fde68a" : C.border}` }}>

          {/* 上部（ティファニー背景） */}
          <div style={{ padding:"16px 20px", backgroundColor:C.primary }}>
            <div style={{ display:"flex", alignItems:"flex-start",
              justifyContent:"space-between", gap:"12px", flexWrap:"wrap" }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:"8px",
                  marginBottom:"6px", flexWrap:"wrap" }}>
                  {/* 順番バッジ */}
                  <span style={{ fontWeight:"900", fontSize:"20px", color:C.deep,
                    lineHeight:"1" }}>
                    {["①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩"][order-1] ?? `(${order})`}
                  </span>
                  <span style={{ fontWeight:"700", fontSize:"9px",
                    borderRadius:"999px", padding:"2px 8px",
                    backgroundColor: isFree ? "#dcfce7" : "#fef3c7",
                    color: isFree ? "#15803d" : "#92400e" }}>
                    {isFree ? "無料" : "有料"}
                  </span>
                  {company.exchange && (
                    <span style={{ fontWeight:"900", fontSize:"10px",
                      borderRadius:"6px", padding:"2px 8px",
                      backgroundColor:C.light, color:C.mid }}>
                      {company.exchange}
                    </span>
                  )}
                  {company.highlight && <Star size={14} color="#d97706" fill="#d97706"/>}
                </div>
                <h1 style={{ fontWeight:"900", fontSize:"20px", color:C.deep,
                  lineHeight:"1.3", margin:0 }}>{company.name}</h1>
                <div style={{ marginTop:"6px", display:"flex", gap:"8px", flexWrap:"wrap" }}>
                  {company.sector && (
                    <span style={{ fontSize:"12px", color:C.mid }}>{company.sector}</span>
                  )}
                  {company.ticker && (
                    <span style={{ fontSize:"12px", fontWeight:"900", color:C.deep }}>
                      {company.ticker}
                    </span>
                  )}
                </div>
              </div>

              {/* AI総合スコア */}
              <div style={{ textAlign:"center", flexShrink:0 }}>
                <div style={{ width:"72px", height:"72px", borderRadius:"50%",
                  backgroundColor:"white", display:"flex", flexDirection:"column",
                  alignItems:"center", justifyContent:"center",
                  border:`3px solid ${overall.color}`,
                  boxShadow:`0 0 0 4px ${overall.color}20` }}>
                  <span style={{ fontWeight:"900", fontSize:"28px", color:overall.color,
                    lineHeight:"1" }}>{overall.label}</span>
                  <span style={{ fontSize:"9px", color:C.muted, fontWeight:"700" }}>総合</span>
                </div>
                <div style={{ marginTop:"4px", fontSize:"11px", fontWeight:"700", color:C.deep }}>
                  {company.ai_score ?? "—"}点
                </div>
              </div>
            </div>
          </div>

          {/* 下部（白背景：基本情報） */}
          <div style={{ padding:"12px 20px", backgroundColor:"white",
            display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:"8px" }}>
            {[
              { label:"上場日",      val: formatDate(company.listing_date) },
              { label:"公募価格帯",  val: price },
              { label:"申込開始日",  val: formatDate(company.apply_start_date) },
              { label:"BB開始日",    val: formatDate(company.bb_start_date) },
            ].map(({ label, val }) => (
              <div key={label} style={{ borderRadius:"10px", padding:"8px 12px",
                backgroundColor:C.pale, border:`1px solid ${C.borderLight}` }}>
                <div style={{ fontSize:"10px", color:C.muted, fontWeight:"700",
                  marginBottom:"2px" }}>{label}</div>
                <div style={{ fontSize:"12px", color:C.deep, fontWeight:"900" }}>{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── AI要約 ── */}
        <div style={{ borderRadius:"16px", padding:"16px", marginBottom:"16px",
          backgroundColor:"white", border:`1px solid ${C.borderLight}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:"6px", marginBottom:"10px" }}>
            <Zap size={15} color={C.primary}/>
            <span style={{ fontWeight:"900", fontSize:"13px", color:C.deep }}>
              AI分析要約
            </span>
          </div>
          {isFree ? (
            <p style={{ fontSize:"13px", color:C.mid, lineHeight:"1.8", margin:0 }}>
              {aiLoading ? "AI分析中..." : (aiData?.summary ?? company.ai_summary ?? "要約は未登録です。")}
            </p>
          ) : (
            <div style={{ borderRadius:"10px", padding:"12px",
              backgroundColor:"#fffbeb", border:"1px solid #fde68a" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"6px",
                marginBottom:"6px" }}>
                <Lock size={13} color="#d97706"/>
                <span style={{ fontWeight:"700", fontSize:"11px", color:"#92400e" }}>
                  プレミアム会員または¥500の単品購入で全文閲覧できます
                </span>
              </div>
              <p style={{ fontSize:"11px", color:"#b45309", margin:0, lineHeight:"1.6" }}>
              {aiLoading ? "AI分析中..." : (aiData?.summary
  ? aiData.summary.slice(0, 40) + "… (続きはプレミアムで)"
  : "超短期・短期・長期の9軸スコアと詳細な分析レポートを閲覧できます。")}
              </p>
            </div>
          )}
        </div>

        {/* ── 9軸DeepDiveスコア ── */}
        <div style={{ borderRadius:"16px", overflow:"hidden", marginBottom:"16px",
          border:`1px solid ${C.border}` }}>

          {/* タブ */}
          <div style={{ display:"flex", backgroundColor:C.light,
            borderBottom:`1px solid ${C.border}` }}>
            {tabItems.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ flex:1, padding:"10px 4px", fontWeight:"900",
                  fontSize:"12px", border:"none", outline:"none", cursor:"pointer",
                  backgroundColor: tab === t.id ? "white" : "transparent",
                  color: tab === t.id ? t.color : C.muted,
                  borderBottom: tab === t.id ? `3px solid ${t.color}` : "3px solid transparent",
                  transition:"all 0.15s" }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* スコア軸 */}
          <div style={{ padding:"16px", backgroundColor:"white" }}>
            {isFree ? (
              <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
                {currentAxes.map(axis => {
                  const s = scores[axis.id] ?? 60;
                  const sl = scoreLabel(s);
                  return (
                    <div key={axis.id}>
                      <div style={{ display:"flex", alignItems:"center",
                        justifyContent:"space-between", marginBottom:"6px" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                          <span style={{ color:tabColor }}>{axis.icon}</span>
                          <div>
                            <div style={{ fontWeight:"900", fontSize:"13px", color:C.deep }}>
                              {axis.label}
                            </div>
                            <div style={{ fontSize:"10px", color:C.muted }}>{axis.desc}</div>
                          </div>
                        </div>
                        <div style={{ textAlign:"right", flexShrink:0, marginLeft:"12px" }}>
                          <span style={{ fontWeight:"900", fontSize:"22px",
                            color:sl.color, lineHeight:"1" }}>{sl.label}</span>
                          <span style={{ fontSize:"11px", color:C.muted,
                            marginLeft:"4px" }}>{s}</span>
                        </div>
                      </div>
                      <ScoreBar score={s} color={sl.color}/>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div>
                {/* スコアバー概覧（ロック状態でも見える） */}
                <div style={{ display:"flex", flexDirection:"column", gap:"10px",
                  marginBottom:"16px" }}>
                  {currentAxes.map(axis => {
                    const s = scores[axis.id] ?? 60;
                    const sl = scoreLabel(s);
                    return (
                      <div key={axis.id}>
                        <div style={{ display:"flex", alignItems:"center",
                          justifyContent:"space-between", marginBottom:"4px" }}>
                          <span style={{ fontWeight:"700", fontSize:"12px", color:C.muted }}>
                            {axis.label}
                          </span>
                          <span style={{ fontWeight:"900", fontSize:"16px",
                            color:sl.color }}>{sl.label}</span>
                        </div>
                        <div style={{ filter:"blur(1px)", opacity:0.5 }}>
                          <ScoreBar score={s} color={sl.color}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* ペイウォール */}
                <div style={{ borderRadius:"12px", padding:"16px", textAlign:"center",
                  backgroundColor:"#fffbeb", border:"2px solid #fde68a" }}>
                  <Lock size={24} color="#d97706" style={{ margin:"0 auto 8px" }}/>
                  <div style={{ fontWeight:"900", fontSize:"14px", color:"#92400e",
                    marginBottom:"6px" }}>
                    詳細スコアと解説を読むには
                  </div>
                  <p style={{ fontSize:"11px", color:"#b45309", margin:"0 0 12px",
                    lineHeight:"1.6" }}>
                    この銘柄は4番目以降のため、詳細レポートはプレミアム会員または<br/>
                    シングルレポート（¥500）でご覧いただけます。
                  </p>
                  <div style={{ display:"flex", gap:"8px", justifyContent:"center",
                    flexWrap:"wrap" }}>
                    <a href="/#purchase" style={{ fontWeight:"900", fontSize:"12px",
                      borderRadius:"10px", padding:"8px 20px",
                      backgroundColor:"#d97706", color:"white", textDecoration:"none" }}>
                      ¥500 でこの銘柄を読む
                    </a>
                    <a href="/#purchase" style={{ fontWeight:"900", fontSize:"12px",
                      borderRadius:"10px", padding:"8px 20px",
                      backgroundColor:C.primary, color:C.deep, textDecoration:"none" }}>
                      プレミアムプランを見る
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── ロックアップカレンダー ── */}
        {(company.lockup_90_date || company.lockup_180_date) && (
          <div style={{ borderRadius:"16px", overflow:"hidden", marginBottom:"16px",
            border:`1px solid ${C.border}` }}>
            <div style={{ padding:"10px 16px", backgroundColor:C.light,
              borderBottom:`1px solid ${C.border}`, fontWeight:"900",
              fontSize:"12px", color:C.mid }}>
              📅 ロックアップ解除スケジュール
            </div>
            <div style={{ backgroundColor:"white" }}>
              {[
                { label:"90日解除",  date:company.lockup_90_date,  color:"#ef4444",
                  note:"大量売り圧力に注意" },
                { label:"180日解除", date:company.lockup_180_date, color:"#f59e0b",
                  note:"追加の需給悪化リスク" },
              ].filter(r => r.date).map((r, i) => (
                <div key={r.label} style={{ padding:"12px 16px",
                  borderBottom: i === 0 ? `1px solid ${C.borderLight}` : "none",
                  display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                    <div style={{ width:"10px", height:"10px", borderRadius:"50%",
                      backgroundColor:r.color, flexShrink:0 }}/>
                    <div>
                      <div style={{ fontWeight:"900", fontSize:"13px",
                        color:C.deep }}>{r.label}</div>
                      <div style={{ fontSize:"10px", color:C.muted }}>{r.note}</div>
                    </div>
                  </div>
                  <div style={{ fontWeight:"900", fontSize:"13px", color:C.deep }}>
                    {formatDate(r.date!)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 前後ナビゲーション ── */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px",
          marginBottom:"16px" }}>
          {prevCompany ? (
            <a href={`/analysis/${prevCompany.id}`}
              style={{ borderRadius:"12px", padding:"10px 12px",
                backgroundColor:"white", border:`1px solid ${C.borderLight}`,
                textDecoration:"none", display:"flex", alignItems:"center", gap:"6px" }}>
              <ChevronLeft size={14} color={C.muted}/>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:"9px", color:C.muted, fontWeight:"700" }}>前の銘柄</div>
                <div style={{ fontSize:"12px", color:C.deep, fontWeight:"900",
                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {prevCompany.name}
                </div>
              </div>
            </a>
          ) : <div/>}
          {nextCompany ? (
            <a href={`/analysis/${nextCompany.id}`}
              style={{ borderRadius:"12px", padding:"10px 12px",
                backgroundColor:"white", border:`1px solid ${C.borderLight}`,
                textDecoration:"none", display:"flex", alignItems:"center",
                justifyContent:"flex-end", gap:"6px", textAlign:"right" }}>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:"9px", color:C.muted, fontWeight:"700" }}>次の銘柄</div>
                <div style={{ fontSize:"12px", color:C.deep, fontWeight:"900",
                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {nextCompany.name}
                </div>
              </div>
              <ChevronRight size={14} color={C.muted}/>
            </a>
          ) : <div/>}
        </div>

        {/* ── 参考文献・出典 ── */}
        <div style={{ borderRadius:"12px", padding:"16px", marginBottom:"16px",
          backgroundColor:"#f0fafa", border:"1px solid #b3e8ea" }}>
          <p style={{ fontSize:"12px", fontWeight:"900", color:"#082b2e",
            marginBottom:"12px" }}>📚 参考文献・出典</p>
          <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
            {company.source_url && (
              <a href={company.source_url} target="_blank" rel="noopener noreferrer"
                style={{ fontSize:"11px", color:"#2a7a7e", textDecoration:"none",
                  display:"flex", alignItems:"center", gap:"4px" }}>
                🔗 データ取得元
              </a>
            )}
            <a href={`https://www.jpx.co.jp/listing/stocks/new/index.html`}
              target="_blank" rel="noopener noreferrer"
              style={{ fontSize:"11px", color:"#2a7a7e", textDecoration:"none" }}>
              📋 東証・新規上場情報
            </a>
            <a href={`https://disclosure2.edinet-fsa.go.jp/WZEK0040.aspx?S1=${company.ticker}`}
              target="_blank" rel="noopener noreferrer"
              style={{ fontSize:"11px", color:"#2a7a7e", textDecoration:"none" }}>
              📄 EDINET（有価証券届出書）
            </a>
            <a href={`https://minkabu.jp/stock/${company.ticker}`}
              target="_blank" rel="noopener noreferrer"
              style={{ fontSize:"11px", color:"#2a7a7e", textDecoration:"none" }}>
              📈 みんかぶ
            </a>
            <a href={`https://ipokabu.net/`}
              target="_blank" rel="noopener noreferrer"
              style={{ fontSize:"11px", color:"#2a7a7e", textDecoration:"none" }}>
              🗓 IPO株
            </a>
          </div>
          <p style={{ fontSize:"10px", color:"#6b8e8e", marginTop:"12px", lineHeight:"1.6" }}>
            ※本レポートのAI分析はClaude（Anthropic）とGemini（Google）による自動生成です。
            投資判断はご自身の責任で行ってください。
          </p>
        </div>{/* ── 注意事項 ── */}
        <div style={{ borderRadius:"12px", padding:"12px 14px", marginBottom:"16px",
          backgroundColor:"#fffbeb", border:"1px solid #fde68a",
          display:"flex", alignItems:"flex-start", gap:"8px" }}>
          <AlertCircle size={13} color="#d97706" style={{ flexShrink:0, marginTop:"1px" }}/>
          <p style={{ fontSize:"10px", color:"#92400e", margin:0, lineHeight:"1.7" }}>
            本レポートのスコア・分析はAIによる試算値であり、投資勧誘ではありません。
            最終的な投資判断はご自身の責任のもとで行ってください。
          </p>
        </div>

        <div style={{ textAlign:"center", paddingBottom:"24px" }}>
          <p style={{ fontSize:"9px", color:C.borderLight }}>
            © 2025 大手町調査室九課
          </p>
        </div>
      </div>
    </div>
  );
}
