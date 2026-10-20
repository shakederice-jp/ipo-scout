// 2026/10/20新設(案2・週刊ブリーフのPDFスライド): スライド(横向き16:9)の描画。
// ・サイトの配色(濃い緑・ミント系)・カードの形に合わせている。
// ・グラフ・図は、すべてコードで描く(AIには描かせない)。棒グラフはViewの幅、レーダー図はSVGの多角形。
// ・各スライドの下に「データ時点」と出典を入れる。1枚の中身が溢れても次のページに流れない(wrap=false)。
// ・日本語フォントは、サイトに置いてある NotoSansJP-Bold.ttf を使う(太字・通常とも同じファイル)。
import React from "react";
import { Document, Page, View, Text, Svg, Polygon, Line, Font, renderToBuffer } from "@react-pdf/renderer";
import { shortDate, jpDate, pctText } from "@/lib/jp-format";
import type { SlidesData, SlideFeatured } from "@/lib/weekly-slides-types";

const DARK = "#082b2e", MID = "#0d4f52", PRIMARY = "#66c3c6", SOFT = "#a0d4d6", LIGHT = "#e8f9f9", BORDER = "#b3e8ea", BG = "#f4fbfc", TTEXT = "#2a7a7e";
const GREEN = "#15803d", RED = "#dc2626", AMBER = "#d97706", GRAY = "#64748b";
const W = 960, H = 540;
const FONT = "NotoSansJP";

const GRADE_COLOR: Record<string, string> = { A: "#15803d", B: "#0369a1", C: "#d97706", D: "#dc2626", E: "#7c3aed" };
const GRADE_LABEL: Record<string, string> = { A: "強気", B: "やや強気", C: "中立", D: "やや弱気", E: "弱気" };


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
    lines[maxLines - 1] = lines[maxLines - 1].replace(/.$/, "") + "…";
  }
  return (
    <View style={style}>
      {lines.map((l, i) => (
        <Text key={i} style={{ fontSize: size, color, fontWeight: weight, lineHeight, textAlign: align }}>{l === "" ? " " : l}</Text>
      ))}
    </View>
  );
}
const md = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d); return m ? `${Number(m[2])}/${Number(m[3])}` : d; };

// ───────── 共通の部品 ─────────
function Slide({ title, section, data, source, children }: { title: string; section?: string; data: SlidesData; source: string; children: React.ReactNode }) {
  return (
    <Page size={{ width: W, height: H }} style={{ backgroundColor: BG, fontFamily: FONT }}>
      <View style={{ backgroundColor: MID, height: 62, paddingHorizontal: 32, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {section ? <Text style={{ fontSize: 12, color: DARK, backgroundColor: PRIMARY, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, marginRight: 12 }}>{section}</Text> : null}
          <Text style={{ fontSize: 24, fontWeight: 700, color: "white" }}>{title}</Text>
        </View>
        <Text style={{ fontSize: 11, color: SOFT }}>IPO週報｜{data.issueLabel}</Text>
      </View>
      <View style={{ flexGrow: 1, paddingHorizontal: 32, paddingTop: 20, paddingBottom: 8 }}>{children}</View>
      <View style={{ height: 30, paddingHorizontal: 32, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: BORDER }}>
        <Text style={{ fontSize: 9, color: GRAY }}>{jpDate(data.asOf)}時点｜{source}｜大手町調査室九課</Text>
        <Text style={{ fontSize: 9, color: GRAY }} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
      </View>
    </Page>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={{ backgroundColor: "white", borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 14, ...style }}>{children}</View>;
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

type Col = { head: string; width: number; align?: "left" | "right" | "center" };
function SimpleTable({ cols, rows, fontSize = 12, rowHeight = 30 }: { cols: Col[]; rows: (React.ReactNode | string)[][]; fontSize?: number; rowHeight?: number }) {
  return (
    <View style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 8, backgroundColor: "white", overflow: "hidden" }}>
      <View style={{ flexDirection: "row", backgroundColor: LIGHT, height: 28, alignItems: "center", paddingHorizontal: 8 }}>
        {cols.map((c, i) => (
          <Text key={i} style={{ width: c.width, fontSize: fontSize - 1, color: TTEXT, fontWeight: 700, textAlign: c.align ?? "left" }}>{c.head}</Text>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View key={ri} style={{ flexDirection: "row", minHeight: rowHeight, alignItems: "center", paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: BORDER }}>
          {r.map((cell, ci) => (
            <View key={ci} style={{ width: cols[ci].width, alignItems: cols[ci].align === "right" ? "flex-end" : cols[ci].align === "center" ? "center" : "flex-start" }}>
              {typeof cell === "string" ? <JaText text={cell} size={fontSize} width={cols[ci].width - 6} color={DARK} maxLines={1} lineHeight={1.3} align={cols[ci].align} /> : cell}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const rateColor = (r: number | null) => (r == null ? GRAY : r >= 0 ? GREEN : RED);
const pct = (r: number | null) => (r == null ? "-" : pctText(r) || "-");
const nameWithTicker = (n: string, t: string | null) => (t ? `${n}（${t}）` : n);

// ───────── 各スライド ─────────
function Cover({ d }: { d: SlidesData }) {
  return (
    <Page size={{ width: W, height: H }} style={{ backgroundColor: MID, fontFamily: FONT, padding: 48 }}>
      <View style={{ flexGrow: 1 }}>
        <Text style={{ fontSize: 14, color: SOFT }}>大手町調査室九課　IPO分析レポート</Text>
        <Text style={{ fontSize: 64, fontWeight: 700, color: "white", marginTop: 18 }}>IPO週報</Text>
        <Text style={{ fontSize: 20, color: PRIMARY, marginTop: 4 }}>{d.issueLabel}</Text>
        <Text style={{ fontSize: 15, color: SOFT, marginTop: 10 }}>
          {md(d.thisMon)}〜{md(d.thisFri)}の振り返りと、来週（{md(d.nextMon)}〜{md(d.nextSun)}）のIPO予定
        </Text>
        <View style={{ marginTop: 30, width: 780 }}>
          <Text style={{ fontSize: 13, color: PRIMARY, marginBottom: 8 }}>今週の3つの要点</Text>
          {d.points.map((p, i) => (
            <View key={i} style={{ flexDirection: "row", backgroundColor: "rgba(255,255,255,0.10)", borderRadius: 8, paddingVertical: 9, paddingHorizontal: 14, marginBottom: 8 }}>
              <Text style={{ fontSize: 16, color: PRIMARY, fontWeight: 700, width: 26 }}>{i + 1}</Text>
              <JaText text={p} size={16} width={720} color="white" lineHeight={1.5} />
            </View>
          ))}
        </View>
      </View>
      <Text style={{ fontSize: 10, color: SOFT }}>{jpDate(d.asOf)}時点｜本資料は公開情報の整理を目的としており、投資勧誘ではありません。</Text>
    </Page>
  );
}

function Summary({ d }: { d: SlidesData }) {
  const tiles = [
    { label: "来週に上場", value: d.counts.listing, color: GREEN },
    { label: "BB（需要申告）開始", value: d.counts.bb, color: "#0369a1" },
    { label: "申込開始", value: d.counts.apply, color: AMBER },
    { label: "ロックアップ解除", value: d.counts.lockup, color: "#7c3aed" },
  ];
  return (
    <Slide title="今週のまとめと来週の件数" section="まとめ" data={d} source="登録済みのIPO情報">
      <View style={{ flexDirection: "row", marginBottom: 16 }}>
        {tiles.map((t, i) => (
          <Card key={i} style={{ flex: 1, marginRight: i < 3 ? 12 : 0, alignItems: "center", paddingVertical: 18 }}>
            <Text style={{ fontSize: 13, color: TTEXT }}>{t.label}</Text>
            <Text style={{ fontSize: 54, fontWeight: 700, color: t.color, marginTop: 4 }}>{t.value}</Text>
            <Text style={{ fontSize: 12, color: GRAY }}>社</Text>
          </Card>
        ))}
      </View>
      <Card style={{ flexGrow: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: 700, color: DARK, marginBottom: 8 }}>3つの要点</Text>
        {d.points.map((p, i) => (
          <View key={i} style={{ flexDirection: "row", marginBottom: 8 }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: PRIMARY, alignItems: "center", justifyContent: "center", marginRight: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: 700, color: DARK }}>{i + 1}</Text>
            </View>
            <JaText text={p} size={16} width={822} color={DARK} lineHeight={1.5} />
          </View>
        ))}
        {d.commentary.outlook ? (
          <View style={{ marginTop: 4, backgroundColor: LIGHT, borderRadius: 6, padding: 10 }}>
            <JaText text={`ひとこと：${d.commentary.outlook}`} size={14} width={820} color={MID} lineHeight={1.6} />
          </View>
        ) : null}
      </Card>
    </Slide>
  );
}

function WeekMap({ d }: { d: SlidesData }) {
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(d.nextMon + "T00:00:00Z");
    dt.setUTCDate(dt.getUTCDate() + i);
    days.push(dt.toISOString().slice(0, 10));
  }
  const MAXC = 5;
  return (
    <Slide title="来週のIPOマップ" section="スケジュール" data={d} source="登録済みの日程（変更されることがあります）">
      <View style={{ flexDirection: "row", flexGrow: 1 }}>
        {days.map((day, i) => {
          const ev = d.events.filter((e) => e.date === day);
          const weekend = i >= 5;
          return (
            <View key={day} style={{ flex: 1, marginRight: i < 6 ? 6 : 0, backgroundColor: weekend ? "#eef2f3" : "white", borderWidth: 1, borderColor: BORDER, borderRadius: 8, overflow: "hidden" }}>
              <View style={{ backgroundColor: weekend ? "#cbd5d9" : LIGHT, paddingVertical: 6, alignItems: "center" }}>
                <Text style={{ fontSize: 13, fontWeight: 700, color: DARK }}>{shortDate(day)}</Text>
              </View>
              <View style={{ padding: 5 }}>
                {ev.slice(0, MAXC).map((e, k) => (
                  <View key={k} style={{ borderLeftWidth: 3, borderLeftColor: e.color, backgroundColor: "#f8fafc", paddingVertical: 4, paddingHorizontal: 5, marginBottom: 4, borderRadius: 3 }}>
                    <JaText text={e.label.replace("ロックアップ解除", "解除")} size={9.5} width={92} color={e.color} weight={700} lineHeight={1.3} />
                    <JaText text={e.name} size={11} width={92} color={DARK} lineHeight={1.35} maxLines={3} style={{ marginTop: 1 }} />
                  </View>
                ))}
                {ev.length > MAXC ? <Text style={{ fontSize: 9, color: GRAY }}>ほか{ev.length - MAXC}件</Text> : null}
                {ev.length === 0 ? <Text style={{ fontSize: 10, color: "#94a3b8", textAlign: "center", marginTop: 8 }}>予定なし</Text> : null}
              </View>
            </View>
          );
        })}
      </View>
    </Slide>
  );
}

function Market({ d }: { d: SlidesData }) {
  const items = d.market.items;
  const maxAbs = Math.max(10, ...items.map((x) => Math.abs(x.value)));
  const half = 168; // 中央から片側の最大幅(pt)
  return (
    <Slide title="直近の地合い：初値の公募価格比" section="市場" data={d} source="登録済みの直近の上場銘柄（登録銘柄の集計）">
      <View style={{ flexDirection: "row", flexGrow: 1 }}>
        <Card style={{ flex: 1.7, marginRight: 14, paddingVertical: 10 }}>
          {items.length === 0 ? <Text style={{ fontSize: 13, color: GRAY }}>集計できる上場済みの銘柄がありません。</Text> : null}
          {items.map((it, i) => {
            const w = Math.max(2, (Math.abs(it.value) / maxAbs) * half);
            const pos = it.value >= 0;
            return (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", height: 25 }}>
                <JaText text={it.name} size={10.5} width={136} color={DARK} maxLines={1} style={{ width: 140 }} />
                <View style={{ width: half * 2, height: 16, flexDirection: "row" }}>
                  <View style={{ width: half, alignItems: "flex-end", justifyContent: "center" }}>
                    {!pos ? <View style={{ width: w, height: 14, backgroundColor: RED, borderTopLeftRadius: 3, borderBottomLeftRadius: 3 }} /> : null}
                  </View>
                  <View style={{ width: 1, backgroundColor: "#94a3b8" }} />
                  <View style={{ width: half - 1, justifyContent: "center" }}>
                    {pos ? <View style={{ width: w, height: 14, backgroundColor: GREEN, borderTopRightRadius: 3, borderBottomRightRadius: 3 }} /> : null}
                  </View>
                </View>
                <Text style={{ width: 60, marginLeft: 6, fontSize: 11, fontWeight: 700, color: rateColor(it.value), textAlign: "right" }}>{pct(it.value)}</Text>
              </View>
            );
          })}
        </Card>
        <View style={{ flex: 1 }}>
          <Card style={{ marginBottom: 10 }}>
            <Text style={{ fontSize: 11, color: TTEXT }}>公募価格比の平均（直近{d.market.n}社）</Text>
            <Text style={{ fontSize: 32, fontWeight: 700, color: rateColor(d.market.avg) }}>{pct(d.market.avg)}</Text>
          </Card>
          <Card style={{ marginBottom: 10 }}>
            <Text style={{ fontSize: 11, color: TTEXT }}>中央値</Text>
            <Text style={{ fontSize: 26, fontWeight: 700, color: rateColor(d.market.median) }}>{pct(d.market.median)}</Text>
          </Card>
          <Card style={{ marginBottom: 10 }}>
            <Text style={{ fontSize: 11, color: TTEXT }}>公募価格を上回った銘柄</Text>
            <Text style={{ fontSize: 26, fontWeight: 700, color: DARK }}>{d.market.up}<Text style={{ fontSize: 14, color: GRAY }}> / {d.market.n}社</Text></Text>
          </Card>
          {d.commentary.market ? (
            <View style={{ backgroundColor: LIGHT, borderRadius: 8, padding: 10 }}>
              <JaText text={d.commentary.market} size={12.5} width={300} color={MID} lineHeight={1.6} />
            </View>
          ) : null}
        </View>
      </View>
    </Slide>
  );
}

function Check({ d }: { d: SlidesData }) {
  const rows = d.check.slice(0, 9);
  const tally = { 一致: 0, 不一致: 0, 中立: 0 } as Record<string, number>;
  d.check.forEach((r) => { if (r.verdict in tally) tally[r.verdict]++; });
  const vColor = (v: string) => (v === "一致" ? GREEN : v === "不一致" ? RED : GRAY);
  return (
    <Slide title="答え合わせ：AI評価と初値の結果" section="振り返り" data={d} source="登録済みの上場銘柄（上場前に付けたAI評価のみ）">
      <View style={{ flexDirection: "row", marginBottom: 10 }}>
        {[["評価どおり", tally["一致"], GREEN], ["評価と逆", tally["不一致"], RED], ["中立（判定せず）", tally["中立"], GRAY]].map(([l, v, c], i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", marginRight: 22 }}>
            <Text style={{ fontSize: 12, color: GRAY }}>{l as string}　</Text>
            <Text style={{ fontSize: 22, fontWeight: 700, color: c as string }}>{v as number}</Text>
            <Text style={{ fontSize: 12, color: GRAY }}> 社</Text>
          </View>
        ))}
      </View>
      {rows.length === 0 ? (
        <Card><Text style={{ fontSize: 13, color: GRAY }}>直近4週間に上場し、上場前のAI評価がある銘柄はありません。</Text></Card>
      ) : (
        <SimpleTable
          fontSize={14}
          rowHeight={33}
          cols={[{ head: "銘柄", width: 320 }, { head: "上場日", width: 110 }, { head: "AI評価（上場前）", width: 210 }, { head: "公募価格比", width: 120, align: "right" }, { head: "判定", width: 120, align: "center" }]}
          rows={rows.map((r) => [
            nameWithTicker(r.name, r.ticker),
            shortDate(r.listing_date),
            r.grade ? `${r.grade}（${GRADE_LABEL[r.grade] ?? ""}）${r.score != null ? `　${r.score}点` : ""}` : "-",
            <Text key="r" style={{ fontSize: 14, fontWeight: 700, color: rateColor(r.rate) }}>{pct(r.rate)}</Text>,
            <Text key="v" style={{ fontSize: 14, fontWeight: 700, color: vColor(r.verdict) }}>{r.verdict}</Text>,
          ])}
        />
      )}
      <JaText
        text={`判定の決め方：A・Bの評価で公募価格比がプラスなら「一致」、D・Eの評価でマイナスなら「一致」、その反対は「不一致」。Cは判定しません。${d.commentary.check ? `　${d.commentary.check}` : ""}`}
        size={11} width={890} color={GRAY} lineHeight={1.5} style={{ marginTop: 8 }} />
    </Slide>
  );
}

function Schedule({ d }: { d: SlidesData }) {
  const rows = d.schedule.slice(0, 9);
  return (
    <Slide title="申込スケジュールと仮条件" section="スケジュール" data={d} source="登録済みの日程と価格（変更されることがあります）">
      {rows.length === 0 ? (
        <Card><Text style={{ fontSize: 13, color: GRAY }}>この2週間にブックビルディングや申込が始まる銘柄は、登録されていません。</Text></Card>
      ) : (
        <SimpleTable
          fontSize={14}
          rowHeight={34}
          cols={[{ head: "銘柄", width: 290 }, { head: "市場", width: 90 }, { head: "仮条件", width: 190 }, { head: "BB開始", width: 100 }, { head: "申込開始", width: 100 }, { head: "上場日", width: 110 }]}
          rows={rows.map((r) => [nameWithTicker(r.name, r.ticker), r.exchange ?? "-", r.range || "-", r.bb, r.apply, r.listing])}
        />
      )}
      <JaText text="BB＝ブックビルディング（需要申告）。「-」は、まだ発表されていない項目です。申込の受付時間や必要な資金は、証券会社によって異なります。" size={11.5} width={890} color={GRAY} lineHeight={1.6} style={{ marginTop: 10 }} />
    </Slide>
  );
}

function Lockup({ d }: { d: SlidesData }) {
  const rows = d.lockups.slice(0, 9);
  return (
    <Slide title="ロックアップ解除の予定（今後30日）" section="注意" data={d} source="登録済みのロックアップ解除予定日">
      {rows.length === 0 ? (
        <Card><Text style={{ fontSize: 13, color: GRAY }}>今後30日に解除される予定の銘柄は、登録されていません。</Text></Card>
      ) : (
        <SimpleTable
          fontSize={15}
          rowHeight={36}
          cols={[{ head: "銘柄", width: 370 }, { head: "区分", width: 130 }, { head: "解除予定日", width: 190 }, { head: "上場日", width: 190 }]}
          rows={rows.map((r) => [nameWithTicker(r.name, r.ticker), r.kind, r.date, r.listing])}
        />
      )}
      <Card style={{ marginTop: 12, backgroundColor: "#faf5ff", borderColor: "#e9d5ff" }}>
        <JaText text="ロックアップは、上場後の一定期間に大株主などが株を売れなくなる取り決めです。解除の日が近づくと、売りが増えて株価が動きやすくなることがあります。" size={13.5} width={850} color="#6b21a8" lineHeight={1.7} />
      </Card>
    </Slide>
  );
}

function FeaturedProfile({ d, f, idx }: { d: SlidesData; f: SlideFeatured; idx: number }) {
  return (
    <Slide title={`注目銘柄${idx}：${f.name}`} section="注目銘柄" data={d} source="目論見書をAIが解析した分析レポート（独自AIナインクロスによる評価）">
      <View style={{ flexDirection: "row", flexGrow: 1 }}>
        <View style={{ flex: 1.3, marginRight: 14 }}>
          <Card style={{ marginBottom: 10 }}>
            <Text style={{ fontSize: 12, color: TTEXT, marginBottom: 6 }}>{[f.exchange, f.ticker, f.sector].filter(Boolean).join("｜")}</Text>
            {f.facts.map(([k, v], i) => (
              <View key={i} style={{ flexDirection: "row", paddingVertical: 4, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: BORDER }}>
                <JaText text={k} size={12.5} width={116} color={TTEXT} lineHeight={1.3} maxLines={2} style={{ width: 120 }} />
                <JaText text={v} size={13.5} width={340} color={DARK} lineHeight={1.4} style={{ flex: 1 }} />
              </View>
            ))}
          </Card>
          {f.summary ? (
            <View style={{ backgroundColor: "white", borderLeftWidth: 4, borderLeftColor: PRIMARY, borderRadius: 6, padding: 12 }}>
              <JaText text={f.summary} size={13.5} width={462} color="#334155" lineHeight={1.7} />
            </View>
          ) : null}
        </View>
        <Card style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 12, color: TTEXT }}>AI総合評価</Text>
          <Text style={{ fontSize: 64, fontWeight: 700, color: f.grade ? GRADE_COLOR[f.grade] ?? DARK : GRAY, marginTop: 2 }}>{f.grade ?? "-"}</Text>
          <Text style={{ fontSize: 14, color: DARK }}>{f.grade ? GRADE_LABEL[f.grade] : ""}{f.score != null ? `　${f.score}点 / 100点` : ""}</Text>
          <View style={{ flexDirection: "row", marginTop: 14 }}>
            {[["超短期", f.ultra], ["短期", f.short], ["長期", f.long]].map(([l, g], i) => (
              <View key={i} style={{ alignItems: "center", marginHorizontal: 10 }}>
                <Text style={{ fontSize: 10, color: GRAY }}>{l}</Text>
                <Text style={{ fontSize: 22, fontWeight: 700, color: g ? GRADE_COLOR[g as string] ?? DARK : GRAY }}>{(g as string) ?? "-"}</Text>
              </View>
            ))}
          </View>
          <Text style={{ fontSize: 9, color: GRAY, marginTop: 14, textAlign: "center", lineHeight: 1.5 }}>※独自AIによる参考評価です。売買をすすめるものではありません。</Text>
        </Card>
      </View>
    </Slide>
  );
}

function Radar({ axes }: { axes: { label: string; score: number }[] }) {
  const SZ = 300, cx = 150, cy = 150, R = 92;
  const n = axes.length;
  const pt = (i: number, v: number) => {
    const a = (i * (360 / n) - 90) * (Math.PI / 180);
    return { x: cx + (R * v / 100) * Math.cos(a), y: cy + (R * v / 100) * Math.sin(a) };
  };
  const poly = (v: number | ((i: number) => number)) =>
    axes.map((_, i) => { const p = pt(i, typeof v === "number" ? v : v(i)); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(" ");
  return (
    <View style={{ width: SZ, height: SZ, position: "relative" }}>
      <Svg width={SZ} height={SZ}>
        {[25, 50, 75, 100].map((r) => <Polygon key={r} points={poly(r)} fill="none" stroke="#cbd5e1" strokeWidth={0.8} />)}
        {axes.map((_, i) => { const p = pt(i, 100); return <Line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#cbd5e1" strokeWidth={0.8} />; })}
        <Polygon points={poly((i) => Math.max(0, Math.min(100, axes[i].score)))} fill={PRIMARY} fillOpacity={0.3} stroke={PRIMARY} strokeWidth={2} />
      </Svg>
      {axes.map((a, i) => {
        const p = pt(i, 128);
        return (
          <View key={i} style={{ position: "absolute", left: p.x - 42, top: p.y - 14, width: 84, alignItems: "center" }}>
            <Text style={{ fontSize: 9.5, color: "#475569" }}>{a.label}</Text>
            <Text style={{ fontSize: 10.5, fontWeight: 700, color: MID }}>{Math.round(a.score)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function FeaturedAxes({ d, f, idx }: { d: SlidesData; f: SlideFeatured; idx: number }) {
  return (
    <Slide title={`注目銘柄${idx}：9軸スコアと注目点`} section="注目銘柄" data={d} source="目論見書をAIが解析した分析レポート（独自AIナインクロスによる評価）">
      <View style={{ flexDirection: "row", flexGrow: 1 }}>
        <Card style={{ width: 330, alignItems: "center", justifyContent: "center", marginRight: 14, paddingHorizontal: 4 }}>
          {f.axes.length >= 3 ? <Radar axes={f.axes} /> : <Text style={{ fontSize: 12, color: GRAY }}>9軸のスコアが登録されていません。</Text>}
        </Card>
        <View style={{ flex: 1 }}>
          {f.points.map((p, i) => (
            <Card key={i} style={{ marginBottom: 10 }}>
              <Text style={{ fontSize: 11, color: TTEXT }}>注目点{i + 1}</Text>
              <JaText text={p.title} size={15} width={500} color={DARK} weight={700} style={{ marginTop: 2 }} />
              {p.text ? <JaText text={p.text} size={13} width={500} color="#475569" lineHeight={1.6} style={{ marginTop: 3 }} /> : null}
            </Card>
          ))}
          {f.caution ? (
            <Card style={{ backgroundColor: "#fffbeb", borderColor: "#fde68a" }}>
              <Text style={{ fontSize: 11, color: "#92400e" }}>注意点（9軸でいちばん点数の低い項目）</Text>
              <Text style={{ fontSize: 14, fontWeight: 700, color: DARK, marginTop: 2 }}>{f.caution.title}　{f.caution.score}点</Text>
              {f.caution.text ? <JaText text={f.caution.text} size={13} width={500} color="#78350f" lineHeight={1.6} style={{ marginTop: 3 }} /> : null}
            </Card>
          ) : null}
        </View>
      </View>
    </Slide>
  );
}

function Theme({ d }: { d: SlidesData }) {
  const t = d.theme;
  return (
    <Slide title={`今週のテーマ：${t.title}`} section="解説" data={d} source="一般的な制度の解説（個別の助言ではありません）">
      <JaText text={t.lead} size={16} width={890} color={DARK} lineHeight={1.7} style={{ marginBottom: 12 }} />
      <View style={{ flexDirection: "row", marginBottom: 12 }}>
        {t.points.map((p, i) => (
          <Card key={i} style={{ flex: 1, marginRight: i < t.points.length - 1 ? 10 : 0 }}>
            <Text style={{ fontSize: 22, fontWeight: 700, color: PRIMARY }}>{i + 1}</Text>
            <Text style={{ fontSize: 14, fontWeight: 700, color: DARK, marginTop: 2 }}>{p.head}</Text>
            <JaText text={p.body} size={13} width={Math.floor((896 - 10 * (t.points.length - 1)) / t.points.length) - 32} color="#475569" lineHeight={1.7} style={{ marginTop: 4 }} />
          </Card>
        ))}
      </View>
      <View style={{ backgroundColor: "#fffbeb", borderWidth: 1, borderColor: "#fde68a", borderRadius: 8, padding: 10 }}>
        <JaText text={t.note} size={13} width={860} color="#92400e" lineHeight={1.6} />
      </View>
    </Slide>
  );
}

function Closing({ d }: { d: SlidesData }) {
  return (
    <Slide title="ご利用にあたって" section="注意事項" data={d} source="大手町調査室九課">
      <Card style={{ marginBottom: 12 }}>
        {[
          "本資料は、公開情報とAIによる分析をもとにした情報提供を目的としており、特定の銘柄の売買をすすめるものではありません。",
          "AIの評価は、当調査室の独自AI「ナインクロス」による参考情報です。結果を保証するものではありません。",
          "日程・価格・ロックアップの予定は、変更されることがあります。申込の前に、目論見書と証券会社の案内をご確認ください。",
          "投資の判断は、ご自身の責任でお願いします。",
        ].map((t, i) => (
          <JaText key={i} text={`・${t}`} size={14} width={860} color="#334155" lineHeight={1.8} style={{ marginBottom: 4 }} />
        ))}
      </Card>
      <Card style={{ backgroundColor: LIGHT }}>
        <Text style={{ fontSize: 14, fontWeight: 700, color: MID }}>次号のお知らせ</Text>
        <JaText text="次号は、来週の金曜日18時にお届けします。分析レポートと最新の日程は、サイト（ipo.finance-tower.com）でいつでもご覧いただけます。" size={14} width={860} color={DARK} lineHeight={1.7} style={{ marginTop: 4 }} />
      </Card>
    </Slide>
  );
}

// ───────── スライド全体 ─────────
export function slideCount(d: SlidesData): number {
  return 8 + d.featured.length * 2 + 1; // 表紙・まとめ・マップ・地合い・答え合わせ・申込・ロックアップ・テーマ+注目銘柄+注意事項
}

function Deck({ d }: { d: SlidesData }) {
  return (
    <Document title={`IPO週報 ${d.issueLabel}`} author="大手町調査室九課" subject="週刊IPOブリーフ" language="ja">
      <Cover d={d} />
      <Summary d={d} />
      <WeekMap d={d} />
      <Market d={d} />
      <Check d={d} />
      <Schedule d={d} />
      <Lockup d={d} />
      {d.featured.flatMap((f, i) => [
        <FeaturedProfile key={`p${i}`} d={d} f={f} idx={i + 1} />,
        <FeaturedAxes key={`a${i}`} d={d} f={f} idx={i + 1} />,
      ])}
      <Theme d={d} />
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
