// 2026/10/20新設(「時間のない資産層」向け施策・案1): 分析ページの冒頭に置く「3分で分かる結論カード」。
// 注目点2つ・注意点1つ・AIの見立て(参考)を、登録済みの分析データから自動でまとめる。
// ・AIを新たに呼ばない(表示のたびに費用が増えない。数字は元の分析と必ず一致する)。
// ・有料部分の中身(注目点・軸別スコア)は、閲覧権のある人にだけ表示する。
//   権限が無い場合は、無料で公開済みの「総合評価と要約の1文目」だけを表示し、残りは有料の案内にする。
// ・売買の助言にならないよう、「参考」「判断はご自身で」の注記を必ず付ける。
const PRIMARY = "#66c3c6", DARK = "#082b2e", MID = "#0d4f52", LIGHT = "#e8f9f9", BORDER = "#b3e8ea", TTEXT = "#2a7a7e";

type AxisLike = { id?: string; title?: string; score?: number; verdict?: string; description?: string };
type InsightLike = { title?: string; desc?: string; body?: string; detail?: string };

// 文章の1文目だけを取り出す(強調記号は外す)。長すぎる場合は切り詰める。
function firstSentence(text: string | undefined | null, max = 80): string {
  const t = String(text ?? "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const i = t.indexOf("。");
  const s = i >= 0 ? t.slice(0, i + 1) : t;
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export default function ThreeMinuteCard({
  grade, score, summary, insights, axes, hasAccess, termGrades,
}: {
  grade: string;
  score: number;
  summary?: string;
  insights?: InsightLike[];
  axes?: AxisLike[];
  hasAccess: boolean;
  termGrades?: { ultra?: string | null; short?: string | null; long?: string | null };
}) {
  // 注目点: 「まずここに注目！」の先頭2つ(閲覧権のある人にだけデータが届く)
  const points = hasAccess
    ? (insights ?? []).slice(0, 2).map((x) => ({
        title: String(x.title ?? "").trim(),
        text: firstSentence(x.desc || x.body || x.detail, 70),
      })).filter((x) => x.title)
    : [];

  // 注意点: 9軸のうち、点数がいちばん低い項目
  let caution: { title: string; score: number; text: string } | null = null;
  if (hasAccess && axes && axes.length > 0) {
    const valid = axes.filter((a) => typeof a.score === "number" && (a.score as number) > 0 && a.title);
    if (valid.length > 0) {
      const low = valid.reduce((m, a) => ((a.score as number) < (m.score as number) ? a : m));
      caution = {
        title: String(low.title),
        score: Math.round(low.score as number),
        text: firstSentence(low.verdict || low.description, 70),
      };
    }
  }

  const view = firstSentence(summary, 90);
  const tg = [
    termGrades?.ultra ? `超短期${termGrades.ultra}` : "",
    termGrades?.short ? `短期${termGrades.short}` : "",
    termGrades?.long ? `長期${termGrades.long}` : "",
  ].filter(Boolean).join("・");

  const label = (txt: string, color: string, bg: string) => (
    <span style={{ fontSize: 10, fontWeight: 900, color, backgroundColor: bg, borderRadius: 6, padding: "2px 8px", whiteSpace: "nowrap", flexShrink: 0 }}>{txt}</span>
  );

  return (
    <section aria-label="3分で分かる結論" style={{ backgroundColor: "white", border: `2px solid ${PRIMARY}`, borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <span style={{ fontSize: 15 }}>⏱</span>
        <span style={{ fontWeight: 900, fontSize: 14, color: DARK }}>3分で分かる結論</span>
        <span style={{ fontSize: 10, color: TTEXT }}>詳しい分析は、この下に続きます</span>
      </div>

      {points.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
          {points.map((p, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              {label(`注目点${i + 1}`, MID, LIGHT)}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: DARK, lineHeight: 1.5 }}>{p.title}</div>
                {p.text && <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.7, marginTop: 1 }}>{p.text}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {caution && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
          {label("注意点", "#92400e", "#fef3c7")}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: DARK, lineHeight: 1.5 }}>
              {caution.title}（{caution.score}点・9軸のうち最も低い項目）
            </div>
            {caution.text && <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.7, marginTop: 1 }}>{caution.text}</div>}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: hasAccess ? 8 : 10 }}>
        {label("AIの見立て", "white", MID)}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: DARK, lineHeight: 1.5 }}>
            総合評価は{grade}ランク（{score}点/100点）{tg ? `｜${tg}` : ""}
          </div>
          {view && <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.7, marginTop: 1 }}>{view}</div>}
        </div>
      </div>

      {!hasAccess && (
        <div style={{ borderRadius: 10, backgroundColor: "#fffbeb", border: "1px solid #fde68a", padding: "9px 12px", marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: "#92400e", lineHeight: 1.7 }}>
            🔒 注目点と注意点は、有料会員の方が読めます。
            <a href="/plans" style={{ color: MID, fontWeight: 700, marginLeft: 6, textDecoration: "underline" }}>プランを見る</a>
          </span>
        </div>
      )}

      <p style={{ fontSize: 10, color: "#64748b", lineHeight: 1.7, margin: 0 }}>
        ※AIによる参考情報です。売買をすすめるものではありません。投資の判断は、ご自身でお願いします。
      </p>
    </section>
  );
}
