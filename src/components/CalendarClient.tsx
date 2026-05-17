"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Company = {
  id: string;
  name: string;
  ticker?: string;
  sector?: string;
  exchange?: string;
  listing_date: string;
  summary?: string;
  is_free?: boolean;
};

const CIRCLE = ["①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩","⑪","⑫","⑬","⑭","⑮","⑯","⑰","⑱","⑲","⑳"];
const WEEKDAYS = ["日","朁E,"火","水","木","釁E,"圁E];

const C = {
  bg:     "#f0fafa",
  nav:    "#0e5c6b",
  teal:   "#66c3c6",
  tealLt: "#e0f7f8",
  text:   "#1a3a3a",
  muted:  "#6b8e8e",
  border: "#b3e8ea",
  white:  "#ffffff",
};

export default function CalendarClient() {
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const itemRefs = useRef<{ [id: string]: HTMLDivElement | null }>({});

  useEffect(() => {
    fetch("/api/companies")
      .then(r => r.json())
      .then(data => {
        setCompanies(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const sorted = [...companies].sort(
    (a, b) => new Date(a.listing_date).getTime() - new Date(b.listing_date).getTime()
  );
  const indexMap: { [id: string]: number } = {};
  sorted.forEach((c, i) => { indexMap[c.id] = i; });

  const byDay: { [day: number]: Company[] } = {};
  sorted.forEach(c => {
    if (!c.listing_date) return;
    const d = new Date(c.listing_date);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(c);
    }
  });

  const firstDow    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => month === 0  ? (setYear(y=>y-1), setMonth(11)) : setMonth(m=>m-1);
  const nextMonth = () => month === 11 ? (setYear(y=>y+1), setMonth(0))  : setMonth(m=>m+1);

  const jumpTo = (id: string) => {
    const el = itemRefs.current[id];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setHighlighted(id);
    setTimeout(() => setHighlighted(null), 1800);
  };

  return (
    <div style={{ minHeight:"100vh", backgroundColor:C.bg, fontFamily:"'Noto Sans JP',sans-serif" }}>
      <nav style={{ backgroundColor:C.nav, padding:"12px 16px", display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ fontSize:18 }}>📊</span>
        <div>
          <div style={{ color:"white", fontWeight:900, fontSize:13 }}>IPO企業惁E��AI刁E��レポ�EチE/div>
          <div style={{ color:C.teal, fontSize:10 }}>拁E��：大手町調査室九課</div>
        </div>
      </nav>

      <div style={{ maxWidth:720, margin:"0 auto", padding:"16px 12px" }}>
        <div style={{ backgroundColor:C.white, borderRadius:16, border:`1px solid ${C.border}`, marginBottom:20, overflow:"hidden" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 16px", borderBottom:`1px solid ${C.border}` }}>
            <button onClick={prevMonth} style={{ background:"none", border:"none", cursor:"pointer", padding:6, color:C.nav, borderRadius:8, display:"flex", alignItems:"center" }}>
              <ChevronLeft size={20} />
            </button>
            <span style={{ fontWeight:900, fontSize:16, color:C.nav }}>{year}年{month+1}朁E/span>
            <button onClick={nextMonth} style={{ background:"none", border:"none", cursor:"pointer", padding:6, color:C.nav, borderRadius:8, display:"flex", alignItems:"center" }}>
              <ChevronRight size={20} />
            </button>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", padding:"0 8px" }}>
            {WEEKDAYS.map((w, i) => (
              <div key={w} style={{ textAlign:"center", fontSize:11, fontWeight:700, padding:"8px 0", color: i===0?"#e53e3e": i===6?"#3182ce": C.muted }}>{w}</div>
            ))}
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", padding:"0 8px 12px", gap:2 }}>
            {cells.map((day, idx) => {
              if (!day) return <div key={`e-${idx}`} style={{ minHeight:52 }} />;
              const dow  = (firstDow + day - 1) % 7;
              const ipos = byDay[day] || [];
              const isToday = day===today.getDate() && month===today.getMonth() && year===today.getFullYear();
              return (
                <div key={day} style={{ minHeight:52, padding:"4px 2px", borderRadius:8, backgroundColor: isToday ? C.tealLt : "transparent", border: isToday ? `1px solid ${C.teal}` : "1px solid transparent" }}>
                  <div style={{ textAlign:"center", fontSize:11, fontWeight: isToday?700:400, color: dow===0?"#e53e3e": dow===6?"#3182ce": C.text, marginBottom:2 }}>{day}</div>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                    {ipos.map(c => (
                      <button key={c.id} onClick={() => jumpTo(c.id)} title={c.name}
                        style={{ background:"none", border:"none", cursor:"pointer", padding:0, lineHeight:1, fontSize:16, color:C.teal, transition:"transform .1s" }}
                        onMouseEnter={e=>(e.currentTarget.style.transform="scale(1.25)")}
                        onMouseLeave={e=>(e.currentTarget.style.transform="scale(1)")}>
                        {CIRCLE[indexMap[c.id]] ?? `(${indexMap[c.id]+1})`}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ padding:"8px 16px 12px", borderTop:`1px solid ${C.border}`, fontSize:11, color:C.muted, textAlign:"center" }}>
            カレンダーの番号をタチE�E ↁE下�E銘柄へジャンチE
          </div>
        </div>

        <div style={{ marginBottom:12, display:"flex", alignItems:"center", gap:8 }}>
          <h2 style={{ fontSize:15, fontWeight:900, color:C.nav, margin:0 }}>📋 IPO予定企業一覧</h2>
          <span style={{ fontSize:11, color:C.muted }}>{loading ? "読み込み中..." : `�E�E{sorted.length}社�E�`}</span>
        </div>

        <div style={{ backgroundColor:C.tealLt, border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 14px", marginBottom:16, fontSize:12, color:"#2a7a7e" }}>
          ☑︁E毎月、日付頁E��<strong>最初�E3銘柄の刁E��レポ�Eト�E完�E無斁E/strong>。特定銘柁E��けをピックアチE�Eして読む場合�E¥500です、E
        </div>

        {loading && <div style={{ textAlign:"center", padding:"40px 0", color:C.muted, fontSize:13 }}>チE�Eタを読み込み中...</div>}

        {!loading && sorted.map((company, i) => {
          const d = new Date(company.listing_date);
          const weekStr = "日月火水木金土"[d.getDay()];
          const dateStr = `${d.getMonth()+1}朁E{d.getDate()}日�E�E{weekStr}�E�`;
          const isFree = company.is_free ?? i < 3;
          const isHL = highlighted === company.id;
          return (
            <div key={company.id} ref={el => { itemRefs.current[company.id] = el; }}
              style={{ backgroundColor:C.white, borderRadius:14, border: isHL ? `2px solid ${C.teal}` : `1px solid ${C.border}`, marginBottom:12, overflow:"hidden", transition:"border .3s, box-shadow .3s", boxShadow: isHL ? `0 0 0 4px ${C.tealLt}` : "none" }}>
              <div style={{ padding:"12px 16px", display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:22, color:C.teal, lineHeight:1 }}>{CIRCLE[i] ?? `(${i+1})`}</span>
                  <div>
                    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                      <span style={{ fontSize:10, fontWeight:700, padding:"2px 6px", borderRadius:4, backgroundColor: isFree?"#dcfce7":"#fef3c7", color: isFree?"#15803d":"#92400e" }}>{isFree ? "無斁E : "有料"}</span>
                      <span style={{ fontSize:16, fontWeight:900, color:C.text }}>{company.name}</span>
                    </div>
                    <div style={{ fontSize:11, color:C.muted }}>{[company.exchange, company.sector, company.ticker].filter(Boolean).join("・")}</div>
                  </div>
                </div>
                <div style={{ textAlign:"right", flexShrink:0, marginLeft:8 }}>
                  <div style={{ fontSize:10, color:C.muted }}>上場想定日</div>
                  <div style={{ fontSize:12, fontWeight:700, color:C.nav }}>{dateStr}</div>
                </div>
              </div>
              {company.summary && <div style={{ padding:"0 16px 12px", fontSize:12, color:"#4a5568", lineHeight:1.8 }}>{company.summary}</div>}
              <div style={{ padding:"10px 16px", borderTop:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontSize:11, color:C.muted }}>⚡ AI刁E��要紁E/span>
                <a href={`/analysis/${company.id}`} style={{ padding:"7px 18px", borderRadius:8, fontSize:12, fontWeight:700, textDecoration:"none", backgroundColor: isFree ? C.teal : "#f59e0b", color:"white" }}>
                  {isFree ? "刁E��レポ�Eトを見る ↁE : "¥500で読む ↁE}
                </a>
              </div>
            </div>
          );
        })}

        {!loading && sorted.length === 0 && (
          <div style={{ textAlign:"center", padding:"40px 0", fontSize:13, color:C.muted }}>現在登録されてぁE��銘柄はありません</div>
        )}
      </div>
    </div>
  );
}
