// 2026/10/24新設(束D・⑦): 分析ページの冒頭に出す「この銘柄の最新情報」欄。
// 新情報が1件も無い銘柄では、欄ごと表示しない(「なし」などは出さない)。
// 無料会員・未ログインでも見える(公開情報の整理のため)。出典のURLと日付を必ず付ける。
import type { LatestNewsEntry } from "@/lib/company-news";

const C = { nav: "#0d4f52", teal: "#66c3c6", border: "#b3e8ea", soft: "#e8f9f9", text: "#082b2e", muted: "#64748b" };

function fmt(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return `${y}/${m}/${day}`;
}

export default function LatestNewsBox({ items }: { items?: LatestNewsEntry[] }) {
  if (!items || items.length === 0) return null;
  return (
    <section aria-label="この銘柄の最新情報" style={{ backgroundColor: "white", border: `1.5px solid ${C.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 14, fontWeight: 900, color: C.nav, margin: 0 }}>🆕 この銘柄の最新情報</h2>
        <a href="/trends" style={{ fontSize: 11, fontWeight: 700, color: C.nav, textDecoration: "none", whiteSpace: "nowrap" }}>📡 マーケットトレンドを見る →</a>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {items.map((it, i) => (
          <li key={it.key} style={{ padding: "8px 0", borderTop: i === 0 ? "none" : `1px solid ${C.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
              <span style={{ fontSize: 11, color: C.muted, whiteSpace: "nowrap" }}>{fmt(it.date)}</span>
              {it.category && (
                <span style={{ fontSize: 10, fontWeight: 700, color: C.nav, backgroundColor: C.soft, borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap" }}>{it.category}</span>
              )}
            </div>
            <a
              href={it.href}
              {...(it.internal ? {} : { target: "_blank", rel: "noopener noreferrer nofollow" })}
              style={{ fontSize: 13, fontWeight: 800, color: C.text, lineHeight: 1.6, textDecoration: "underline", textDecorationColor: C.teal }}
            >
              {it.headline}
            </a>
            {it.summary && <p style={{ fontSize: 12, color: "#334155", lineHeight: 1.8, margin: "2px 0 0" }}>{it.summary}</p>}
            {it.sourceName && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>出典：{it.sourceName}</div>}
          </li>
        ))}
      </ul>
      <p style={{ fontSize: 10, color: C.muted, lineHeight: 1.7, margin: "8px 0 0" }}>
        公開情報をAIが整理した内容です。分析レポート本文は、この情報では更新されていません。
      </p>
    </section>
  );
}
