// 2026/10/21改訂(週刊PDFスライド・第2版): スライド(横向き16:9)の描画。
// 方針: 「結論 → 根拠」の順。1枚の上に結論の一文を置き、その下に図・表で根拠を見せる。長い文章は載せない。
// ・サイトの配色(濃い緑・ミント系)・カードの形に合わせている。
// ・グラフ・図は、すべてコードで描く(AIには描かせない)。棒グラフはViewの幅、レーダー図・散布図はSVG。
// ・各スライドの下に「データ時点」と出典を入れる。1枚の中身が溢れても次のページに流れない(wrap=false)。
// ・日本語フォントは、サイトに置いてある NotoSansJP-Bold.ttf を使う(太字・通常とも同じファイル)。
import React from "react";
import { Document, Page, View, Text, Svg, Polygon, Line, Circle, Font, renderToBuffer } from "@react-pdf/renderer";
import { shortDate, jpDate, pctText } from "@/lib/jp-format";
import { BIN_LABELS } from "@/lib/weekly-slides-types";
import type { SlidesData, CompanyCard, CompStat, Tone } from "@/lib/weekly-slides-types";

const DARK = "#082b2e", MID = "#0d4f52", PRIMARY = "#66c3c6", SOFT = "#a0d4d6", LIGHT = "#e8f9f9", BORDER = "#b3e8ea", BG = "#f4fbfc", TTEXT = "#2a7a7e";
const GREEN = "#15803d", RED = "#dc2626", AMBER = "#d97706", GRAY = "#64748b", BLUE = "#0369a1", PURPLE = "#7c3aed";
const W = 960, H = 540;
const FONT = "NotoSansJP";
const BODY_W = 896;

const GRADE_COLOR: Record<string, string> = { A: "#15803d", B: "#0369a1", C: "#d97706", D: "#dc2626", E: "#7c3aed" };
const GRADE_LABEL: Record<string, string> = { A: "強気", B: "やや強気", C: "中立", D: "やや弱気", E: "弱気" };
const TONE_COLOR: Record<Tone, string> = { good: GREEN, neutral: BLUE, warn: AMBER };

// ───────── 日本語の折り返し(自前) ─────────
// react-pdf の自動折り返しは、日本語の長い語で行末にハイフンが付いたり、列からはみ出したりするため、
// 1行ずつ自分で区切って描く。禁則(行頭に来てはいけない文字・行末に来てはいけない文字)も簡易的に守る。
function cw(ch: string): number {
  const c = ch.codePointAt(0)!;
  if (c < 0x80) {
    if (ch === " ") return 0.3;
    if (/[A-Z0-9]/.test(ch)) return 0.64;
    if (/[ilI.,:;'!|()\[\]]/.test(ch)) return 0.32;
    return 0.58;
  }
  if (c >= 0xff61 && c <= 0xff9f) return 0.5;
  return 1;
}
const NO_START = new Set("、。，．・：；？！゛゜ー）」』】〕〉》｝ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ%,.:;!?)]}".split(""));
const NO_END = new Set("（「『【〔〈《｛([{".split(""));

export function wrapJa(text: string, widthPt: number, size: number, shrinkEm = 0): string[] {
  const out: string[] = [];
  const maxEm = (widthPt * 0.985) / size - shrinkEm;
  for (const para of String(text ?? "").split("\n")) {
    const chars = Array.from(para);
    let line = "", w = 0;
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i], cwid = cw(ch);
      if (w + cwid > maxEm && line) {
        if (NO_START.has(ch) && w + cwid <= maxEm + 1.2) { line += ch; w += cwid; continue; } // 句読点は、はみ出して行末に置く
        const arr = Array.from(line);
        let carry = "";
        if (NO_END.has(arr[arr.length - 1])) carry = arr.pop() as string;               // 行末に開き括弧を残さない
        else if (/[A-Za-z0-9]/.test(ch) && /[A-Za-z0-9]/.test(arr[arr.length - 1])) {    // 英数字の途中で切らない
          let k = arr.length; while (k > 0 && /[A-Za-z0-9]/.test(arr[k - 1])) k--;
          if (k > 0) carry = arr.splice(k).join("");
        }
        out.push(arr.join("")); line = carry + ch; w = Array.from(line).reduce((a, c) => a + cw(c), 0);
      } else { line += ch; w += cwid; }
    }
    out.push(line);
  }
  // 最後の行が1〜2文字だけ(「す。」など)になるときは、少し早めに折り返して、2文字以上を次の行へ送る
  if (shrinkEm === 0 && out.length >= 2) {
    const last = out[out.length - 1].replace(/[。、．，！？]/g, "");
    if (Array.from(last).length <= 2) return wrapJa(text, widthPt, size, 2.5);
  }
  return out;
}

function JaText({ text, size, width, color = DARK, weight = 400, lineHeight = 1.5, maxLines, align, style }: {
  text: string; size: number; width: number; color?: string; weight?: number; lineHeight?: number; maxLines?: number; align?: "left" | "right" | "center"; style?: any;
}) {
  let lines = wrapJa(text, width, size);
  if (maxLines && lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = lines[maxLines - 1].replace(/[。、.,]?.$/, "") + "…";
  }
  return (
    <View style={style}>
      {lines.map((l, i) => (
        <Text key={i} style={{ fontSize: size, color, fontWeight: weight, lineHeight, textAlign: align }}>{l === "" ? " " : l}</Text>
      ))}
    </View>
  );
}

// ───────── 表示の整形 ─────────
const md = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d); return m ? `${Number(m[2])}/${Number(m[3])}` : d; };
const comma = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const fmtYen = (n: number | null) => (n == null ? "-" : `${comma(n)}円`);
const fmtOku = (n: number | null) => {
  if (n == null) return "-";
  if (n >= 10000) return `${(Math.round(n / 100) / 100).toString()}兆円`;
  return `${n >= 100 ? comma(n) : String(Math.round(n * 10) / 10)}億円`;
};
const fmtShares = (n: number | null) => (n == null ? "-" : n >= 10000 ? `${Math.round(n / 1000) / 10}万株` : `${comma(n)}株`);
const rateColor = (r: number | null) => (r == null ? GRAY : r >= 0 ? GREEN : RED);
const pct = (r: number | null) => (r == null ? "-" : pctText(r) || "-");
const heat = (s: number) => (s >= 80 ? "#86efac" : s >= 65 ? "#bbf7d0" : s >= 50 ? "#fef9c3" : s >= 35 ? "#fed7aa" : "#fecaca");
const dayDiff = (a: string, b: string) => Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000);
const addDays = (ymd: string, n: number) => { const d = new Date(ymd + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// ───────── 共通の部品 ─────────
function Slide({ title, section, data, source, children }: { title: string; section?: string; data: SlidesData; source: string; children: React.ReactNode }) {
  return (
    <Page size={{ width: W, height: H }} style={{ backgroundColor: BG, fontFamily: FONT }}>
      <View style={{ backgroundColor: MID, height: 62, paddingHorizontal: 32, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {section ? <Text style={{ fontSize: 12, color: DARK, backgroundColor: PRIMARY, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, marginRight: 12 }}>{section}</Text> : null}
          <JaText text={title} size={22} width={680} color="white" weight={700} lineHeight={1.2} maxLines={1} />
        </View>
        <Text style={{ fontSize: 11, color: SOFT }}>IPO週報｜{data.issueLabel}</Text>
      </View>
      <View style={{ height: H - 62 - 30, overflow: "hidden", paddingHorizontal: 32, paddingTop: 16, paddingBottom: 6 }}>{children}</View>
      <View style={{ height: 30, paddingHorizontal: 32, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: BORDER }}>
        <Text style={{ fontSize: 9, color: GRAY }}>{jpDate(data.asOf)}時点｜{source}｜大手町調査室九課</Text>
        <Text style={{ fontSize: 9, color: GRAY }} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
      </View>
    </Page>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={{ backgroundColor: "white", borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 12, ...style }}>{children}</View>;
}

// 結論の帯(各スライドの一番上に置く。結論 → 根拠の「結論」にあたる)
function Verdict({ label, text, color = PRIMARY, width = BODY_W }: { label: string; text: string; color?: string; width?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "white", borderWidth: 1, borderColor: BORDER, borderLeftWidth: 6, borderLeftColor: color, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, marginBottom: 10 }}>
      <Text style={{ fontSize: 11, color: TTEXT, width: 40 }}>{label}</Text>
      <JaText text={text} size={17} width={width - 100} color={DARK} weight={700} lineHeight={1.35} maxLines={2} />
    </View>
  );
}

function GradeBadge({ grade, size = 18 }: { grade: string | null; size?: number }) {
  if (!grade) return <Text style={{ fontSize: size * 0.7, color: GRAY }}>-</Text>;
  const col = GRADE_COLOR[grade] ?? GRAY;
  return (
    <View style={{ borderWidth: 1.5, borderColor: col, borderRadius: size, paddingHorizontal: size * 0.5, paddingVertical: 2 }}>
      <Text style={{ fontSize: size * 0.75, fontWeight: 700, color: col }}>{grade}（{GRADE_LABEL[grade] ?? "中立"}）</Text>
    </View>
  );
}

function CardTitle({ children }: { children: string }) {
  return <Text style={{ fontSize: 11.5, fontWeight: 700, color: TTEXT, marginBottom: 6 }}>{children}</Text>;
}

// ───────── 図の部品 ─────────
function Radar({ axes, size = 290 }: { axes: { label: string; score: number }[]; size?: number }) {
  const cx = size / 2, cy = size / 2, R = size * 0.31;
  const n = axes.length;
  const pt = (i: number, v: number) => {
    const a = (i * (360 / n) - 90) * (Math.PI / 180);
    return { x: cx + (R * v / 100) * Math.cos(a), y: cy + (R * v / 100) * Math.sin(a) };
  };
  const poly = (v: number | ((i: number) => number)) =>
    axes.map((_, i) => { const p = pt(i, typeof v === "number" ? v : v(i)); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(" ");
  return (
    <View style={{ width: size, height: size, position: "relative" }}>
      <Svg width={size} height={size}>
        {[25, 50, 75, 100].map((r) => <Polygon key={r} points={poly(r)} fill="none" stroke="#cbd5e1" strokeWidth={0.8} />)}
        {axes.map((_, i) => { const p = pt(i, 100); return <Line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#cbd5e1" strokeWidth={0.8} />; })}
        <Polygon points={poly((i) => Math.max(0, Math.min(100, axes[i].score)))} fill={PRIMARY} fillOpacity={0.3} stroke={PRIMARY} strokeWidth={2} />
      </Svg>
      {axes.map((a, i) => {
        const p = pt(i, 132);
        return (
          <View key={i} style={{ position: "absolute", left: p.x - 42, top: p.y - 13, width: 84, alignItems: "center" }}>
            <Text style={{ fontSize: 9.5, color: "#475569" }}>{a.label}</Text>
            <Text style={{ fontSize: 11, fontWeight: 700, color: a.score >= 65 ? GREEN : a.score <= 45 ? RED : MID }}>{Math.round(a.score)}</Text>
          </View>
        );
      })}
    </View>
  );
}

// 縦棒グラフ(売上高)+下に利益の数字
function RevenueBars({ rows, width, height = 120 }: { rows: CompanyCard["financials"]; width: number; height?: number }) {
  const maxV = Math.max(1, ...rows.map((r) => r.revenue));
  const slot = width / rows.length;
  const bw = Math.min(34, slot * 0.55);
  return (
    <View style={{ width }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: height + 14 }}>
        {rows.map((r, i) => (
          <View key={i} style={{ width: slot, alignItems: "center", justifyContent: "flex-end" }}>
            <Text style={{ fontSize: 9, color: DARK, fontWeight: 700, marginBottom: 2 }}>{fmtOku(r.revenue).replace("億円", "")}</Text>
            <View style={{ width: bw, height: Math.max(2, (r.revenue / maxV) * height), backgroundColor: i === rows.length - 1 ? PRIMARY : SOFT, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
          </View>
        ))}
      </View>
      <View style={{ height: 1, backgroundColor: "#94a3b8" }} />
      <View style={{ flexDirection: "row", marginTop: 3 }}>
        {rows.map((r, i) => (<View key={i} style={{ width: slot, alignItems: "center" }}><Text style={{ fontSize: 8.5, color: GRAY }}>{r.label}</Text></View>))}
      </View>
      <View style={{ flexDirection: "row", marginTop: 3 }}>
        {rows.map((r, i) => (
          <View key={i} style={{ width: slot, alignItems: "center" }}>
            <Text style={{ fontSize: 9, fontWeight: 700, color: r.profit == null ? GRAY : r.profit >= 0 ? GREEN : RED }}>{r.profit == null ? "-" : (r.profit > 0 ? "+" : "") + String(Math.round(r.profit * 10) / 10).replace(/\.0$/, "")}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// 度数分布(初値が公募価格の何%だったか)
function Histogram({ bins, width, height = 40 }: { bins: number[]; width: number; height?: number }) {
  const maxV = Math.max(1, ...bins);
  const slot = width / bins.length;
  return (
    <View style={{ width }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: height + 11 }}>
        {bins.map((b, i) => (
          <View key={i} style={{ width: slot, alignItems: "center", justifyContent: "flex-end" }}>
            {b > 0 ? <Text style={{ fontSize: 7.5, color: GRAY, marginBottom: 1 }}>{b}</Text> : null}
            <View style={{ width: slot - 8, height: Math.max(b > 0 ? 2 : 0, (b / maxV) * height), backgroundColor: i < 2 ? "#f87171" : i === 2 ? "#cbd5e1" : PRIMARY, borderTopLeftRadius: 2, borderTopRightRadius: 2 }} />
          </View>
        ))}
      </View>
      <View style={{ height: 1, backgroundColor: "#94a3b8" }} />
      <View style={{ flexDirection: "row", marginTop: 2 }}>
        {BIN_LABELS.map((l, i) => (<View key={i} style={{ width: slot, alignItems: "center" }}><Text style={{ fontSize: 7, color: GRAY }}>{l}</Text></View>))}
      </View>
    </View>
  );
}

const HOLDER_COLORS = ["#0d4f52", "#2a9d9f", "#66c3c6", "#a0d4d6", "#f59e0b", "#fbbf24", "#a78bfa", "#94a3b8"];

function StackedBar({ parts, width, height = 16 }: { parts: { label: string; value: number; color: string }[]; width: number; height?: number }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <View style={{ width, height, flexDirection: "row", borderRadius: 4, overflow: "hidden", backgroundColor: "#e2e8f0" }}>
      {parts.filter((p) => p.value > 0).map((p, i) => (<View key={i} style={{ width: (p.value / total) * width, height, backgroundColor: p.color }} />))}
    </View>
  );
}

// ───────── 1枚目:表紙(結論) ─────────
function Cover({ d }: { d: SlidesData }) {
  const tiles = [
    { label: "上場", value: d.counts.listing, color: "#4ade80" },
    { label: "BB開始", value: d.counts.bb, color: "#7dd3fc" },
    { label: "申込開始", value: d.counts.apply, color: "#fbbf24" },
    { label: "ロックアップ解除", value: d.counts.lockup, color: "#c4b5fd" },
  ];
  return (
    <Page size={{ width: W, height: H }} style={{ backgroundColor: MID, fontFamily: FONT, paddingHorizontal: 44, paddingTop: 36, paddingBottom: 24 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
        <View>
          <Text style={{ fontSize: 13, color: SOFT }}>大手町調査室九課　IPO分析レポート</Text>
          <Text style={{ fontSize: 50, fontWeight: 700, color: "white", marginTop: 6 }}>IPO週報</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 18, color: PRIMARY }}>{d.issueLabel}</Text>
          <Text style={{ fontSize: 12, color: SOFT, marginTop: 2 }}>来週（{md(d.nextMon)}〜{md(d.nextSun)}）のIPO予定</Text>
        </View>
      </View>
      <View style={{ marginTop: 16 }}>
        <Text style={{ fontSize: 12, color: PRIMARY, marginBottom: 4 }}>今週の結論</Text>
        <JaText text={d.headline} size={27} width={870} color="white" weight={700} lineHeight={1.3} maxLines={2} />
      </View>
      <View style={{ marginTop: 14 }}>
        {d.bullets.map((b, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.09)", borderRadius: 8, borderLeftWidth: 5, borderLeftColor: i === 0 ? PRIMARY : TONE_COLOR[b.tone], paddingVertical: 9, paddingHorizontal: 14, marginBottom: 8 }}>
            <Text style={{ fontSize: 16, color: PRIMARY, fontWeight: 700, width: 26 }}>{i + 1}</Text>
            <JaText text={b.text} size={15.5} width={810} color="white" lineHeight={1.45} maxLines={2} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", marginTop: 16 }}>
        {tiles.map((t, i) => (
          <View key={i} style={{ flex: 1, marginRight: i < 3 ? 10 : 0, borderTopWidth: 3, borderTopColor: t.color, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 6, paddingVertical: 8, paddingHorizontal: 12, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 11.5, color: SOFT }}>来週の{t.label}</Text>
            <Text style={{ fontSize: 28, fontWeight: 700, color: "white" }}>{t.value}<Text style={{ fontSize: 11, color: SOFT }}> 社</Text></Text>
          </View>
        ))}
      </View>
      <Text style={{ fontSize: 9.5, color: SOFT, marginTop: 14 }}>{jpDate(d.asOf)}時点｜本資料は公開情報の整理を目的としており、投資勧誘ではありません。</Text>
    </Page>
  );
}

// ───────── 2枚目:行動ボード(3週間の予定) ─────────
function ActionBoard({ d }: { d: SlidesData }) {
  const { from, days, rows } = d.gantt;
  const nameW = 196, needW = 86, chartW = BODY_W - nameW - needW - 16;
  const dw = chartW / days;
  const x = (date: string) => (dayDiff(date, from) + 0.5) * dw;
  const inRange = (date: string | null) => !!date && dayDiff(date, from) >= 0 && dayDiff(date, from) < days;
  const rowH = rows.length <= 4 ? 44 : rows.length <= 6 ? 36 : rows.length <= 8 ? 30 : 26;
  const dayList = Array.from({ length: days }, (_, i) => addDays(from, i));
  const todayIdx = dayDiff(d.asOf, from);
  const nextWeek = dayDiff(d.nextMon, from);

  const markers = [
    { key: "bb", ch: "B", color: BLUE, label: "BB開始（需要申告）" },
    { key: "apply", ch: "申", color: AMBER, label: "申込開始" },
    { key: "listing", ch: "上", color: GREEN, label: "上場日" },
  ] as const;

  return (
    <Slide title="行動ボード：今後3週間のIPO日程" section="スケジュール" data={d} source="登録済みの日程（変更されることがあります）">
      <Verdict label="結論" color={PRIMARY} text={d.agenda[0] ? `最初の期日は${shortDate(d.agenda[0].date)}の${d.agenda[0].label}（${d.agenda[0].name}）。${d.gantt.rows.length}社が動きます` : "今後3週間に予定されているIPOは登録されていません"} />
      <Card style={{ paddingVertical: 8, paddingHorizontal: 10 }}>
        <View style={{ flexDirection: "row", marginBottom: 4, alignItems: "center" }}>
          <View style={{ width: nameW }}><Text style={{ fontSize: 9, color: GRAY }}>銘柄（市場）</Text></View>
          <View style={{ width: chartW, flexDirection: "row" }}>
            {dayList.map((dd, i) => {
              const wd = new Date(dd + "T00:00:00Z").getUTCDay();
              return (
                <View key={i} style={{ width: dw, alignItems: "center" }}>
                  <Text style={{ fontSize: 7.5, color: wd === 0 || wd === 6 ? "#94a3b8" : GRAY }}>{["日", "月", "火", "水", "木", "金", "土"][wd]}</Text>
                  <Text style={{ fontSize: 8, fontWeight: wd === 1 ? 700 : 400, color: wd === 0 || wd === 6 ? "#94a3b8" : DARK }}>{md(dd)}</Text>
                </View>
              );
            })}
          </View>
          <View style={{ width: needW, alignItems: "flex-end" }}><Text style={{ fontSize: 9, color: GRAY }}>100株の目安</Text></View>
        </View>
        {rows.length === 0 ? <Text style={{ fontSize: 13, color: GRAY, marginVertical: 20 }}>この期間にブックビルディング・申込・上場が予定されている銘柄は、登録されていません。</Text> : null}
        {rows.map((r, ri) => {
          const dates = [r.bb, r.apply, r.listing].filter(Boolean) as string[];
          const first = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null;
          const last = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;
          const lineL = first ? Math.max(0, x(first)) : 0;
          const lineR = last ? Math.min(chartW, x(last)) : 0;
          return (
            <View key={ri} style={{ flexDirection: "row", alignItems: "center", height: rowH, borderTopWidth: 1, borderTopColor: "#e2f4f5" }}>
              <View style={{ width: nameW }}>
                <JaText text={r.name} size={10.5} width={nameW - 6} color={DARK} weight={700} lineHeight={1.2} maxLines={1} />
                <Text style={{ fontSize: 8, color: GRAY }}>{[r.exchange, r.ticker].filter(Boolean).join("｜")}</Text>
              </View>
              <View style={{ width: chartW, height: rowH, position: "relative" }}>
                {dayList.map((dd, i) => {
                  const wd = new Date(dd + "T00:00:00Z").getUTCDay();
                  return (wd === 0 || wd === 6) ? <View key={i} style={{ position: "absolute", left: i * dw, top: 0, width: dw, height: rowH, backgroundColor: "#f1f5f6" }} /> : null;
                })}
                {nextWeek >= 0 && nextWeek < days ? <View style={{ position: "absolute", left: nextWeek * dw, top: 0, width: 1, height: rowH, backgroundColor: "#cbd5e1" }} /> : null}
                {todayIdx >= 0 && todayIdx < days ? <View style={{ position: "absolute", left: (todayIdx + 0.5) * dw, top: 0, width: 1.2, height: rowH, backgroundColor: RED }} /> : null}
                {first && lineR > lineL ? <View style={{ position: "absolute", left: lineL, top: rowH / 2 - 1.5, width: lineR - lineL, height: 3, backgroundColor: SOFT, borderRadius: 2 }} /> : null}
                {markers.map((m) => {
                  const dt = r[m.key];
                  if (!inRange(dt)) return null;
                  return (
                    <View key={m.key} style={{ position: "absolute", left: x(dt as string) - 8, top: rowH / 2 - 8, width: 16, height: 16, borderRadius: 8, backgroundColor: m.color, alignItems: "center", justifyContent: "center", opacity: m.key === "listing" && !r.listingConfirmed ? 0.55 : 1 }}>
                      <Text style={{ fontSize: 8, color: "white", fontWeight: 700 }}>{m.ch}</Text>
                    </View>
                  );
                })}
              </View>
              <View style={{ width: needW, alignItems: "flex-end" }}><Text style={{ fontSize: 10.5, fontWeight: 700, color: DARK }}>{r.need100 ? `約${comma(r.need100 / 10000)}万円` : "-"}</Text></View>
            </View>
          );
        })}
        <View style={{ flexDirection: "row", marginTop: 6, alignItems: "center" }}>
          {markers.map((m) => (
            <View key={m.key} style={{ flexDirection: "row", alignItems: "center", marginRight: 14 }}>
              <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: m.color, marginRight: 4 }} />
              <Text style={{ fontSize: 8.5, color: GRAY }}>{m.label}</Text>
            </View>
          ))}
          <View style={{ width: 1.5, height: 11, backgroundColor: RED, marginRight: 4 }} /><Text style={{ fontSize: 8.5, color: GRAY, marginRight: 14 }}>今日</Text>
          <Text style={{ fontSize: 8.5, color: GRAY }}>薄い「上」は上場日が未確定の銘柄。100株の目安は、公募価格または仮条件の上限×100株です。</Text>
        </View>
      </Card>
      {d.lockups.length > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
          <Text style={{ fontSize: 10, fontWeight: 700, color: PURPLE, marginRight: 8 }}>ロックアップ解除（30日以内）</Text>
          {d.lockups.slice(0, 4).map((l, i) => (
            <Text key={i} style={{ fontSize: 9.5, color: "#6b21a8", backgroundColor: "#faf5ff", borderWidth: 1, borderColor: "#e9d5ff", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginRight: 6 }}>
              {l.date} {l.name.length > 12 ? l.name.slice(0, 11) + "…" : l.name}（{l.kind}）
            </Text>
          ))}
          {d.lockups.length > 4 ? <Text style={{ fontSize: 9, color: GRAY }}>ほか{d.lockups.length - 4}件</Text> : null}
        </View>
      ) : null}
    </Slide>
  );
}

// ───────── 3枚目:比較ボード(9軸ヒートマップ) ─────────
const AXIS_ROWS = ["需給", "ロックアップ", "タイミング", "バリュエ", "VC売圧", "成長性", "経営陣", "収益性", "競合"];

function Compare({ d }: { d: SlidesData }) {
  const cs = d.companies;
  const labelW = 118;
  const colW = Math.min(260, Math.floor((BODY_W - labelW) / cs.length));
  const rowH = 19;
  const best = cs.reduce((m, c) => ((c.score ?? -1) > (m.score ?? -1) ? c : m), cs[0]);
  const verdict = best && best.score != null ? `AI評価が最も高いのは${best.name}（${best.grade}・${best.score}点）` : "AI評価は更新中のため、事実情報で比較します";
  const facts: [string, (c: CompanyCard) => string][] = [
    ["上場日", (c) => (c.dates.listing ? `${md(c.dates.listing)}${c.dates.listingConfirmed ? "" : "（予定）"}` : "-")],
    ["価格", (c) => c.price.ipo || c.price.range || "-"],
    ["100株の目安", (c) => fmtYen(c.price.need100)],
    ["流通比率", (c) => (c.supply.floatRatio != null ? `${c.supply.floatRatio}%` : "-")],
    ["想定時価総額", (c) => fmtOku(c.supply.marketCapOku)],
  ];
  return (
    <Slide title="比較ボード：注目銘柄を9軸で並べる" section="比較" data={d} source="目論見書をAIが解析した分析レポート（独自AIナインクロスによる評価）">
      <Verdict label="結論" color={best?.grade ? GRADE_COLOR[best.grade] : PRIMARY} text={verdict} />
      <View style={{ backgroundColor: "white", borderWidth: 1, borderColor: BORDER, borderRadius: 8, overflow: "hidden" }}>
        <View style={{ flexDirection: "row", backgroundColor: LIGHT, paddingVertical: 6 }}>
          <View style={{ width: labelW, paddingLeft: 10, justifyContent: "center" }}><Text style={{ fontSize: 9, color: TTEXT }}>銘柄 / 総合評価</Text></View>
          {cs.map((c, i) => (
            <View key={i} style={{ width: colW, paddingHorizontal: 6 }}>
              <JaText text={c.name} size={11} width={colW - 12} weight={700} lineHeight={1.2} maxLines={1} />
              <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 2 }}>
                <Text style={{ fontSize: 20, fontWeight: 700, color: c.grade ? GRADE_COLOR[c.grade] : GRAY }}>{c.grade ?? "-"}</Text>
                <Text style={{ fontSize: 10.5, color: DARK, marginLeft: 6 }}>{c.score != null ? `${c.score}点` : "更新中"}</Text>
                <Text style={{ fontSize: 8.5, color: GRAY, marginLeft: 6 }}>{c.ultra ? `超短期${c.ultra}｜短期${c.short}｜長期${c.long}` : ""}</Text>
              </View>
            </View>
          ))}
        </View>
        {AXIS_ROWS.map((lab, ai) => (
          <View key={ai} style={{ flexDirection: "row", height: rowH, borderTopWidth: 1, borderTopColor: "#e2f4f5", alignItems: "center" }}>
            <View style={{ width: labelW, paddingLeft: 10 }}><Text style={{ fontSize: 10, color: "#475569" }}>{lab}</Text></View>
            {cs.map((c, i) => {
              const a = c.axes.find((x) => x.label === lab);
              return (
                <View key={i} style={{ width: colW, height: rowH, paddingHorizontal: 3, justifyContent: "center" }}>
                  <View style={{ height: rowH - 3, borderRadius: 3, backgroundColor: a ? heat(a.score) : "#f1f5f9", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 10, lineHeight: 1, fontWeight: 700, color: DARK }}>{a ? Math.round(a.score) : "-"}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ))}
        {facts.map(([lab, fn], fi) => (
          <View key={fi} style={{ flexDirection: "row", height: 21, borderTopWidth: fi === 0 ? 2 : 1, borderTopColor: fi === 0 ? BORDER : "#e2f4f5", alignItems: "center", backgroundColor: fi % 2 ? "#fafefe" : "white" }}>
            <View style={{ width: labelW, paddingLeft: 10 }}><Text style={{ fontSize: 9.5, color: TTEXT }}>{lab}</Text></View>
            {cs.map((c, i) => (<View key={i} style={{ width: colW, paddingHorizontal: 6 }}><Text style={{ fontSize: 10.5, color: DARK, fontWeight: 700 }}>{fn(c)}</Text></View>))}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", marginTop: 6, alignItems: "center" }}>
        <Text style={{ fontSize: 8.5, color: GRAY, marginRight: 8 }}>色の目安</Text>
        {[["80点〜", "#86efac"], ["65〜79", "#bbf7d0"], ["50〜64", "#fef9c3"], ["35〜49", "#fed7aa"], ["〜34", "#fecaca"]].map(([l, c], i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", marginRight: 8 }}><View style={{ width: 12, height: 9, backgroundColor: c, borderRadius: 2, marginRight: 3 }} /><Text style={{ fontSize: 8.5, color: GRAY }}>{l}</Text></View>
        ))}
      </View>
    </Slide>
  );
}

// ───────── 注目銘柄(1/2):結論と9軸 ─────────
function CompanyMain({ d, c, idx }: { d: SlidesData; c: CompanyCard; idx: number }) {
  const sub = [c.exchange, c.ticker, c.sector].filter(Boolean).join("｜");
  const gc = c.grade ? GRADE_COLOR[c.grade] : GRAY;
  const sev = (s: string) => (s === "高" ? RED : s === "中" ? AMBER : GRAY);
  return (
    <Slide title={`注目銘柄${idx}：${c.name}`} section="注目銘柄" data={d} source="目論見書をAIが解析した分析レポート（独自AIナインクロスによる評価）">
      <View style={{ flexDirection: "row", marginBottom: 10 }}>
        <View style={{ width: 168, backgroundColor: "white", borderWidth: 1, borderColor: BORDER, borderTopWidth: 5, borderTopColor: gc, borderRadius: 10, alignItems: "center", paddingVertical: 8, marginRight: 12 }}>
          <Text style={{ fontSize: 10, color: TTEXT }}>AI総合評価</Text>
          <View style={{ flexDirection: "row", alignItems: "baseline" }}>
            <Text style={{ fontSize: 44, fontWeight: 700, color: gc }}>{c.grade ?? "-"}</Text>
            <Text style={{ fontSize: 12, color: DARK, marginLeft: 6 }}>{c.grade ? GRADE_LABEL[c.grade] : ""}</Text>
          </View>
          <Text style={{ fontSize: 12, fontWeight: 700, color: DARK }}>{c.score != null ? `${c.score} / 100点` : "評価を更新中"}</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: "white", borderWidth: 1, borderColor: BORDER, borderLeftWidth: 6, borderLeftColor: PRIMARY, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, justifyContent: "center" }}>
          <Text style={{ fontSize: 10.5, color: TTEXT }}>結論｜{sub}</Text>
          <JaText text={c.headline} size={19} width={660} color={DARK} weight={700} lineHeight={1.3} maxLines={2} style={{ marginTop: 2 }} />
          {c.ultra ? (
            <View style={{ flexDirection: "row", marginTop: 5 }}>
              {([["超短期", c.ultra], ["短期", c.short], ["長期", c.long]] as [string, string | null][]).map(([l, g], i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "baseline", marginRight: 16 }}>
                  <Text style={{ fontSize: 9.5, color: GRAY }}>{l}　</Text>
                  <Text style={{ fontSize: 14, fontWeight: 700, color: g ? GRADE_COLOR[g] ?? DARK : GRAY }}>{g ?? "-"}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: "row", flexGrow: 1 }}>
        <Card style={{ width: 300, alignItems: "center", paddingHorizontal: 2, marginRight: 10 }}>
          <View style={{ alignSelf: "flex-start", paddingLeft: 10 }}><CardTitle>9軸スコア（外側ほど高評価）</CardTitle></View>
          {c.axes.length >= 3 ? <Radar axes={c.axes} size={272} /> : <Text style={{ fontSize: 12, color: GRAY, marginTop: 60 }}>9軸のスコアは更新中です。</Text>}
        </Card>
        <Card style={{ width: 282, marginRight: 10 }}>
          <CardTitle>売上高の推移（億円）と経常利益</CardTitle>
          {c.financials.length >= 2 ? (
            <RevenueBars rows={c.financials} width={256} height={96} />
          ) : (
            <Text style={{ fontSize: 11, color: GRAY }}>財務の推移は、目論見書の解析後に追加されます。</Text>
          )}
          <View style={{ marginTop: 8 }}>
            {c.facts.slice(0, 5).map(([k, v], i) => (
              <View key={i} style={{ flexDirection: "row", paddingVertical: 2.5, borderTopWidth: 1, borderTopColor: "#e2f4f5" }}>
                <Text style={{ fontSize: 9.5, color: TTEXT, width: 62 }}>{k}</Text>
                <JaText text={v} size={10} width={190} color={DARK} lineHeight={1.25} maxLines={1} style={{ flex: 1 }} />
              </View>
            ))}
          </View>
        </Card>
        <View style={{ flex: 1 }}>
          <Card style={{ marginBottom: 8, flexGrow: 1 }}>
            <CardTitle>注目点</CardTitle>
            {c.points.length === 0 ? <Text style={{ fontSize: 10.5, color: GRAY }}>更新中です。</Text> : null}
            {c.points.map((p, i) => (
              <View key={i} style={{ marginBottom: 5 }}>
                <JaText text={p.title} size={11.5} width={256} weight={700} lineHeight={1.3} maxLines={2} />
                {p.text ? <JaText text={p.text} size={9.5} width={256} color="#475569" lineHeight={1.4} maxLines={3} style={{ marginTop: 1 }} /> : null}
              </View>
            ))}
          </Card>
          <Card style={{ backgroundColor: "#fffbeb", borderColor: "#fde68a", flexGrow: 1 }}>
            <Text style={{ fontSize: 11.5, fontWeight: 700, color: "#92400e", marginBottom: 5 }}>リスク</Text>
            {c.risks.length === 0 ? <Text style={{ fontSize: 10.5, color: GRAY }}>更新中です。</Text> : null}
            {c.risks.map((r, i) => (
              <View key={i} style={{ marginBottom: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  {r.severity ? <Text style={{ fontSize: 8, color: "white", backgroundColor: sev(r.severity), borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1, marginRight: 5 }}>{r.severity}</Text> : null}
                  <JaText text={r.title} size={10.5} width={230} weight={700} lineHeight={1.25} maxLines={1} />
                </View>
                {r.text ? <JaText text={r.text} size={9} width={256} color="#78350f" lineHeight={1.35} maxLines={2} /> : null}
              </View>
            ))}
          </Card>
        </View>
      </View>
    </Slide>
  );
}

// ───────── 注目銘柄(2/2):需給と過去の実績 ─────────
function StatTile({ label, value, sub, color = DARK, width }: { label: string; value: string; sub?: string; color?: string; width: number }) {
  return (
    <View style={{ width, backgroundColor: "white", borderWidth: 1, borderColor: BORDER, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 11 }}>
      <Text style={{ fontSize: 9.5, color: TTEXT }}>{label}</Text>
      <Text style={{ fontSize: 21, fontWeight: 700, color, marginTop: 1 }}>{value}</Text>
      {sub ? <Text style={{ fontSize: 8.5, color: GRAY }}>{sub}</Text> : null}
    </View>
  );
}

function CompanySupply({ d, c, idx }: { d: SlidesData; c: CompanyCard; idx: number }) {
  const s = c.supply;
  const tileW = (BODY_W - 3 * 10) / 4;
  const comps = [c.comps.market, c.comps.underwriter, c.comps.sector].filter(Boolean) as CompStat[];
  const shareParts = [
    { label: "公募（新株）", value: s.newShares ?? 0, color: PRIMARY },
    { label: "売出（既存株）", value: s.soldShares ?? 0, color: MID },
    { label: "オーバーアロットメント", value: s.oaShares ?? 0, color: AMBER },
  ];
  const shareTotal = shareParts.reduce((a, p) => a + p.value, 0);
  const holdersTotal = c.holders.reduce((a, h) => a + h.ratio, 0);
  const holderParts = [
    ...c.holders.map((h, i) => ({ label: h.name, value: h.ratio, color: HOLDER_COLORS[i % HOLDER_COLORS.length] })),
    ...(holdersTotal < 99.5 ? [{ label: "その他", value: Math.max(0, 100 - holdersTotal), color: "#e2e8f0" }] : []),
  ];
  const floatColor = s.floatRatio == null ? DARK : s.floatRatio < 20 ? GREEN : s.floatRatio >= 35 ? AMBER : DARK;
  return (
    <Slide title={`注目銘柄${idx}：${c.name}｜需給と過去の実績`} section="需給" data={d} source="目論見書の解析結果と、登録済みの上場実績（初値は公募価格比）">
      <Verdict label="結論" color={floatColor === GREEN ? GREEN : floatColor === AMBER ? AMBER : PRIMARY} text={c.supplyHeadline} />
      <View style={{ flexDirection: "row", marginBottom: 10 }}>
        <StatTile width={tileW} label="流通比率（上場直後の見込み）" value={s.floatRatio != null ? `${s.floatRatio}%` : "-"} sub={s.floatRatio != null ? (s.floatRatio < 20 ? "20%未満＝引き締まり気味" : s.floatRatio >= 35 ? "35%以上＝緩め" : "標準的な水準") : undefined} color={floatColor} />
        <View style={{ width: 10 }} />
        <StatTile width={tileW} label="想定時価総額" value={fmtOku(s.marketCapOku)} sub={s.postIpoShares ? `上場後 ${fmtShares(s.postIpoShares)}` : undefined} />
        <View style={{ width: 10 }} />
        <StatTile width={tileW} label="市場が吸収する金額" value={fmtOku(s.absorbOku)} sub="（公募＋売出＋OA）×価格" />
        <View style={{ width: 10 }} />
        <StatTile width={tileW} label="調達額（公募ぶん）" value={fmtOku(s.fundraisingOku)} sub={s.lockupPeriod ? `ロックアップ：${s.lockupPeriod}` : undefined} />
      </View>
      <View style={{ flexDirection: "row", flexGrow: 1 }}>
        <Card style={{ width: 436, marginRight: 10 }}>
          <CardTitle>株の出どころと、株主構成</CardTitle>
          {shareTotal > 0 ? (
            <View style={{ marginBottom: 8 }}>
              <StackedBar parts={shareParts} width={410} height={13} />
              <View style={{ flexDirection: "row", marginTop: 3 }}>
                {shareParts.filter((p) => p.value > 0).map((p, i) => (
                  <View key={i} style={{ flexDirection: "row", alignItems: "center", marginRight: 10 }}>
                    <View style={{ width: 8, height: 8, backgroundColor: p.color, marginRight: 3, borderRadius: 2 }} />
                    <Text style={{ fontSize: 8.5, color: "#475569" }}>{p.label} {fmtShares(p.value)}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
          {c.holders.length > 0 ? (
            <View>
              <StackedBar parts={holderParts} width={410} height={15} />
              <View style={{ marginTop: 5 }}>
                {c.holders.slice(0, 6).map((h, i) => (
                  <View key={i} style={{ flexDirection: "row", alignItems: "center", height: 17 }}>
                    <View style={{ width: 9, height: 9, backgroundColor: HOLDER_COLORS[i % HOLDER_COLORS.length], borderRadius: 2, marginRight: 5 }} />
                    <JaText text={h.name} size={9.5} width={190} lineHeight={1.2} maxLines={1} style={{ width: 192 }} />
                    <Text style={{ fontSize: 9, color: GRAY, width: 78 }}>{h.type}</Text>
                    <Text style={{ fontSize: 9.5, fontWeight: 700, color: DARK, width: 44, textAlign: "right" }}>{h.ratio}%</Text>
                    <Text style={{ fontSize: 8.5, width: 74, textAlign: "right", color: h.lockup === true ? GREEN : h.lockup === false ? RED : GRAY }}>{h.lockup === true ? "ロックアップ有" : h.lockup === false ? "ロックアップ無" : ""}</Text>
                  </View>
                ))}
              </View>
              <Text style={{ fontSize: 8.5, color: GRAY, marginTop: 3 }}>
                {[s.lockupCover != null ? `ロックアップ対象 計${s.lockupCover}%` : "", s.vcRatio != null ? `VC等 計${s.vcRatio}%` : ""].filter(Boolean).join("｜")}
              </Text>
            </View>
          ) : <Text style={{ fontSize: 11, color: GRAY }}>株主構成は、目論見書の解析後に追加されます。</Text>}
        </Card>
        <Card style={{ flex: 1 }}>
          <CardTitle>過去の初値の分布（公募価格比・登録済みの上場銘柄）</CardTitle>
          {comps.length === 0 ? <Text style={{ fontSize: 11, color: GRAY }}>比較できる過去の実績が、まだ十分にありません。</Text> : null}
          {comps.map((cp, i) => (
            <View key={i} style={{ marginBottom: i < comps.length - 1 ? 7 : 0 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                <JaText text={`${cp.label}（${cp.n}社）`} size={10} width={250} weight={700} lineHeight={1.2} maxLines={1} />
                <Text style={{ fontSize: 9, color: "#475569" }}>
                  平均 <Text style={{ fontWeight: 700, color: rateColor(cp.avg) }}>{pct(cp.avg)}</Text>｜勝率 <Text style={{ fontWeight: 700 }}>{cp.winRate}%</Text>｜割れ <Text style={{ fontWeight: 700, color: cp.lossRate >= 25 ? RED : DARK }}>{cp.lossRate}%</Text>
                </Text>
              </View>
              <Histogram bins={cp.bins} width={400} height={comps.length > 2 ? 30 : 38} />
            </View>
          ))}
        </Card>
      </View>
    </Slide>
  );
}

// ───────── 地合い ─────────
function Market({ d }: { d: SlidesData }) {
  const m = d.market;
  const items = m.items;
  const maxAbs = Math.max(10, ...items.map((x) => Math.abs(x.value)));
  const half = 170;
  const rowH = items.length > 16 ? 18.5 : 22;
  const vText = m.avg == null ? "集計できる上場済みの銘柄がありません" : `地合いは${m.toneLabel}。直近${m.n}社の平均は公募価格比${pct(m.avg)}・勝率${m.n ? Math.round((m.up / m.n) * 100) : 0}%`;
  return (
    <Slide title="地合い：直近の初値は公募価格の何%か" section="市場" data={d} source="登録済みの直近の上場銘柄(登録銘柄の集計)">
      <Verdict label="結論" color={TONE_COLOR[m.tone]} text={vText} />
      <View style={{ flexDirection: "row", flexGrow: 1 }}>
        <Card style={{ flex: 1.8, marginRight: 12, paddingVertical: 8 }}>
          {items.map((it, i) => {
            const w = Math.max(2, (Math.abs(it.value) / maxAbs) * half);
            const pos = it.value >= 0;
            return (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", height: rowH }}>
                <Text style={{ fontSize: 8, color: GRAY, width: 34 }}>{md(it.date)}</Text>
                <JaText text={it.name} size={9.5} width={130} color={DARK} maxLines={1} lineHeight={1.2} style={{ width: 132 }} />
                <View style={{ width: half * 2, height: 13, flexDirection: "row" }}>
                  <View style={{ width: half, alignItems: "flex-end", justifyContent: "center" }}>
                    {!pos ? <View style={{ width: w, height: 11, backgroundColor: RED, borderTopLeftRadius: 3, borderBottomLeftRadius: 3 }} /> : null}
                  </View>
                  <View style={{ width: 1, backgroundColor: "#94a3b8" }} />
                  <View style={{ width: half - 1, justifyContent: "center" }}>
                    {pos ? <View style={{ width: w, height: 11, backgroundColor: GREEN, borderTopRightRadius: 3, borderBottomRightRadius: 3 }} /> : null}
                  </View>
                </View>
                <Text style={{ width: 54, marginLeft: 4, fontSize: 9.5, fontWeight: 700, color: rateColor(it.value), textAlign: "right" }}>{pct(it.value)}</Text>
              </View>
            );
          })}
        </Card>
        <View style={{ flex: 1 }}>
          <Card style={{ marginBottom: 8, borderTopWidth: 4, borderTopColor: TONE_COLOR[m.tone] }}>
            <Text style={{ fontSize: 10.5, color: TTEXT }}>公募価格比の平均（直近{m.n}社）</Text>
            <Text style={{ fontSize: 34, fontWeight: 700, color: rateColor(m.avg) }}>{pct(m.avg)}</Text>
          </Card>
          <View style={{ flexDirection: "row", marginBottom: 8 }}>
            <Card style={{ flex: 1, marginRight: 8, padding: 10 }}>
              <Text style={{ fontSize: 9.5, color: TTEXT }}>中央値</Text>
              <Text style={{ fontSize: 20, fontWeight: 700, color: rateColor(m.median) }}>{pct(m.median)}</Text>
            </Card>
            <Card style={{ flex: 1, padding: 10 }}>
              <Text style={{ fontSize: 9.5, color: TTEXT }}>公募価格超え</Text>
              <Text style={{ fontSize: 20, fontWeight: 700, color: DARK }}>{m.up}<Text style={{ fontSize: 11, color: GRAY }}>/{m.n}社</Text></Text>
            </Card>
          </View>
          <View style={{ flexDirection: "row", marginBottom: 8 }}>
            <Card style={{ flex: 1, marginRight: 8, padding: 10 }}>
              <Text style={{ fontSize: 9.5, color: TTEXT }}>最高</Text>
              <Text style={{ fontSize: 17, fontWeight: 700, color: GREEN }}>{pct(m.best)}</Text>
            </Card>
            <Card style={{ flex: 1, padding: 10 }}>
              <Text style={{ fontSize: 9.5, color: TTEXT }}>最低</Text>
              <Text style={{ fontSize: 17, fontWeight: 700, color: rateColor(m.worst) }}>{pct(m.worst)}</Text>
            </Card>
          </View>
          <Card style={{ backgroundColor: LIGHT, padding: 10 }}>
            <JaText text="目安：平均+20%以上かつ勝率70%以上なら「良好」、平均0%以下または勝率50%未満なら「軟調」、それ以外は「中立」としています。" size={9.5} width={250} color={MID} lineHeight={1.55} />
          </Card>
        </View>
      </View>
    </Slide>
  );
}

// ───────── ランキング(主幹事・業種) ─────────
function RankCard({ title, rows, unit }: { title: string; rows: SlidesData["rankUnderwriter"]; unit: string }) {
  const maxAbs = Math.max(10, ...rows.map((r) => Math.abs(r.avg)));
  const half = 82;
  return (
    <Card style={{ flex: 1 }}>
      <CardTitle>{title}</CardTitle>
      {rows.length === 0 ? <Text style={{ fontSize: 10.5, color: GRAY }}>集計できる実績が、まだ十分にありません。</Text> : null}
      <View style={{ flexDirection: "row", marginBottom: 2 }}>
        <Text style={{ fontSize: 8, color: GRAY, width: 118 }}>{unit}</Text>
        <Text style={{ fontSize: 8, color: GRAY, width: 28, textAlign: "right" }}>社数</Text>
        <Text style={{ fontSize: 8, color: GRAY, width: half * 2 + 8, textAlign: "center" }}>初値の平均（公募価格比）</Text>
        <Text style={{ fontSize: 8, color: GRAY, width: 38, textAlign: "right" }}>勝率</Text>
      </View>
      {rows.map((r, i) => {
        const w = Math.max(2, (Math.abs(r.avg) / maxAbs) * half);
        const pos = r.avg >= 0;
        return (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", height: 32, borderTopWidth: 1, borderTopColor: "#e2f4f5" }}>
            <JaText text={r.label} size={10} width={112} lineHeight={1.2} maxLines={2} style={{ width: 118 }} />
            <Text style={{ fontSize: 9.5, color: GRAY, width: 28, textAlign: "right" }}>{r.n}</Text>
            <View style={{ width: half * 2 + 8, marginLeft: 4, height: 14, flexDirection: "row", alignItems: "center" }}>
              <View style={{ width: half, alignItems: "flex-end" }}>{!pos ? <View style={{ width: w, height: 11, backgroundColor: RED, borderRadius: 2 }} /> : null}</View>
              <View style={{ width: 1, height: 14, backgroundColor: "#94a3b8" }} />
              <View style={{ width: half }}>{pos ? <View style={{ width: w, height: 11, backgroundColor: GREEN, borderRadius: 2 }} /> : null}</View>
            </View>
            <Text style={{ fontSize: 9.5, fontWeight: 700, color: rateColor(r.avg), width: 38, textAlign: "right" }}>{pct(r.avg)}</Text>
            <Text style={{ fontSize: 9.5, color: DARK, width: 38, textAlign: "right" }}>{r.winRate}%</Text>
          </View>
        );
      })}
    </Card>
  );
}

function Rankings({ d }: { d: SlidesData }) {
  const topU = d.rankUnderwriter[0], topS = d.rankSector[0];
  const txt = [topU ? `主幹事で平均が最も高いのは${topU.label}（${pct(topU.avg)}・${topU.n}社）` : "", topS ? `業種では${topS.label}（${pct(topS.avg)}・${topS.n}社）` : ""].filter(Boolean).join("。");
  return (
    <Slide title="実績ランキング：主幹事と業種" section="実績" data={d} source="登録済みの上場銘柄の集計（3社以上のみ掲載）">
      <Verdict label="結論" text={txt || "ランキングを出せるだけの実績が、まだありません"} />
      <View style={{ flexDirection: "row", flexGrow: 1 }}>
        <RankCard title="主幹事別の初値（平均の高い順）" rows={d.rankUnderwriter} unit="主幹事" />
        <View style={{ width: 12 }} />
        <RankCard title="業種別の初値（平均の高い順）" rows={d.rankSector} unit="業種" />
      </View>
    </Slide>
  );
}

// ───────── AI評価の成績(5件以上あるときだけ) ─────────
function Track({ d }: { d: SlidesData }) {
  const t = d.track!;
  const pts = t.points;
  const PW = 560, PH = 300;
  const xs = pts.map((p) => p.score), ys = pts.map((p) => p.rate);
  const xMin = Math.floor((Math.min(...xs) - 5) / 5) * 5, xMax = Math.ceil((Math.max(...xs) + 5) / 5) * 5;
  const yMin = Math.min(0, Math.floor(Math.min(...ys) / 10) * 10 - 5), yMax = Math.max(10, Math.ceil(Math.max(...ys) / 10) * 10 + 5);
  const px = (v: number) => ((v - xMin) / Math.max(1, xMax - xMin)) * PW;
  const py = (v: number) => PH - ((v - yMin) / Math.max(1, yMax - yMin)) * PH;
  const hi = pts.filter((p) => p.grade === "A" || p.grade === "B"), lo = pts.filter((p) => p.grade !== "A" && p.grade !== "B");
  const avgOf = (a: typeof pts) => (a.length ? Math.round((a.reduce((s, p) => s + p.rate, 0) / a.length) * 10) / 10 : null);
  const hiAvg = avgOf(hi), loAvg = avgOf(lo);
  const verdict = hiAvg != null && loAvg != null
    ? `高評価（A・B）${hi.length}社の平均は${pct(hiAvg)}、それ以外${lo.length}社は${pct(loAvg)}`
    : `上場前に付けたAI評価の実績は${pts.length}社です。比較できるグループがそろうまで、参考値としてご覧ください`;
  const maxAbs = Math.max(10, ...t.byGrade.map((g) => Math.abs(g.avg)));
  return (
    <Slide title="AI評価の成績：上場前の評価と初値の関係" section="検証" data={d} source="上場前に付けたAI評価がある登録済みの上場銘柄">
      <Verdict label="結論" color={hiAvg != null && loAvg != null && hiAvg > loAvg ? GREEN : AMBER} text={verdict} />
      <View style={{ flexDirection: "row", flexGrow: 1 }}>
        <Card style={{ width: 610, marginRight: 12 }}>
          <CardTitle>横軸：AI総合スコア　縦軸：初値の公募価格比（%）</CardTitle>
          <View style={{ marginLeft: 30, marginTop: 4, width: PW, height: PH + 16, position: "relative" }}>
            <Svg width={PW} height={PH}>
              <Line x1={0} y1={py(0)} x2={PW} y2={py(0)} stroke="#94a3b8" strokeWidth={1} />
              {Array.from({ length: Math.floor((xMax - xMin) / 10) + 1 }, (_, i) => xMin + i * 10).map((xv) => (
                <Line key={xv} x1={px(xv)} y1={0} x2={px(xv)} y2={PH} stroke="#e2e8f0" strokeWidth={0.6} />
              ))}
              {pts.map((p, i) => <Circle key={i} cx={px(p.score)} cy={py(p.rate)} r={5} fill={p.rate >= 0 ? GREEN : RED} fillOpacity={0.75} stroke="white" strokeWidth={0.8} />)}
            </Svg>
            {Array.from({ length: Math.floor((xMax - xMin) / 10) + 1 }, (_, i) => xMin + i * 10).map((xv) => (
              <Text key={xv} style={{ position: "absolute", left: px(xv) - 10, top: PH + 3, width: 20, textAlign: "center", fontSize: 8.5, color: GRAY }}>{xv}</Text>
            ))}
            {[yMin, 0, yMax].map((yv, i) => (
              <Text key={i} style={{ position: "absolute", left: -30, top: py(yv) - 5, width: 26, textAlign: "right", fontSize: 8.5, color: GRAY }}>{Math.round(yv)}</Text>
            ))}
          </View>
        </Card>
        <Card style={{ flex: 1 }}>
          <CardTitle>評価ランク別の初値の平均</CardTitle>
          {t.byGrade.map((g, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", height: 34 }}>
              <Text style={{ fontSize: 18, fontWeight: 700, color: GRADE_COLOR[g.grade] ?? DARK, width: 26 }}>{g.grade}</Text>
              <Text style={{ fontSize: 9, color: GRAY, width: 34 }}>{g.n}社</Text>
              <View style={{ width: 96, height: 12 }}>
                <View style={{ width: Math.max(2, (Math.abs(g.avg) / maxAbs) * 96), height: 12, backgroundColor: g.avg >= 0 ? GREEN : RED, borderRadius: 2 }} />
              </View>
              <Text style={{ fontSize: 10.5, fontWeight: 700, color: rateColor(g.avg), marginLeft: 6 }}>{pct(g.avg)}</Text>
            </View>
          ))}
          <JaText text="件数が少ないランクは、偶然の影響を受けやすい点にご注意ください。結果を保証するものではありません。" size={9} width={232} color={GRAY} lineHeight={1.5} style={{ marginTop: 8 }} />
        </Card>
      </View>
    </Slide>
  );
}

// ───────── 最後:ご利用にあたって ─────────
function Closing({ d }: { d: SlidesData }) {
  return (
    <Slide title="ご利用にあたって" section="注意事項" data={d} source="ご利用上の注意">
      <Card style={{ marginBottom: 12 }}>
        {[
          "本資料は、公開情報とAIによる分析をもとにした情報提供を目的としており、特定の銘柄の売買をすすめるものではありません。",
          "AIの評価は、当調査室の独自AI「ナインクロス」による参考情報です。結果を保証するものではありません。",
          "日程・価格・ロックアップの予定は、変更されることがあります。申込の前に、目論見書と証券会社の案内をご確認ください。",
          "過去の初値の実績は、当サイトに登録された銘柄の集計です。将来の結果を示すものではありません。",
          "投資の判断は、ご自身の責任でお願いします。",
        ].map((t, i) => (
          <JaText key={i} text={`・${t}`} size={13.5} width={860} color="#334155" lineHeight={1.75} style={{ marginBottom: 3 }} />
        ))}
      </Card>
      <Card style={{ backgroundColor: LIGHT }}>
        <Text style={{ fontSize: 14, fontWeight: 700, color: MID }}>次号のお知らせ・友達紹介</Text>
        <JaText text="次号は、来週の金曜日にお届けします。分析レポートと最新の日程は、サイト（ipo.finance-tower.com）でいつでもご覧いただけます。" size={13.5} width={860} color={DARK} lineHeight={1.7} style={{ marginTop: 4 }} />
        <JaText text="友達を紹介すると、あなたも友達も、有料分析と週刊スライドが2ヶ月読み放題になります。招待リンクは、マイページにあります。" size={13.5} width={860} color={DARK} lineHeight={1.7} style={{ marginTop: 4 }} />
      </Card>
    </Slide>
  );
}

// ───────── スライド全体 ─────────
const hasRank = (d: SlidesData) => d.rankUnderwriter.length > 0 || d.rankSector.length > 0;

// 枚数: 表紙・行動ボード・(比較ボード)・注目銘柄×2・地合い・(ランキング)・(AI評価の成績)・注意事項
export function slideCount(d: SlidesData): number {
  return 2 + (d.companies.length > 0 ? 1 : 0) + d.companies.length * 2 + 1 + (hasRank(d) ? 1 : 0) + (d.track ? 1 : 0) + 1;
}

function Deck({ d }: { d: SlidesData }) {
  return (
    <Document title={`IPO週報 ${d.issueLabel}`} author="大手町調査室九課" subject="週刊IPOブリーフ" language="ja">
      <Cover d={d} />
      <ActionBoard d={d} />
      {d.companies.length > 0 ? <Compare d={d} /> : null}
      {d.companies.flatMap((c, i) => [
        <CompanyMain key={`m${i}`} d={d} c={c} idx={i + 1} />,
        <CompanySupply key={`s${i}`} d={d} c={c} idx={i + 1} />,
      ])}
      <Market d={d} />
      {hasRank(d) ? <Rankings d={d} /> : null}
      {d.track ? <Track d={d} /> : null}
      <Closing d={d} />
    </Document>
  );
}

let fontRegisteredFor = "";
export async function renderWeeklySlides(d: SlidesData, fontSrc: string): Promise<Buffer> {
  if (fontRegisteredFor !== fontSrc) {
    Font.register({ family: FONT, fonts: [{ src: fontSrc, fontWeight: 400 }, { src: fontSrc, fontWeight: 700 }] });
    Font.registerHyphenationCallback((w) => [w]);
    fontRegisteredFor = fontSrc;
  }
  return renderToBuffer(<Deck d={d} />);
}
