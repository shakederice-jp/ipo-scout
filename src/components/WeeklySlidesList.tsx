"use client";
// 2026/10/20新設(案2): マイページの「週刊スライド」。公開中の号の一覧を出し、有料会員にはPDFを開くリンクを見せる。
// ・読めない会員(無料会員など)には、最新号の見出しとプランへの案内だけを出す(中身は渡さない)。
// ・公開中の号が1つも無いときは、何も表示しない。
import { useEffect, useState } from "react";

const PRIMARY = "#66c3c6", DARK = "#082b2e", MID = "#0d4f52", BORDER = "#b3e8ea", LIGHT = "#e8f9f9";

interface Slide { id: string; issue_date: string; issue_label: string; page_count: number | null }

export default function WeeklySlidesList({ style }: { style?: React.CSSProperties }) {
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [canRead, setCanRead] = useState(false);

  useEffect(() => {
    fetch("/api/weekly-slides", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { setSlides(d.slides ?? []); setCanRead(!!d.canRead); })
      .catch(() => setSlides([]));
  }, []);

  if (!slides || slides.length === 0) return null;

  return (
    <section aria-label="週刊スライド" style={{ backgroundColor: "white", border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: "16px 18px", marginBottom: 14, ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 16 }}>📄</span>
        <span style={{ fontWeight: 900, fontSize: 15, color: DARK }}>週刊スライド（PDF）</span>
        <span style={{ fontSize: 10, fontWeight: 900, color: MID, backgroundColor: LIGHT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "2px 8px" }}>有料会員向け</span>
      </div>
      <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.9, margin: "0 0 12px" }}>
        来週の予定・直近の初値の地合い・AI評価の答え合わせ・注目銘柄の9軸スコアを、横向きのスライド（PDF）にまとめています。毎週金曜に公開します。
      </p>

      {canRead ? (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {slides.map((s) => (
            <li key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 0", borderTop: `1px solid ${LIGHT}` }}>
              <span style={{ fontSize: 13, color: DARK, fontWeight: 700 }}>
                {s.issue_label}
                {s.page_count ? <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400, marginLeft: 8 }}>{s.page_count}枚</span> : null}
              </span>
              <a href={`/api/weekly-slides/download?id=${s.id}`} target="_blank" rel="noopener noreferrer"
                style={{ padding: "7px 14px", backgroundColor: PRIMARY, color: DARK, borderRadius: 8, fontWeight: 900, fontSize: 12, textDecoration: "none", whiteSpace: "nowrap" }}>
                PDFを開く
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <div>
          <p style={{ fontSize: 12, color: "#92400e", backgroundColor: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 10px", margin: "0 0 10px" }}>
            🔒 最新号：{slides[0].issue_label}（有料プランの会員の方が読めます）
          </p>
          <a href="/plans" style={{ display: "inline-block", padding: "9px 18px", border: `1.5px solid ${PRIMARY}`, color: MID, borderRadius: 8, fontWeight: 900, fontSize: 12, textDecoration: "none" }}>
            プランを見る →
          </a>
        </div>
      )}
    </section>
  );
}
