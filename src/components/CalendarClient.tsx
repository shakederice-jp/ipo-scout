"use client";

import { useState } from "react";
import {
  BarChart2, ChevronLeft, ChevronRight, Calendar,
  Star, Lock, Bell, Building2, Zap, AlertCircle, X, Info
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
const CIRCLED = ["①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩",
                 "⑪","⑫","⑬","⑭","⑮","⑯","⑰","⑱","⑲","⑳"];

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
  listing_date: string | null;
  apply_start_date: string | null;
  bb_start_date: string | null;
  lockup_90_date: string | null;
  lockup_180_date: string | null;
  status: string;
  highlight: boolean;
  ai_score: number | null;
  ai_summary: string | null;
}

// ── ユーティリティ ──────────────────────────────────────────────────────────
const JP_DOW = ["日","月","火","水","木","金","土"];

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth()+1}月${d.getDate()}日（${JP_DOW[d.getDay()]}）`;
}

function isToday(dateStr: string): boolean {
  return dateStr === formatDateKey(new Date());
}

function groupByDate(companies: IpoCompany[]): Record<string, IpoCompany[]> {
  const map: Record<string, IpoCompany[]> = {};
  companies.forEach(c => {
    if (!c.listing_date) return;
    const key = c.listing_date.slice(0, 10);
    if (!map[key]) map[key] = [];
    map[key].push(c);
  });
  return map;
}

function buildOrderMap(companies: IpoCompany[]): Record<string, number> {
  const sorted = [...companies]
    .filter(c => c.listing_date)
    .sort((a, b) => (a.listing_date! > b.listing_date! ? 1 : -1));
  const map: Record<string, number> = {};
  sorted.forEach((c, i) => { map[c.id] = i + 1; });
  return map;
}

function getWeeksInMonth(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  const weeks: { date: Date; inMonth: boolean }[][] = [];
  const cur = new Date(first);
  const dow = (cur.getDay() + 6) % 7;
  cur.setDate(cur.getDate() - dow);
  while (cur <= last) {
    const week = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(cur);
      d.setDate(d.getDate() + i);
      week.push({ date: d, inMonth: d.getMonth() === month });
    }
    weeks.push(week);
    cur.setDate(cur.getDate() + 7);
  }
  return weeks;
}

// ── ステータスバッジ ──────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; bg: string; dot: string }> = {
    "上場日":             { color:"#b91c1c", bg:"#fef2f2", dot:"#ef4444" },
    "公募申込中":         { color:"#b45309", bg:"#fffbeb", dot:"#f59e0b" },
    "ブックビルディング": { color:C.muted,   bg:C.light,   dot:C.primary },
    "上場済み":           { color:"#64748b", bg:"#f1f5f9", dot:"#94a3b8" },
  };
  const s = map[status] ?? map["ブックビルディング"];
  return (
    <span className="inline-flex items-center gap-1 rounded-full font-bold"
      style={{ fontSize:"10px", padding:"2px 8px", backgroundColor:s.bg, color:s.color }}>
      <span style={{ width:"6px", height:"6px", borderRadius:"50%",
        backgroundColor:s.dot, flexShrink:0, display:"inline-block" }}/>
      {status}
    </span>
  );
}

// ── 月俯瞰カレンダー ───────────────────────────────────────────────────────
function MiniCalendar({
  year, month, iposByDate, orderMap, onDateClick,
}: {
  year: number; month: number;
  iposByDate: Record<string, IpoCompany[]>;
  orderMap: Record<string, number>;
  onDateClick: (dateStr: string) => void;
}) {
  const weeks = getWeeksInMonth(year, month);
  return (
    <div className="rounded-xl overflow-hidden" style={{ border:`1px solid ${C.border}` }}>
      <div className="grid" style={{ gridTemplateColumns:"repeat(5,1fr)" }}>
        {["月","火","水","木","金"].map(d => (
          <div key={d} className="text-center py-1 font-black"
            style={{ fontSize:"10px", backgroundColor:C.light, color:C.mid,
              borderBottom:`1px solid ${C.border}` }}>{d}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid" style={{ gridTemplateColumns:"repeat(5,1fr)",
          borderBottom:`1px solid ${C.borderLight}` }}>
          {week.map((day, di) => {
            const key = formatDateKey(day.date);
            const ipos = iposByDate[key] ?? [];
            const today = isToday(key);
            return (
              <button key={di}
                onClick={() => ipos.length > 0 && onDateClick(key)}
                className="flex flex-col items-center justify-start transition-all"
                style={{ padding:"3px 2px 5px", minHeight:"44px",
                  backgroundColor: today ? C.light : !day.inMonth ? "#fafefe" : "white",
                  borderRight: di < 4 ? `1px solid ${C.borderLight}` : "none",
                  cursor: ipos.length > 0 ? "pointer" : "default" }}>
                <span className="font-bold leading-none mb-1"
                  style={{ fontSize:"11px",
                    color: !day.inMonth ? C.borderLight : today ? C.deep : C.muted,
                    fontWeight: today ? "900" : "600" }}>
                  {day.date.getDate()}
                </span>
                {ipos.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-0.5">
                    {ipos.map(ipo => (
                      <span key={ipo.id} style={{ fontSize:"13px", lineHeight:"1",
                        color: (orderMap[ipo.id] ?? 99) <= FREE_LIMIT ? C.deep : "#c4b5fd",
                        fontWeight:"900",
                        textShadow: (orderMap[ipo.id] ?? 99) <= FREE_LIMIT
                          ? "0 0 1px rgba(8,43,46,0.3)"
                          : "none" }}>
                        {CIRCLED[(orderMap[ipo.id] ?? 1) - 1] ?? "●"}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── 銘柄詳細パネル ─────────────────────────────────────────────────────────
function DetailPanel({ ipo, order, onClose }: {
  ipo: IpoCompany; order: number; onClose: () => void;
}) {
  const isFree = order <= FREE_LIMIT;
  const price = ipo.price_range_min && ipo.price_range_max
    ? `¥${ipo.price_range_min.toLocaleString()}〜${ipo.price_range_max.toLocaleString()}`
    : "公募価格未定";

  return (
    <div className="flex flex-col h-full bg-white">
      {/* ヘッダー */}
      <div className="px-4 py-3 flex-none"
        style={{ backgroundColor:C.primary, borderBottom:`1px solid ${C.primaryDark}` }}>
        <div className="flex items-start gap-2 justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
              <span className="font-black text-2xl leading-none" style={{ color:C.deep }}>
                {CIRCLED[order-1] ?? `(${order})`}
              </span>
              <span className="font-bold rounded-full px-2 py-0.5"
                style={{ fontSize:"9px",
                  backgroundColor: isFree ? "#dcfce7" : "#fef3c7",
                  color: isFree ? "#15803d" : "#92400e" }}>
                {isFree ? "無料" : "有料"}
              </span>
              {ipo.exchange && (
                <span className="font-black rounded-md px-1.5 py-0.5"
                  style={{ fontSize:"10px", backgroundColor:C.light, color:C.mid }}>
                  {ipo.exchange}
                </span>
              )}
              {ipo.highlight && <Star size={12} style={{ color:"#d97706" }} fill="#d97706"/>}
            </div>
            <h3 className="font-black leading-tight" style={{ fontSize:"15px", color:C.deep }}>
              {ipo.name}
            </h3>
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <StatusBadge status={ipo.status}/>
              <span className="font-black" style={{ fontSize:"12px", color:C.deep }}>{price}</span>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 shrink-0"
            style={{ backgroundColor:"rgba(8,43,46,0.15)", color:C.deep }}>
            <X size={15}/>
          </button>
        </div>
      </div>

      {/* ボディ */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* 基本情報 */}
        <div className="space-y-2">
          {[
            { label:"業種",   val: ipo.sector,      icon: <Building2 size={12}/> },
            { label:"業態",   val: ipo.biz_type,    icon: <Zap size={12}/> },
            { label:"上場日", val: ipo.listing_date ? formatDateLabel(ipo.listing_date) : "未定",
              icon: <Calendar size={12}/> },
          ].filter(r => r.val).map(({ label, val, icon }) => (
            <div key={label} className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{ backgroundColor:C.pale, border:`1px solid ${C.borderLight}` }}>
              <span style={{ color:C.primary, flexShrink:0 }}>{icon}</span>
              <span className="font-bold shrink-0" style={{ fontSize:"11px", color:C.muted, width:"55px" }}>
                {label}
              </span>
              <span className="font-black" style={{ fontSize:"12px", color:C.deep }}>{val}</span>
            </div>
          ))}
        </div>

        {/* AI分析要約（無料は全文、有料はロック） */}
        {isFree ? (
          <div className="rounded-xl p-3"
            style={{ backgroundColor:C.pale, border:`1px solid ${C.borderLight}` }}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Zap size={11} style={{ color:C.primary }}/>
              <span className="font-bold" style={{ fontSize:"10px", color:C.muted }}>AI分析要約</span>
            </div>
            <p style={{ fontSize:"12px", color:C.mid, lineHeight:"1.7" }}>
              {ipo.ai_summary ?? "要約は未登録です。"}
            </p>
          </div>
        ) : (
          <div className="rounded-xl p-3"
            style={{ backgroundColor:"#fffbeb", border:"1px solid #fde68a" }}>
            <div className="flex items-center gap-1.5 mb-1">
              <Lock size={11} style={{ color:"#d97706" }}/>
              <span className="font-bold" style={{ fontSize:"10px", color:"#92400e" }}>
                AI分析要約（¥500またはプレミアムプランで閲覧）
              </span>
            </div>
            <p style={{ fontSize:"11px", color:"#b45309" }}>
              超短期・短期・長期の9軸スコア、経営陣プロファイル、競合比較を含む完全レポートを閲覧できます。
            </p>
          </div>
        )}

        {/* ロックアップ日程 */}
        {(ipo.lockup_90_date || ipo.lockup_180_date) && (
          <div className="rounded-xl overflow-hidden"
            style={{ border:`1px solid ${C.border}` }}>
            <div className="px-3 py-2 font-black"
              style={{ fontSize:"10px", backgroundColor:C.light, color:C.mid,
                borderBottom:`1px solid ${C.border}` }}>
              📅 ロックアップ解除スケジュール
            </div>
            <div className="divide-y" style={{ borderColor:C.borderLight }}>
              {[
                { label:"90日解除", date: ipo.lockup_90_date,  color:"#ef4444" },
                { label:"180日解除", date: ipo.lockup_180_date, color:"#f59e0b" },
              ].filter(r => r.date).map(r => (
                <div key={r.label} className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span style={{ width:"8px", height:"8px", borderRadius:"50%",
                      backgroundColor:r.color, display:"inline-block" }}/>
                    <span className="font-bold" style={{ fontSize:"11px", color:C.deep }}>
                      {r.label}
                    </span>
                  </div>
                  <span style={{ fontSize:"11px", color:C.muted }}>
                    {formatDateLabel(r.date!)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 通知設定ボタン */}
        <button className="w-full rounded-xl py-2.5 font-black flex items-center justify-center gap-2"
          style={{ backgroundColor:C.pale, color:C.mid,
            border:`1px solid ${C.border}`, fontSize:"12px" }}>
          <Bell size={14}/>この銘柄の通知を設定する（前週金曜18時配信）
        </button>

        {/* 注意 */}
        <div className="rounded-xl p-3 flex items-start gap-2"
          style={{ backgroundColor:"#fffbeb", border:"1px solid #fde68a" }}>
          <AlertCircle size={12} className="shrink-0 mt-0.5" style={{ color:"#d97706" }}/>
          <p style={{ fontSize:"10px", color:"#92400e", lineHeight:"1.6" }}>
            表示データはAI試算値です。最終的な投資判断はご自身で行ってください。
          </p>
        </div>
      </div>
    </div>
  );
}

// ── メインコンポーネント ───────────────────────────────────────────────────
export function CalendarClient({ companies, error }: {
  companies: IpoCompany[];
  error: string | null;
}) {
  // 現在表示する年月（デフォルト：今月）
  const now = new Date();
  const [year, setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedIpo, setSelectedIpo]   = useState<IpoCompany | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<number>(1);

  const monthName = new Date(year, month, 1).toLocaleDateString("ja-JP", {
    year:"numeric", month:"long",
  });

  // 表示月でフィルタリング
  const monthCompanies = companies.filter(c => {
    if (!c.listing_date) return false;
    const d = new Date(c.listing_date);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const iposByDate  = groupByDate(monthCompanies);
  const orderMap    = buildOrderMap(companies); // 全体でのランキング
  const sortedDates = Object.keys(iposByDate).sort();

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const handleDateClick = (dateStr: string) => {
    const el = document.getElementById(`date-${dateStr}`);
    if (el) el.scrollIntoView({ behavior:"smooth", block:"start" });
  };

  const handleIpoClick = (ipo: IpoCompany) => {
    setSelectedIpo(ipo);
    setSelectedOrder(orderMap[ipo.id] ?? 1);
  };

  const totalListed = monthCompanies.filter(c => c.status === "上場日").length;
  const totalBB     = monthCompanies.filter(c => c.status === "ブックビルディング").length;
  const totalApply  = monthCompanies.filter(c => c.status === "公募申込中").length;

  return (
    <div className="min-h-screen" style={{ backgroundColor:C.pale,
      fontFamily:"'Noto Sans JP','Hiragino Kaku Gothic ProN',sans-serif" }}>

      {/* ナビバー */}
      <nav className="sticky top-0 z-40 px-4 py-2.5 flex items-center justify-between border-b"
        style={{ backgroundColor:C.mid, borderColor:C.muted }}>
        <div className="flex items-center gap-2.5">
          <div className="rounded p-1.5" style={{ backgroundColor:C.primary }}>
            <BarChart2 size={14} className="text-white"/>
          </div>
          <div>
            <div className="hidden sm:block font-black text-sm leading-tight" style={{ color:"white" }}>
              IPO企業情報AI分析レポート
            </div>
            <div className="block sm:hidden font-black leading-tight"
              style={{ fontSize:"11px", color:"white" }}>
              IPO企業情報AI分析レポート
            </div>
            <div className="font-semibold" style={{ fontSize:"9px", color:"#4aafb3" }}>
              担当：大手町調査室九課
            </div>
          </div>
        </div>
        <a href="/" className="font-bold rounded-full px-3 py-1 transition-all"
          style={{ fontSize:"10px", backgroundColor:"#134f53", color:C.primary }}>
          ← トップへ
        </a>
      </nav>

      <div className="lg:flex lg:h-[calc(100vh-48px)]">

        {/* 左サイドバー（PC） */}
        <aside className="hidden lg:flex lg:flex-col flex-none border-r overflow-y-auto"
          style={{ width:"220px", backgroundColor:C.pale, borderColor:C.border }}>
          <div className="p-3 space-y-4">
            {/* 凡例 */}
            <div>
              <p className="font-black text-[10px] tracking-widest mb-2" style={{ color:C.muted }}>
                ステータス凡例
              </p>
              {[
                { label:"上場日",             bg:"#fef2f2", dot:"#ef4444", color:"#b91c1c" },
                { label:"公募申込中",         bg:"#fffbeb", dot:"#f59e0b", color:"#b45309" },
                { label:"ブックビルディング", bg:C.light,   dot:C.primary, color:C.muted },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-2 rounded-lg px-2 py-1.5 mb-1.5"
                  style={{ backgroundColor:s.bg }}>
                  <span style={{ width:"8px", height:"8px", borderRadius:"50%",
                    backgroundColor:s.dot, display:"inline-block", flexShrink:0 }}/>
                  <span className="font-bold" style={{ fontSize:"11px", color:s.color }}>
                    {s.label}
                  </span>
                </div>
              ))}
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                  style={{ backgroundColor:"#dcfce7", border:"1px solid #bbf7d0" }}>
                  <span className="font-black" style={{ fontSize:"12px", color:C.mid }}>①②③</span>
                  <span className="font-bold" style={{ fontSize:"10px", color:"#15803d" }}>無料で全文閲覧</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                  style={{ backgroundColor:"#fef3c7", border:"1px solid #fde68a" }}>
                  <Lock size={10} style={{ color:"#d97706", flexShrink:0 }}/>
                  <span className="font-bold" style={{ fontSize:"10px", color:"#92400e" }}>④〜 有料会員</span>
                </div>
              </div>
            </div>

            {/* 月俯瞰カレンダー */}
            <div>
              <p className="font-black text-[10px] tracking-widest mb-2" style={{ color:C.muted }}>
                月俯瞰カレンダー
              </p>
              <MiniCalendar
                year={year} month={month}
                iposByDate={iposByDate} orderMap={orderMap}
                onDateClick={handleDateClick}
              />
            </div>

            {/* 通知タイミング */}
            <div className="rounded-xl p-2.5" style={{ backgroundColor:C.light, border:`1px solid ${C.border}` }}>
              <div className="font-black mb-1 flex items-center gap-1"
                style={{ fontSize:"10px", color:C.mid }}>
                <Bell size={11}/>通知タイミング
              </div>
              <p style={{ fontSize:"9px", color:C.muted, lineHeight:"1.6" }}>
                各イベントの<span className="font-bold" style={{ color:C.deep }}>前週金曜日18:00</span>に統一配信
              </p>
            </div>
          </div>
        </aside>

        {/* メインエリア */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

          {/* コントロールバー */}
          <div className="px-4 py-2.5 flex items-center gap-3 flex-wrap flex-none"
            style={{ backgroundColor:"white", borderBottom:`1px solid ${C.borderLight}` }}>
            <div className="flex items-center gap-2">
              <button onClick={prevMonth}
                className="rounded-full p-1.5 transition-all"
                style={{ backgroundColor:C.light, color:C.deep }}>
                <ChevronLeft size={16}/>
              </button>
              <h1 className="font-black" style={{ fontSize:"17px", color:C.deep, minWidth:"130px", textAlign:"center" }}>
                {monthName}
              </h1>
              <button onClick={nextMonth}
                className="rounded-full p-1.5 transition-all"
                style={{ backgroundColor:C.light, color:C.deep }}>
                <ChevronRight size={16}/>
              </button>
            </div>
            <div className="flex gap-2 ml-auto flex-wrap">
              {[
                { label:"上場日", count:totalListed, dot:"#ef4444" },
                { label:"BB中",   count:totalBB,     dot:C.primary },
                { label:"申込中", count:totalApply,  dot:"#f59e0b" },
                { label:"合計",   count:monthCompanies.length, dot:C.mid },
              ].map(({ label, count, dot }) => (
                <div key={label} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1"
                  style={{ backgroundColor:C.pale, border:`1px solid ${C.borderLight}` }}>
                  <span style={{ width:"7px", height:"7px", borderRadius:"50%",
                    backgroundColor:dot, display:"inline-block" }}/>
                  <span className="font-black" style={{ fontSize:"14px", color:C.deep }}>{count}</span>
                  <span className="font-bold" style={{ fontSize:"10px", color:C.muted }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* モバイル：月俯瞰カレンダー */}
          <div className="lg:hidden px-4 py-3 border-b" style={{ backgroundColor:C.pale, borderColor:C.borderLight }}>
            <div className="flex items-center gap-2 mb-2">
              <Calendar size={11} style={{ color:C.muted }}/>
              <p className="font-black text-[10px] tracking-widest" style={{ color:C.muted }}>月俯瞰カレンダー</p>
            </div>
            <MiniCalendar
              year={year} month={month}
              iposByDate={iposByDate} orderMap={orderMap}
              onDateClick={handleDateClick}
            />
            <div className="mt-2 flex items-center gap-1.5 rounded-lg px-2.5 py-2"
              style={{ backgroundColor:C.light, border:`1px solid ${C.border}` }}>
              <Bell size={11} style={{ color:C.primary, flexShrink:0 }}/>
              <p style={{ fontSize:"9px", color:C.muted }}>
                通知：各イベントの<span className="font-bold" style={{ color:C.deep }}>前週金曜日18:00</span>に統一配信
              </p>
            </div>
          </div>

          {/* スケジュールリスト */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {error && (
              <div className="rounded-2xl p-4 mb-4"
                style={{ backgroundColor:"#fef2f2", border:"1px solid #fecaca" }}>
                <p className="font-black text-sm" style={{ color:"#b91c1c" }}>データ取得エラー</p>
                <p className="text-sm mt-1" style={{ color:"#991b1b" }}>{error}</p>
              </div>
            )}

            {sortedDates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Calendar size={48} style={{ color:C.border }}/>
                <p className="font-bold" style={{ color:C.muted, fontSize:"14px" }}>
                  この月のIPO予定はありません
                </p>
              </div>
            ) : (
              sortedDates.map(dateStr => {
                const ipos = iposByDate[dateStr];
                const today = isToday(dateStr);
                const hasListing = ipos.some(c => c.status === "上場日");
                return (
                  <div key={dateStr} id={`date-${dateStr}`} className="mb-6">
                    {/* 日付ヘッダー */}
                    <div className="flex items-center gap-3 mb-2.5">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl font-black"
                        style={{
                          backgroundColor: today ? C.primary : hasListing ? "#fef2f2" : C.pale,
                          border: `2px solid ${today ? C.primaryDark : hasListing ? "#fecaca" : C.border}`,
                          color: today ? C.deep : hasListing ? "#b91c1c" : C.mid,
                          fontSize:"14px",
                        }}>
                        {today && (
                          <span style={{ fontSize:"9px", fontWeight:"900",
                            letterSpacing:"0.05em", marginRight:"4px" }}>TODAY</span>
                        )}
                        {formatDateLabel(dateStr)}
                        <span className="ml-2 font-black rounded-full text-white px-2 py-0 leading-tight"
                          style={{ fontSize:"10px",
                            backgroundColor: today ? C.deep : hasListing ? "#ef4444" : C.muted }}>
                          {ipos.length}社
                        </span>
                      </div>
                      <div className="flex-1 h-px" style={{ backgroundColor:C.borderLight }}/>
                    </div>

                    {/* 銘柄カード */}
                    <div className="space-y-2 pl-1">
                      {ipos.map(ipo => {
                        const order = orderMap[ipo.id] ?? 99;
                        const isFree = order <= FREE_LIMIT;
                        const isSelected = selectedIpo?.id === ipo.id;
                        return (
                          <button key={ipo.id}
                            onClick={() => handleIpoClick(ipo)}
                            className="w-full text-left rounded-xl transition-all"
                            style={{
                              backgroundColor: isSelected ? C.light : ipo.highlight ? "#fffef5" : "white",
                              border: `2px solid ${isSelected ? C.primary : ipo.highlight ? "#fde68a" : C.borderLight}`,
                              padding:"10px 12px",
                            }}>
                            <div className="flex items-center gap-3">
                              <div className="shrink-0 flex flex-col items-center gap-1">
                                <span className="font-black leading-none"
                                  style={{ fontSize:"22px",
                                    color: isFree ? C.mid : "#9ca3af", lineHeight:"1" }}>
                                  {CIRCLED[order-1] ?? `(${order})`}
                                </span>
                                <span className="font-bold rounded-full px-2 py-0.5"
                                  style={{ fontSize:"9px",
                                    backgroundColor: isFree ? "#dcfce7" : "#fef3c7",
                                    color: isFree ? "#15803d" : "#92400e" }}>
                                  {isFree ? "無料" : "有料"}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  {ipo.highlight && <Star size={12} style={{ color:"#d97706" }} fill="#d97706"/>}
                                  <span className="font-black leading-tight"
                                    style={{ fontSize:"15px", color:C.deep }}>{ipo.name}</span>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <StatusBadge status={ipo.status}/>
                                  {ipo.sector && (
                                    <span style={{ fontSize:"11px", color:C.muted }}>{ipo.sector}</span>
                                  )}
                                  {ipo.exchange && (
                                    <span className="font-bold rounded-md px-1.5 py-0.5"
                                      style={{ fontSize:"10px", backgroundColor:C.light, color:C.mid }}>
                                      {ipo.exchange}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="shrink-0">
                                <ChevronLeft size={14} style={{ color:C.border, transform:"rotate(180deg)" }}/>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
            <div className="pb-4 text-center pt-2">
              <p style={{ fontSize:"9px", color:C.borderLight }}>
                © 2025 大手町調査室九課 — 表示データはAI試算・デモデータです。投資勧誘ではありません。
              </p>
            </div>
          </div>
        </div>

        {/* 右パネル（PC：詳細表示） */}
        <div className="hidden lg:flex lg:flex-col flex-none border-l overflow-hidden transition-all"
          style={{ width: selectedIpo ? "320px" : "0px",
            borderColor:C.border, transition:"width 0.25s cubic-bezier(.4,0,.2,1)" }}>
          {selectedIpo && (
            <DetailPanel
              ipo={selectedIpo}
              order={selectedOrder}
              onClose={() => setSelectedIpo(null)}
            />
          )}
        </div>

        {/* モバイル：下スライドイン */}
        {selectedIpo && (
          <div className="lg:hidden fixed inset-0 z-50"
            style={{ backgroundColor:"rgba(8,43,46,0.5)" }}
            onClick={e => { if (e.target === e.currentTarget) setSelectedIpo(null); }}>
            <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl overflow-hidden flex flex-col"
              style={{ backgroundColor:"white", maxHeight:"80vh",
                border:`2px solid ${C.primary}` }}>
              <DetailPanel
                ipo={selectedIpo}
                order={selectedOrder}
                onClose={() => setSelectedIpo(null)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}