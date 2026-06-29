"use client";

import { useState, useEffect, useRef } from "react";
import { useApp } from "@/contexts/AppContext";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

type Company = {
  id: string;
  name: string;
  ticker?: string;
  sector?: string;
  exchange?: string;
  listing_date: string;
  ai_summary?: string;
  is_free?: boolean;
};

type CalendarNote = {
  id?: string;
  note_date: string;
  memo: string | null;
  pnl: number | null;
};

type EconomicEvent = {
  id: string;
  event_date: string;
  event_type: string;
  label: string | null;
};

const EVENT_STYLE: Record<string, { emoji: string; color: string; bg: string }> = {
  FOMC: { emoji: "🇺🇸", color: "#b91c1c", bg: "#fef2f2" },
  日銀:  { emoji: "🇯🇵", color: "#c2410c", bg: "#fff7ed" },
  米雇用統計: { emoji: "🇺🇸", color: "#1d4ed8", bg: "#eff6ff" },
  CPI:  { emoji: "📈", color: "#15803d", bg: "#f0fdf4" },
};

const CIRCLE   = ["①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩","⑪","⑫","⑬","⑭","⑮","⑯","⑰","⑱","⑲","⑳"];
const WEEKDAYS = ["日","月","火","水","木","金","土"];

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
  const { lang } = useApp();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const itemRefs = useRef<{ [id: string]: HTMLDivElement | null }>({});

  // メモ・損益
  const [notes, setNotes]           = useState<Record<string, CalendarNote>>({});
  const [events, setEvents]         = useState<EconomicEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [memoInput, setMemoInput]   = useState("");
  const [pnlInput,  setPnlInput]    = useState("");
  const [saving, setSaving]         = useState(false);
  const [modalOpen, setModalOpen]   = useState(false);

  useEffect(() => {
    fetch("/api/companies")
      .then(r => r.json())
      .then(data => { setCompanies(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // 月が変わるたびにメモ・経済指標を取得
  useEffect(() => {
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

    fetch(`/api/calendar-notes?month=${monthKey}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          const map: Record<string, CalendarNote> = {};
          data.forEach((n: CalendarNote) => { map[n.note_date] = n; });
          setNotes(map);
        }
      })
      .catch(() => {});

    fetch(`/api/economic-events?month=${monthKey}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setEvents(data); })
      .catch(() => {});
  }, [year, month]);

  const toDateStr = (d: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const openModal = (dateStr: string) => {
    setSelectedDate(dateStr);
    const existing = notes[dateStr];
    setMemoInput(existing?.memo ?? "");
    setPnlInput(existing?.pnl != null ? String(existing.pnl) : "");
    setModalOpen(true);
  };
  const closeModal = () => { setModalOpen(false); setSelectedDate(null); };

  const handleSave = async () => {
    if (!selectedDate) return;
    setSaving(true);
    try {
      const res = await fetch("/api/calendar-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note_date: selectedDate,
          memo: memoInput || null,
          pnl: pnlInput !== "" ? parseInt(pnlInput) : null,
        }),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        if (!memoInput && pnlInput === "") {
          const n = { ...notes }; delete n[selectedDate]; setNotes(n);
        } else {
          setNotes(prev => ({
            ...prev,
            [selectedDate]: { note_date: selectedDate, memo: memoInput || null, pnl: pnlInput !== "" ? parseInt(pnlInput) : null },
          }));
        }
        closeModal();
      }
    } catch { alert("通信エラーが発生しました"); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!selectedDate) return;
    setSaving(true);
    try {
      await fetch("/api/calendar-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note_date: selectedDate, memo: null, pnl: null }),
      });
      const n = { ...notes }; delete n[selectedDate]; setNotes(n);
      closeModal();
    } catch {}
    setSaving(false);
  };

  // 経済指標を日付（数値）でグループ化
  const eventsByDay: Record<number, EconomicEvent[]> = {};
  events.forEach(e => {
    const day = parseInt(e.event_date.slice(8, 10));
    if (!eventsByDay[day]) eventsByDay[day] = [];
    eventsByDay[day].push(e);
  });

  const sorted = [...companies].sort(
    (a, b) => new Date(a.listing_date).getTime() - new Date(b.listing_date).getTime()
  );

  const monthIndexMap: { [id: string]: number } = {};
  const monthCounter: { [monthKey: string]: number } = {};
  sorted.forEach(c => {
    const mk = c.listing_date?.slice(0, 7) ?? "unknown";
    monthCounter[mk] = (monthCounter[mk] ?? 0) + 1;
    monthIndexMap[c.id] = monthCounter[mk] - 1;
  });

  const currentMonthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthSorted = sorted.filter(c => c.listing_date?.startsWith(currentMonthKey));

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

      {/* ── メモ入力モーダル ── */}
      {modalOpen && selectedDate && (
        <div
          style={{ position:"fixed", inset:0, backgroundColor:"rgba(0,0,0,0.4)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
          onClick={closeModal}
        >
          <div
            style={{ backgroundColor:C.white, borderRadius:16, padding:24, width:"100%", maxWidth:400, boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <span style={{ fontWeight:900, fontSize:15, color:C.nav }}>
                📝 {selectedDate.slice(0,4)}年{parseInt(selectedDate.slice(5,7))}月{parseInt(selectedDate.slice(8,10))}日
              </span>
              <button onClick={closeModal} style={{ background:"none", border:"none", cursor:"pointer", color:C.muted }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:11, fontWeight:700, color:C.nav, display:"block", marginBottom:4 }}>メモ（自由記述）</label>
              <textarea
                value={memoInput}
                onChange={e => setMemoInput(e.target.value)}
                placeholder="気づいたこと、投資メモなど自由に書けます"
                rows={4}
                style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, resize:"vertical", boxSizing:"border-box", fontFamily:"inherit" }}
              />
            </div>

            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:11, fontWeight:700, color:C.nav, display:"block", marginBottom:4 }}>損益（円）※任意</label>
              <input
                type="number"
                value={pnlInput}
                onChange={e => setPnlInput(e.target.value)}
                placeholder="例：5000 または -3000"
                style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, boxSizing:"border-box" }}
              />
              {pnlInput !== "" && !isNaN(parseInt(pnlInput)) && (
                <div style={{ marginTop:4, fontSize:12, fontWeight:700, color: parseInt(pnlInput) >= 0 ? "#15803d" : "#b91c1c" }}>
                  {parseInt(pnlInput) >= 0 ? "▲ +" : "▼ "}{parseInt(pnlInput).toLocaleString()}円
                </div>
              )}
            </div>

            <div style={{ display:"flex", gap:8 }}>
              {notes[selectedDate] && (
                <button onClick={handleDelete} disabled={saving}
                  style={{ flex:1, padding:"10px", backgroundColor:"#fef2f2", color:"#b91c1c", border:"1px solid #fecaca", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:13 }}>
                  削除
                </button>
              )}
              <button onClick={handleSave} disabled={saving}
                style={{ flex:2, padding:"10px", backgroundColor: saving ? "#94a3b8" : C.nav, color:"white", border:"none", borderRadius:8, cursor: saving ? "default" : "pointer", fontWeight:700, fontSize:13 }}>
                {saving ? "保存中..." : "保存する"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── メインレイアウト ── */}
      <div style={{ maxWidth:900, margin:"0 auto", padding:"16px 12px" }}>
        <div>
          <div style={{ backgroundColor:C.white, borderRadius:16, border:`1px solid ${C.border}`, marginBottom:20, overflow:"hidden" }}>

            {/* ヘッダー：月移動 */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 16px", borderBottom:`1px solid ${C.border}` }}>
              <button onClick={prevMonth} style={{ background:"none", border:"none", cursor:"pointer", padding:6, color:C.nav, borderRadius:8, display:"flex", alignItems:"center" }}>
                <ChevronLeft size={20} />
              </button>
              <span style={{ fontWeight:900, fontSize:16, color:C.nav }}>{year}年{month+1}月</span>
              <button onClick={nextMonth} style={{ background:"none", border:"none", cursor:"pointer", padding:6, color:C.nav, borderRadius:8, display:"flex", alignItems:"center" }}>
                <ChevronRight size={20} />
              </button>
            </div>

            {/* 曜日ヘッダー */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", padding:"0 8px" }}>
              {WEEKDAYS.map((w, i) => (
                <div key={w} style={{ textAlign:"center", fontSize:11, fontWeight:700, padding:"8px 0", color: i===0?"#e53e3e": i===6?"#3182ce": C.muted }}>{w}</div>
              ))}
            </div>

            {/* 日付グリッド */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", padding:"0 8px 12px", gap:2 }}>
              {cells.map((day, idx) => {
                if (!day) return <div key={`e-${idx}`} style={{ minHeight:60 }} />;
                const dow       = (firstDow + day - 1) % 7;
                const ipos      = byDay[day] || [];
                const dayEvents = eventsByDay[day] || [];
                const dateStr   = toDateStr(day);
                const note      = notes[dateStr];
                const hasMemo   = note && (note.memo || note.pnl != null);
                const pnlVal    = note?.pnl;
                const isToday   = day===today.getDate() && month===today.getMonth() && year===today.getFullYear();

                return (
                  <div key={day}
                    onClick={() => openModal(dateStr)}
                    style={{ minHeight:60, padding:"4px 2px", borderRadius:8, backgroundColor: isToday ? C.tealLt : "transparent", border: isToday ? `1px solid ${C.teal}` : "1px solid transparent", cursor:"pointer", transition:"background .15s" }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = isToday ? C.tealLt : "#f5fefe")}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = isToday ? C.tealLt : "transparent")}
                  >
                    {/* 日付 + メモ・損益インジケーター */}
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"0 2px", marginBottom:2 }}>
                      <span style={{ fontSize:11, fontWeight: isToday?700:400, color: dow===0?"#e53e3e": dow===6?"#3182ce": C.text }}>{day}</span>
                      <div style={{ display:"flex", gap:2, alignItems:"center" }}>
                        {hasMemo && <span style={{ fontSize:10 }}>📝</span>}
                        {pnlVal != null && (
                          <span style={{ fontSize:9, fontWeight:700, color: pnlVal >= 0 ? "#15803d" : "#b91c1c" }}>
                            {pnlVal >= 0 ? "▲" : "▼"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 経済指標バッジ */}
                    {dayEvents.map(ev => {
                      const s = EVENT_STYLE[ev.event_type] ?? { emoji:"📅", color:C.nav, bg:C.tealLt };
                      return (
                        <div key={ev.id} title={ev.label ?? ev.event_type}
                          style={{ fontSize:9, fontWeight:700, color:s.color, backgroundColor:s.bg, borderRadius:3, padding:"1px 3px", marginBottom:1, lineHeight:1.5, textAlign:"center" }}>
                          {s.emoji} {ev.event_type === "米雇用統計" ? "雇用統計" : ev.event_type}
                        </div>
                      );
                    })}

                    {/* IPO銘柄番号 */}
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:1 }}>
                      {ipos.map(c => (
                        <button key={c.id}
                          onClick={e => { e.stopPropagation(); jumpTo(c.id); }}
                          title={c.name}
                          style={{ background:"none", border:"none", cursor:"pointer", padding:0, lineHeight:1, fontSize:14, color:C.teal, transition:"transform .1s" }}
                          onMouseEnter={e=>(e.currentTarget.style.transform="scale(1.25)")}
                          onMouseLeave={e=>(e.currentTarget.style.transform="scale(1)")}>
                          {CIRCLE[monthIndexMap[c.id]] ?? `(${monthIndexMap[c.id]+1})`}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* フッター：凡例 */}
            <div style={{ padding:"8px 16px 12px", borderTop:`1px solid ${C.border}` }}>
              <div style={{ fontSize:10, color:C.muted, marginBottom:6, textAlign:"center" }}>
                日付をタップ → メモ・損益を記録｜番号をタップ → 銘柄へジャンプ
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:4, justifyContent:"center" }}>
                {Object.entries(EVENT_STYLE).map(([type, s]) => (
                  <span key={type} style={{ fontSize:10, color:s.color, backgroundColor:s.bg, borderRadius:4, padding:"2px 6px", fontWeight:700 }}>
                    {s.emoji} {type}
                  </span>
                ))}
                <span style={{ fontSize:10, color:"#15803d", backgroundColor:"#f0fdf4", borderRadius:4, padding:"2px 6px", fontWeight:700 }}>📝▲▼ メモ・損益</span>
              </div>
            </div>
          </div>
          </div>

{/* ── IPO一覧（カレンダー下） ── */}
{/* ── IPO一覧（カレンダー下） ── */}
<div style={{ marginTop:16 }}>
          <div style={{ marginBottom:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
              <h2 style={{ fontSize:15, fontWeight:900, color:C.nav, margin:0 }}>
                {lang === "ja" ? "📋 IPO予定企業一覧" : "Upcoming IPOs"}
              </h2>
              <span style={{ fontSize:11, color:C.muted }}>{loading ? (lang === "ja" ? "読み込み中..." : "Loading...") : `（${monthSorted.length}${lang === "en" ? " co." : "社"}）`}</span>
            </div>
            <a href="/guide" style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"6px 14px", backgroundColor:C.teal, borderRadius:20, textDecoration:"none", marginBottom:8 }}>
              <span style={{ fontSize:11, fontWeight:700, color:"white" }}>📖 このサイトの効果的な使い方</span>
              <span style={{ fontSize:11, color:"rgba(255,255,255,0.8)" }}>→</span>
            </a>
          </div>

          <div style={{ backgroundColor:"#e8f9f9", border:"1.5px solid #b3e8ea", borderRadius:12, padding:"12px 16px", marginBottom:16, display:"flex", alignItems:"flex-start", gap:10 }}>
            <span style={{ fontSize:18, flexShrink:0 }}>📋</span>
            <div>
              <div style={{ fontWeight:900, fontSize:13, color:"#082b2e", marginBottom:2 }}>
                {lang === "ja" ? "まず無料でお試しください" : "Try for Free First"}
              </div>
              <p style={{ fontSize:12, color:"#2a7a7e", lineHeight:1.7, margin:0 }}>
                {lang === "ja"
                  ? <>毎月、日付順で最初の<strong style={{ color:"#082b2e" }}>2銘柄の分析レポートは完全無料</strong>でご覧いただけます。特定銘柄だけをピックアップして読む場合は¥500です。また、すべてコミコミの<strong style={{ color:"#082b2e" }}>コンプリートパック</strong>もあります。</>
                  : <>The first <strong style={{ color:"#082b2e" }}>2 IPO reports each month are completely free</strong>. Single reports are ¥500. A <strong style={{ color:"#082b2e" }}>Complete Pack</strong> with all features is also available.</>
                }
              </p>
            </div>
          </div>

          {loading && <div style={{ textAlign:"center", padding:"40px 0", color:C.muted, fontSize:13 }}>データを読み込み中...</div>}

          {!loading && monthSorted.map((company, i) => {
            const d = new Date(company.listing_date);
            const weekStr = "日月火水木金土"[d.getDay()];
            const dateStr = `${d.getMonth()+1}月${d.getDate()}日（${weekStr}）`;
            const isFree = company.is_free ?? i < 2;
            const isHL = highlighted === company.id;
            return (
              <div key={company.id} ref={el => { itemRefs.current[company.id] = el; }}
                style={{ backgroundColor:C.white, borderRadius:14, border: isHL ? `2px solid ${C.teal}` : isFree ? `1px solid ${C.teal}` : `1px solid #fde68a`, marginBottom:12, overflow:"hidden", transition:"border .3s, box-shadow .3s", boxShadow: isHL ? `0 0 0 4px ${C.tealLt}` : "none" }}>
                <div style={{ padding:"12px 16px", display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:22, color:C.teal, lineHeight:1 }}>{CIRCLE[i] ?? `(${i+1})`}</span>
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                      <span style={{ fontSize:10, fontWeight:700, padding:"2px 6px", borderRadius:4, backgroundColor: isFree?"#dcfce7":"#fef3c7", color: isFree?"#15803d":"#92400e" }}>{isFree ? (lang === "ja" ? "無料" : "Free") : (lang === "ja" ? "有料" : "Paid")}</span>
                        <span style={{ fontSize:16, fontWeight:900, color:C.text }}>{company.name}</span>
                      </div>
                      <div style={{ fontSize:11, color:C.muted }}>{[company.exchange, company.sector, company.ticker].filter(Boolean).join("・")}</div>
                    </div>
                  </div>
                  <div style={{ textAlign:"right", flexShrink:0, marginLeft:8 }}>
                    {(() => {
                      const today2 = new Date(); today2.setHours(0,0,0,0);
                      const ld = new Date(company.listing_date); ld.setHours(0,0,0,0);
                      const diff = ld.getTime() - today2.getTime();
                      if (diff < 0) return (
                        <>
                          <div style={{ fontSize:10, fontWeight:700, color:"#64748b", backgroundColor:"#f1f5f9", borderRadius:4, padding:"1px 6px", marginBottom:2 }}>{lang === "ja" ? "上場済み" : "Listed"}</div>
                          <div style={{ fontSize:12, fontWeight:700, color:"#64748b" }}>{dateStr}</div>
                        </>
                      );
                      if (diff === 0) return (
                        <>
                          <div style={{ fontSize:10, fontWeight:700, color:"#b91c1c", backgroundColor:"#fef2f2", borderRadius:4, padding:"1px 6px", marginBottom:2 }}>{lang === "ja" ? "本日上場🎉" : "Listed Today🎉"}</div>
                          <div style={{ fontSize:12, fontWeight:700, color:"#b91c1c" }}>{dateStr}</div>
                        </>
                      );
                      return (
                        <>
                          <div style={{ fontSize:10, color:C.muted }}>{lang === "ja" ? "上場予定日" : "Listing Date"}</div>
                          <div style={{ fontSize:12, fontWeight:700, color:C.nav }}>{dateStr}</div>
                        </>
                      );
                    })()}
                  </div>
                </div>
                <div style={{ padding:"10px 16px 14px", borderTop:`1px solid ${C.border}` }}>
                  <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:8 }}>
                    <span style={{ fontSize:11, fontWeight:700, color:C.teal }}>⚡ AI分析要約</span>
                  </div>
                  {company.ai_summary ? (
                    <p style={{ fontSize:12, color:"#374151", lineHeight:1.9, margin:"0 0 12px" }}>
                      {company.ai_summary}
                    </p>
                  ) : (
                    <p style={{ fontSize:11, color:C.muted, lineHeight:1.7, margin:"0 0 12px", fontStyle:"italic" }}>
                      📄 目論見書が公表され次第、AIによる銘柄要約を掲載します。
                    </p>
                  )}
                  <div style={{ display:"flex", justifyContent:"flex-end" }}>
                  <a href={`/analysis/${company.id}`} style={{ padding:"7px 18px", borderRadius:8, fontSize:12, fontWeight:700, textDecoration:"none", backgroundColor: isFree ? C.teal : "#f59e0b", color:"white" }}>
                      {isFree ? (lang === "ja" ? "分析レポートを見る →" : "View Report →") : (lang === "ja" ? "¥500で読む →" : "Read for ¥500 →")}
                    </a>
                  </div>
                </div>
              </div>
            );
          })}

          {!loading && sorted.length === 0 && (
            <div style={{ textAlign:"center", padding:"40px 0", fontSize:13, color:C.muted }}>現在登録されている銘柄はありません</div>
          )}
        </div>
      </div>
    </div>
  );
}