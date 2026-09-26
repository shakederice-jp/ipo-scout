"use client";
// 2026/9/26新設: 独自AIナインクロスの独自試算(バリュー×グロース・マップ等)の表示部品。
// 表示ルール(マイケルさん指定):
//  ・有料会員限定(データ自体が page.tsx 側で有料会員にしか送られない analysis_market に入っている)
//  ・画面の文字数を増やさない → 文章は書かず、数字1つの短いバッジだけ。説明は「？」を押したときだけ開く
//  ・判定不可の注釈は確定文言の2種類のみ(赤字/目論見書から数値を確認できない)
import { useState, type ReactElement } from "react";
import { GLOSSARY } from "@/lib/glossary";
import type { NineCrossResult, NineCrossBadge } from "@/lib/value-growth";

const DARK = "#082b2e", MID = "#0d4f52", BORDER = "#b3e8ea", ACCENT = "#7c3aed";
const NG_TEXT: Record<string, string> = {
  deficit: "※赤字企業はPERが出せないため",
  no_data: "※目論見書から必要な数値を確認できなかったため",
};

// 「？」ボタン。押すと直下に説明が開く。カードの開閉ボタンの中に置かれることもあるので、
// クリックが親に伝わらないようにしている(ボタンの入れ子を避けるため span で作る)。
export function Help({ term }: { term: string }) {
  const [open, setOpen] = useState(false);
  const g = GLOSSARY[term];
  if (!g) return null;
  const toggle = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setOpen((v) => !v);
  };
  return (
    <>
      <span role="button" tabIndex={0} aria-label={`${g.title}の説明`} onClick={toggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggle(e); }}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 15, height: 15, borderRadius: "50%",
          border: `1px solid ${MID}`, color: MID, fontSize: 9, fontWeight: 900, cursor: "pointer", marginLeft: 3, flexShrink: 0, lineHeight: 1 }}>
        ?
      </span>
      {open && (
        <span onClick={toggle} style={{ display: "block", flexBasis: "100%", width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8,
          backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", fontSize: 11, lineHeight: 1.7, color: "#334155", fontWeight: 400, textAlign: "left", cursor: "default" }}>
          <b style={{ color: DARK }}>{g.title}</b><br />
          これは何?：{g.what}<br />
          なぜ見るの?：{g.why}
        </span>
      )}
    </>
  );
}

const toneStyle = (tone: NineCrossBadge["tone"] | "ng") =>
  tone === "good" ? { bg: "#f0fdf4", fg: "#15803d", bd: "#bbf7d0" }
  : tone === "warn" ? { bg: "#fff7ed", fg: "#c2410c", bd: "#fed7aa" }
  : tone === "ng" ? { bg: "#f8fafc", fg: "#64748b", bd: "#e2e8f0" }
  : { bg: "#f5f3ff", fg: "#6d28d9", bd: "#ddd6fe" };

function Pill({ text, tone, term }: { text: string; tone: NineCrossBadge["tone"] | "ng"; term?: string }) {
  const s = toneStyle(tone);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap", gap: 0, fontSize: 10, fontWeight: 800, padding: "2px 8px",
      borderRadius: 20, backgroundColor: s.bg, color: s.fg, border: `1px solid ${s.bd}`, lineHeight: 1.6 }}>
      {text}{term && <Help term={term} />}
    </span>
  );
}

// 9軸の各見出しの横に置くバッジ
export function AxisBadge({ badge }: { badge?: NineCrossBadge }) {
  if (!badge) return null;
  return (
    <span style={{ display: "flex", flexWrap: "wrap", marginTop: 4 }}>
      <Pill text={badge.text} tone={badge.tone} term={badge.term} />
    </span>
  );
}

// バリュー×グロース・マップ(4象限)。象限名は枠の外(上下)に置き、点と重ならないようにする
function QuadrantMap({ peers }: { peers: NineCrossResult["peers"] }) {
  const W = 300, H = 196, L = 16, R = 8, T = 16, B = 26;
  const x = (v: number) => L + (v / 100) * (W - L - R);
  const y = (g: number) => T + (1 - g / 100) * (H - T - B);
  const self = peers.find((p) => p.self);
  const label = (t: string, lx: number, ly: number, anchor: "start" | "end") => (
    <text x={lx} y={ly} fontSize="9" fill="#94a3b8" fontWeight="700" textAnchor={anchor}>{t}</text>
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", maxWidth: 420 }} role="img"
      aria-label="横軸がバリュー度、縦軸がグロース度の4象限マップ">
      <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="#fcfcff" stroke="#e2e8f0" />
      <line x1={x(50)} y1={T} x2={x(50)} y2={H - B} stroke="#e2e8f0" strokeDasharray="3 3" />
      <line x1={L} y1={y(50)} x2={W - R} y2={y(50)} stroke="#e2e8f0" strokeDasharray="3 3" />
      {label("期待先行型", L, T - 5, "start")}
      {label("掘り出し物候補", W - R, T - 5, "end")}
      {label("慎重に見極めたい", L, H - B + 11, "start")}
      {label("堅実バリュー型", W - R, H - B + 11, "end")}
      {peers.filter((p) => !p.self).map((p, i) => (
        <circle key={i} cx={x(p.v)} cy={y(p.g)} r={3.5} fill="#cbd5e1"><title>{p.name}</title></circle>
      ))}
      {self && <circle cx={x(self.v)} cy={y(self.g)} r={7} fill={ACCENT} stroke="white" strokeWidth={2} />}
      <text x={(L + W - R) / 2} y={H - 3} fontSize="8" fill="#94a3b8" textAnchor="middle">割安寄り →</text>
      <text x={7} y={(T + H - B) / 2} fontSize="8" fill="#94a3b8" textAnchor="middle" transform={`rotate(-90 7 ${(T + H - B) / 2})`}>高成長 →</text>
    </svg>
  );
}

// 長期グループの冒頭に置くカード
export function NineCrossCard({ data }: { data?: NineCrossResult | null }) {
  if (!data) return null;
  const hasMap = data.value_score != null && data.growth_score != null && data.peers.length >= 3;
  const pills: ReactElement[] = [];

  if (data.consensus) {
    pills.push(<Pill key="c" text={`定番指標 ${data.consensus.pass}/${data.consensus.total} で割安判定`} tone={data.consensus.pass * 2 >= data.consensus.total ? "good" : "neutral"} term="consensus" />);
  }
  if (data.gvp.status === "ok") {
    pills.push(<Pill key="g" text={`成長率${data.gvp.growth}% ${data.gvp.pass ? ">" : "≦"} PER${data.gvp.per}倍${data.gvp.pass ? " ✓" : ""}`} tone={data.gvp.pass ? "good" : "neutral"} term="gvp" />);
  } else {
    pills.push(<Pill key="g" text={`成長率 vs PER:判定不可(${NG_TEXT[data.gvp.status]})`} tone="ng" term="gvp" />);
    if (data.r40.status === "ok") {
      pills.push(<Pill key="r" text={`Rule of 40:${data.r40.value}%${data.r40.pass ? " ✓" : ""}`} tone={data.r40.pass ? "good" : "neutral"} term="rule40" />);
    } else {
      pills.push(<Pill key="r" text={`Rule of 40:判定不可(${NG_TEXT.no_data})`} tone="ng" term="rule40" />);
    }
  }
  if (data.demand.kari) {
    pills.push(<Pill key="k" text={`公募価格 仮条件の${data.demand.kari.pos}で決定${data.demand.kari.pos === "上限" ? " ✓" : ""}`} tone={data.demand.kari.pos === "上限" ? "good" : "neutral"} term="kari" />);
  }
  if (data.demand.absorb_oku != null) {
    pills.push(<Pill key="a" text={`吸収金額 ${data.demand.absorb_oku}億円`} tone="neutral" term="absorb" />);
  }
  if (data.demand.mood) {
    pills.push(<Pill key="m" text={`直近IPOの地合い ${data.demand.mood.avg >= 0 ? "+" : ""}${data.demand.mood.avg}%`} tone={data.demand.mood.avg > 0 ? "good" : "neutral"} term="mood" />);
  }

  return (
    <div style={{ margin: "10px 14px 4px", padding: "12px 14px", borderRadius: 12, backgroundColor: "white", border: `1.5px solid #ddd6fe` }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
        <span style={{ fontWeight: 900, fontSize: 13, color: DARK }}>🧭 独自AIナインクロスの独自試算</span>
        <Help term="nine_cross" />
      </div>
      {hasMap ? (
        <>
          <QuadrantMap peers={data.peers} />
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, margin: "6px 0 8px", fontSize: 11, color: DARK, fontWeight: 700 }}>
            <span style={{ display: "inline-flex", alignItems: "center" }}>バリュー度 {data.value_score}<Help term="value_score" /></span>
            <span style={{ display: "inline-flex", alignItems: "center" }}>グロース度 {data.growth_score}<Help term="growth_score" /></span>
            <span style={{ padding: "1px 8px", borderRadius: 20, backgroundColor: ACCENT, color: "white", fontWeight: 900 }}>{data.quadrant}</span>
          </div>
        </>
      ) : (
        <div style={{ fontSize: 11, color: "#64748b", margin: "2px 0 8px" }}>
          マップ:判定不可({NG_TEXT[data.value_reason ?? data.growth_reason ?? "no_data"]})
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{pills}</div>
      <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 8 }}>※相対比較の目安であり、投資助言ではありません。</div>
    </div>
  );
}
