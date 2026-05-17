"use client";

import { useState, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Company = {
  id: string;
  name: string;
  ticker?: string;
  sector?: string;
  exchange?: string;
  ipo_date: string;
  summary?: string;
  score?: number;
  is_free?: boolean;
};

const CIRCLE = ["①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩","⑪","⑫","⑬","⑭","⑮","⑯","⑰","⑱","⑲","⑳"];
const WEEKDAYS = ["日","月","火","水","木","金","土"];

const C = {
  bg:      "#f0fafa",
  nav:     "#0e5c6b",
  teal:    "#66c3c6",
  tealLt:  "#e0f7f8",
  text:    "#1a3a3a",
  muted:   "#6b8e8e",
  border:  "#b3e8ea",
  white:   "#ffffff",
};

export default function CalendarClient({ companies }: { companies: Company[] }) {
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed

  // ref map for scroll
  const itemRefs = useRef<{ [id: string]: HTMLDivElement | null }>({});
  const [highlighted, setHighlighted] = useState<string | null>(null);

  // 日付順にソート & 通し番号付与
  const sorted = [...companies].sort(
    (a, b) => new Date(a.ipo_date).getTime() - new Date(b.ipo_date).getTime()
  );
  const indexMap: { [id: string]: number } = {};
  sorted.forEach((c, i) => { indexMap[c.id] = i; });

  // 今月に絞った date -> companies[] マップ
  const byDay: { [day: number]: Company[] } = {};
  sorted.forEach(c => {
    if (!c.ipo_date) return;
    const d = new Date(c.ipo_date);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(c);
    }
  });

  // カレンダーグリッド用セル
  const firstDow   = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // 6行に揃える
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => month === 0  ? (setYear(y=>y-1), setMonth(11))  : setMonth(m=>m-1);
  const nextMonth = () => month === 11 ? (setYear(y=>y+1), setMonth(0))   : setMonth(m=>m+1);

  const jumpTo = (id: string) => {
    const el = itemRefs.current[id];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setHighlighted(id);
    setTimeout(() => setHighlighted(null), 1800);
  };

  return (
    <div style={{ minHeight:"100vh", backgroundColor:C.bg,
      fontFamily:"'Noto Sans JP',sans-serif" }}>

      {/* ── ナビバー ── */}
      <nav style={{ backgroundColor:C.nav, padding:"12px 16px",
        display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ fontSize:18 }}>📊</span>
        <div>
          <div style={{ color:"white", fontWeight:900, fontSize:13 }}>
            IPO企業情報AI分析レポート
          </div>
          <div style={{ color:C.teal, fontSize:10 }}>担当：大手町調査室九課</div>
        </div>
      </nav>

      <div style={{ maxWidth:720, margin:"0 auto", padding:"16px 12px" }}>

        {/* ══════════════════════════════
            月カレンダー
        ══════════════════════════════ */}
        <div style={{ backgroundColor:C.white, borderRadius:16,
          border:`1px solid ${C.border}`, marginBottom:20, overflow:"hidden" }}>

          {/* 月ナビ */}
          <div style={{ display:"flex", alignItems:"center",
            justifyContent:"space-between", padding:"14px 16px",
            borderBottom:`1px solid ${C.border}` }}>
            <button onClick={prevMonth} style={{ background:"none", border:"none",
              cursor:"pointer", padding:6, color:C.nav, borderRadius:8,
              display:"flex", alignItems:"center" }}>
              <ChevronLeft size={20} />
            </button>
            <span style={{ fontWeight:900, fontSize:16, color:C.nav }}>
              {year}年{month+1}月
            </span>
            <button onClick={nextMonth} style={{ background:"none", border:"none",
              cursor:"pointer", padding:6, color:C.nav, borderRadius:8,
              display:"flex", alignItems:"center" }}>
              <ChevronRight size={20} />
            </button>
          </div>

          {/* 曜日ヘッダー */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)",
            padding:"0 8px" }}>
            {WEEKDAYS.map((w, i) => (
              <div key={w} style={{ textAlign:"center", fontSize:11, fontWeight:700,
                padding:"8px 0",
                color: i===0?"#e53e3e": i===6?"#3182ce": C.muted }}>
                {w}
              </div>
            ))}
          </div>

          {/* 日付セル */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)",
            padding:"0 8px 12px", gap:2 }}>
            {cells.map((day, idx) => {
              if (!day) return <div key={`e-${idx}`} style={{ minHeight:52 }} />;
              const dow  = (firstDow + day - 1) % 7;
              const ipos = byDay[day] || [];
              const isToday = day===today.getDate() &&
                              month===today.getMonth() &&
                              year===today.getFullYear();
              return (
                <div key={day} style={{ minHeight:52, padding:"4px 2px",
                  borderRadius:8,
                  backgroundColor: isToday ? C.tealLt : "transparent",
                  border: isToday ? `1px solid ${C.teal}` : "1px solid transparent" }}>
                  {/* 日付数字 */}
                  <div style={{ textAlign:"center", fontSize:11,
                    fontWeight: isToday?700:400,
                    color: dow===0?"#e53e3e": dow===6?"#3182ce": C.text,
                    marginBottom:2 }}>
                    {day}
                  </div>
                  {/* 丸数字バッジ */}
                  <div style={{ display:"flex", flexDirection:"column",
                    alignItems:"center", gap:2 }}>
                    {ipos.map(c => {
                      const num = indexMap[c.id];
                      return (
                        <button key={c.id} onClick={() => jumpTo(c.id)}
                          title={c.name}
                          style={{ background:"none", border:"none",
                            cursor:"pointer", padding:0, lineHeight:1,
                            fontSize:16, color:C.teal,
                            transition:"transform .1s" }}
                          onMouseEnter={e=>(e.currentTarget.style.transform="scale(1.25)")}
                          onMouseLeave={e=>(e.currentTarget.style.transform="scale(1)")}>
                          {CIRCLE[num] ?? `(${num+1})`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ヒント */}
          <div style={{ padding:"8px 16px 12px", borderTop:`1px solid ${C.border}`,
            fontSize:11, color:C.muted, textAlign:"center" }}>
            カレンダーの番号をタップ → 下の銘柄へジャンプ
          </div>
        </div>

        {/* ══════════════════════════════
            銘柄リスト
        ══════════════════════════════ */}
        <div style={{ marginBottom:12, display:"flex", alignItems:"center", gap:8 }}>
          <h2 style={{ fontSize:15, fontWeight:900, color:C.nav, margin:0 }}>
            📋 IPO予定企業一覧
          </h2>
          <span style={{ fontSize:11, color:C.muted }}>（{sorted.length}社）</span>
        </div>

        {/* 無料案内バナー */}
        <div style={{ backgroundColor:C.tealLt, border:`1px solid ${C.border}`,
          borderRadius:10, padding:"10px 14px", marginBottom:16,
          fontSize:12, color:"#2a7a7e" }}>
          ☑️ 毎月、日付順で<strong>最初の3銘柄の分析レポートは完全無料</strong>。
          特定銘柄だけをピックアップして読む場合は¥500です。
        </div>

        {sorted.map((company, i) => {
          const d       = new Date(company.ipo_date);
          const weekStr = "日月火水木金土"[d.getDay()];
          const dateStr = `${d.getMonth()+1}月${d.getDate()}日（${weekStr}）`;
          const isFree  = company.is_free ?? i < 3;
          const isHL    = highlighted === company.id;

          return (
            <div key={company.id}
              ref={el => { itemRefs.current[company.id] = el; }}
              style={{ backgroundColor:C.white, borderRadius:14,
                border: isHL ? `2px solid ${C.teal}` : `1px solid ${C.border}`,
                marginBottom:12, overflow:"hidden",
                transition:"border .3s, box-shadow .3s",
                boxShadow: isHL ? `0 0 0 4px ${C.tealLt}` : "none" }}>

              {/* カードヘッダー */}
              <div style={{ padding:"12px 16px", display:"flex",
                alignItems:"flex-start", justifyContent:"space-between" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  {/* 丸数字 */}
                  <span style={{ fontSize:22, color:C.teal, lineHeight:1 }}>
                    {CIRCLE[i] ?? `(${i+1})`}
                  </span>
                  <div>
                    <div style={{ display:"flex", alignItems:"center",
                      gap:6, marginBottom:2 }}>
                      {/* 無料/有料バッジ */}
                      <span style={{ fontSize:10, fontWeight:700,
                        padding:"2px 6px", borderRadius:4,
                        backgroundColor: isFree?"#dcfce7":"#fef3c7",
                        color: isFree?"#15803d":"#92400e" }}>
                        {isFree ? "無料" : "有料"}
                      </span>
                      <span style={{ fontSize:16, fontWeight:900, color:C.text }}>
                        {company.name}
                      </span>
                    </div>
                    <div style={{ fontSize:11, color:C.muted }}>
                      {[company.exchange, company.sector, company.ticker]
                        .filter(Boolean).join("・")}
                    </div>
                  </div>
                </div>

                {/* 上場日 */}
                <div style={{ textAlign:"right", flexShrink:0, marginLeft:8 }}>
                  <div style={{ fontSize:10, color:C.muted }}>上場想定日</div>
                  <div style={{ fontSize:12, fontWeight:700, color:C.nav }}>
                    {dateStr}
                  </div>
                </div>
              </div>

              {/* AI要約 */}
              {company.summary && (
                <div style={{ padding:"0 16px 12px", fontSize:12,
                  color:"#4a5568", lineHeight:1.8 }}>
                  {company.summary}
                </div>
              )}

              {/* フッターアクション */}
              <div style={{ padding:"10px 16px", borderTop:`1px solid ${C.border}`,
                display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontSize:11, color:C.muted }}>⚡ AI分析要約</span>
                <a href={`/analysis/${company.id}`}
                  style={{ padding:"7px 18px", borderRadius:8, fontSize:12,
                    fontWeight:700, textDecoration:"none", cursor:"pointer",
                    backgroundColor: isFree ? C.teal : "#f59e0b",
                    color:"white" }}>
                  {isFree ? "分析レポートを見る →" : "¥500で読む →"}
                </a>
              </div>
            </div>
          );
        })}

        {sorted.length === 0 && (
          <div style={{ textAlign:"center", padding:"40px 0",
            fontSize:13, color:C.muted }}>
            現在登録されている銘柄はありません
          </div>
        )}
      </div>
    </div>
  );
}