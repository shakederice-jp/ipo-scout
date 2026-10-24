"use client";

// 2026/10/24新設(束C・⑥): トップページのカレンダーの「週間表示」。
// 月曜〜金曜を上から下へ1日1行で並べ、その日の「上場・BB開始・申込開始・ロックアップ解除・経済指標・自分のメモ」を出す。
// 土日に予定がある場合だけ、下に1行で添える。無料会員にも見える(会員登録の入口にもなるため)。
// データは CalendarClient が持っている銘柄一覧をそのまま使う。メモ・経済指標は、この週にかかる月ぶんを取得する。
// 日付のあつかい: 画面を開いている人の時計(日本時間を想定)の「日付」だけを使い、時刻は扱わない。
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Company = {
  id: string;
  name: string;
  ticker?: string | null;
  listing_date: string;
  listing_date_confirmed?: boolean | null;
  bb_start_date?: string | null;
  apply_start_date?: string | null;
  lockup_90_date?: string | null;
  lockup_180_date?: string | null;
};
type Note = { note_date: string; memo: string | null; pnl: number | null };
type Ev = { id: string; event_date: string; event_type: string; label: string | null };

const C = { nav: "#0e5c6b", teal: "#66c3c6", tealLt: "#e0f7f8", text: "#1a3a3a", muted: "#6b8e8e", border: "#b3e8ea", white: "#ffffff" };
const DOW = ["日", "月", "火", "水", "木", "金", "土"];
const EVENT_STYLE: Record<string, { emoji: string; color: string; bg: string }> = {
  FOMC: { emoji: "🇺🇸", color: "#b91c1c", bg: "#fef2f2" },
  日銀: { emoji: "🇯🇵", color: "#c2410c", bg: "#fff7ed" },
  米雇用統計: { emoji: "🇺🇸", color: "#1d4ed8", bg: "#eff6ff" },
  CPI: { emoji: "📈", color: "#15803d", bg: "#f0fdf4" },
};
const KIND_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  listing: { label: "上場", color: "#0d4f52", bg: "#e0f7f8" },
  bb: { label: "BB開始", color: "#0369a1", bg: "#eff6ff" },
  apply: { label: "申込開始", color: "#b45309", bg: "#fffbeb" },
  lock90: { label: "ロックアップ90日", color: "#b91c1c", bg: "#fef2f2" },
  lock180: { label: "ロックアップ180日", color: "#b91c1c", bg: "#fef2f2" },
};

const pad = (n: number) => String(n).padStart(2, "0");
const toStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const mondayOf = (d: Date) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
};
const addDays = (d: Date, n: number) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
};

type Item = { key: string; kind: keyof typeof KIND_STYLE; company: Company; tentative: boolean };

export default function WeeklyCalendarView({
  companies,
  level,
  anchorDate,
  notes,
  onLoadNotes,
  onOpenMemo,
  onBackToMonth,
}: {
  companies: Company[];
  level: string;
  anchorDate: string | null;
  notes: Record<string, Note>;
  onLoadNotes: (months: string[]) => void;
  onOpenMemo: (dateStr: string) => void;
  onBackToMonth: () => void;
}) {
  const todayStr = toStr(new Date());
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(anchorDate ? parse(anchorDate) : new Date()));
  const [events, setEvents] = useState<Ev[]>([]);

  // 月間表示から日付を指定して来たときは、その日を含む週に切り替える
  useEffect(() => {
    if (anchorDate) setWeekStart(mondayOf(parse(anchorDate)));
  }, [anchorDate]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekKey = toStr(weekStart);

  // この週にかかる月(最大2つ)の経済指標を取得し、メモは親(CalendarClient)に読み込んでもらう
  useEffect(() => {
    const months = Array.from(new Set(days.map((d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`)));
    onLoadNotes(months);
    let alive = true;
    (async () => {
      const eAll: Ev[] = [];
      await Promise.all(
        months.map(async (m) => {
          try {
            const r = await fetch(`/api/economic-events?month=${m}`);
            const j = await r.json();
            if (Array.isArray(j)) eAll.push(...j);
          } catch {}
        })
      );
      if (alive) setEvents(eAll);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekKey]);

  // 日付ごとの予定
  const itemsByDate = useMemo(() => {
    const m: Record<string, Item[]> = {};
    const add = (date: string | null | undefined, kind: Item["kind"], c: Company, tentative = false) => {
      if (!date) return;
      const k = date.slice(0, 10);
      (m[k] ??= []).push({ key: `${c.id}-${kind}`, kind, company: c, tentative });
    };
    for (const c of companies) {
      add(c.listing_date, "listing", c, !c.listing_date_confirmed);
      add(c.bb_start_date, "bb", c);
      add(c.apply_start_date, "apply", c);
      add(c.lockup_90_date, "lock90", c);
      add(c.lockup_180_date, "lock180", c);
    }
    return m;
  }, [companies]);

  const eventsByDate = useMemo(() => {
    const m: Record<string, Ev[]> = {};
    for (const e of events) (m[e.event_date.slice(0, 10)] ??= []).push(e);
    return m;
  }, [events]);

  const href = (c: Company) => (level === "beginner" ? `/analysis/${c.id}/beginner` : `/analysis/${c.id}`);
  const fmtShort = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  const fri = days[4];
  const rangeLabel = `${weekStart.getFullYear()}年${weekStart.getMonth() + 1}月${weekStart.getDate()}日（月）〜${fri.getMonth() + 1}月${fri.getDate()}日（金）`;
  const isThisWeek = toStr(mondayOf(new Date())) === weekKey;

  const DayContent = ({ d }: { d: Date }) => {
    const ds = toStr(d);
    const items = itemsByDate[ds] ?? [];
    const evs = eventsByDate[ds] ?? [];
    const note = notes[ds];
    const hasMemo = !!note && (!!note.memo || note.pnl != null);
    const empty = items.length === 0 && evs.length === 0 && !hasMemo;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        {evs.map((ev) => {
          const s = EVENT_STYLE[ev.event_type] ?? { emoji: "📅", color: C.nav, bg: C.tealLt };
          return (
            <div key={ev.id} style={{ fontSize: 12, fontWeight: 700, color: s.color, backgroundColor: s.bg, borderRadius: 6, padding: "4px 8px", alignSelf: "flex-start" }}>
              {s.emoji} {ev.label ?? ev.event_type}
            </div>
          );
        })}
        {items.map((it) => {
          const k = KIND_STYLE[it.kind];
          return (
            <a key={it.key} href={href(it.company)} style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "2px 6px", textDecoration: "none", minWidth: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: k.color, backgroundColor: k.bg, borderRadius: 4, padding: "2px 6px", flexShrink: 0, whiteSpace: "nowrap" }}>
                {k.label}{it.tentative ? "（予定）" : ""}
              </span>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.text, minWidth: 0 }}>
                {it.company.name}
                {it.company.ticker ? <span style={{ fontWeight: 500, color: C.muted }}>（{it.company.ticker}）</span> : null}
              </span>
            </a>
          );
        })}
        {hasMemo && (
          <div style={{ fontSize: 12, color: "#15803d", backgroundColor: "#f0fdf4", borderRadius: 6, padding: "4px 8px", alignSelf: "flex-start", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            📝 {note?.memo ?? ""}
            {note?.pnl != null ? <strong style={{ marginLeft: 6, color: note.pnl >= 0 ? "#15803d" : "#b91c1c" }}>{note.pnl >= 0 ? "▲+" : "▼"}{note.pnl.toLocaleString()}円</strong> : null}
          </div>
        )}
        {empty && <div style={{ fontSize: 12, color: "#a8bcbc" }}>予定なし</div>}
      </div>
    );
  };

  const weekend = [days[5], days[6]].filter((d) => {
    const ds = toStr(d);
    return (itemsByDate[ds]?.length ?? 0) > 0 || (eventsByDate[ds]?.length ?? 0) > 0;
  });

  return (
    <div style={{ backgroundColor: C.white, borderRadius: 16, border: `1px solid ${C.border}`, marginBottom: 20, overflow: "hidden" }}>
      {/* 週の移動 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 12px", borderBottom: `1px solid ${C.border}`, gap: 8 }}>
        <button onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="前の週" style={{ background: "none", border: "none", cursor: "pointer", padding: 6, color: C.nav, display: "flex", alignItems: "center" }}>
          <ChevronLeft size={20} />
        </button>
        <div style={{ textAlign: "center", minWidth: 0 }}>
          <div style={{ fontWeight: 900, fontSize: 14, color: C.nav, lineHeight: 1.4 }}>{rangeLabel}</div>
          {!isThisWeek && (
            <button onClick={() => setWeekStart(mondayOf(new Date()))} style={{ marginTop: 2, background: "none", border: "none", cursor: "pointer", color: C.muted, textDecoration: "underline", fontSize: 11 }}>
              今週に戻る
            </button>
          )}
        </div>
        <button onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="次の週" style={{ background: "none", border: "none", cursor: "pointer", padding: 6, color: C.nav, display: "flex", alignItems: "center" }}>
          <ChevronRight size={20} />
        </button>
      </div>

      {/* 月〜金 */}
      <div>
        {days.slice(0, 5).map((d) => {
          const ds = toStr(d);
          const isToday = ds === todayStr;
          return (
            <div key={ds} style={{ display: "grid", gridTemplateColumns: "58px 1fr auto", gap: 10, alignItems: "flex-start", padding: "12px 12px", borderBottom: `1px solid ${C.border}`, backgroundColor: isToday ? C.tealLt : "transparent" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: C.nav, lineHeight: 1.2 }}>{fmtShort(d)}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>（{DOW[d.getDay()]}）</div>
                {isToday && <div style={{ marginTop: 2, fontSize: 9, fontWeight: 900, color: "white", backgroundColor: C.teal, borderRadius: 4, padding: "1px 4px" }}>今日</div>}
              </div>
              <DayContent d={d} />
              <button onClick={() => onOpenMemo(ds)} title="この日のメモ・損益を記録" style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer", fontSize: 11, color: C.nav, padding: "3px 7px", whiteSpace: "nowrap" }}>
                ＋メモ
              </button>
            </div>
          );
        })}
      </div>

      {/* 土日に予定がある場合だけ */}
      {weekend.length > 0 && (
        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, backgroundColor: "#f8fafc" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6 }}>土日の予定</div>
          {weekend.map((d) => (
            <div key={toStr(d)} style={{ display: "grid", gridTemplateColumns: "58px 1fr", gap: 10, marginBottom: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: d.getDay() === 0 ? "#e53e3e" : "#3182ce", textAlign: "center" }}>{fmtShort(d)}（{DOW[d.getDay()]}）</div>
              <DayContent d={d} />
            </div>
          ))}
        </div>
      )}

      {/* 案内 */}
      <div style={{ padding: "10px 14px 14px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 8 }}>
          <a href="/mypage#weekly-slides" style={{ fontSize: 12, fontWeight: 700, color: C.nav, textDecoration: "none", border: `1.5px solid ${C.teal}`, borderRadius: 20, padding: "6px 14px" }}>
            📄 この週のスライドを読む（C 総合プラン）
          </a>
          <a href="/mypage#calendar-feed" style={{ fontSize: 12, fontWeight: 700, color: C.nav, textDecoration: "none", border: `1.5px solid ${C.teal}`, borderRadius: 20, padding: "6px 14px" }}>
            🗓️ 予定を自動でカレンダーに登録（C 総合プラン）
          </a>
        </div>
        <div style={{ fontSize: 10, color: C.muted, textAlign: "center", lineHeight: 1.7 }}>
          銘柄名をタップ → 分析ページ｜「＋メモ」→ メモ・損益を記録｜日程は変更されることがあります
        </div>
        <div style={{ textAlign: "center", marginTop: 8 }}>
          <button onClick={onBackToMonth} style={{ background: "none", border: "none", cursor: "pointer", color: C.nav, fontSize: 12, fontWeight: 700, textDecoration: "underline" }}>
            月間カレンダーに戻る
          </button>
        </div>
      </div>
    </div>
  );
}
