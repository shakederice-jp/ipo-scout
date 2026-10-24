// 2026/10/18新設(SEO・GEO対応): /schedule・/results・/lockup・/how-to-apply・/glossary で共通の
// 見た目の部品。サーバー側で描画される(JavaScriptが動かなくても中身が読める)。
import type { CSSProperties, ReactNode } from "react";

export const C = { nav: "#0d4f52", teal: "#66c3c6", dark: "#082b2e", mid: "#2a7a7e", border: "#b3e8ea", soft: "#e8f9f9", bg: "#f4fbfc" };

export function Page({ children }: { children: ReactNode }) {
  return (
    <div style={{ backgroundColor: C.bg, minHeight: "100vh", fontFamily: "'Noto Sans JP','Hiragino Kaku Gothic ProN',sans-serif" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "16px 16px 48px" }}>{children}</div>
    </div>
  );
}

export function Crumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="パンくず" style={{ fontSize: 11, color: "#64748b", marginBottom: 10 }}>
      {items.map((it, i) => (
        <span key={i}>
          {i > 0 && <span style={{ margin: "0 6px" }}>›</span>}
          {it.href ? <a href={it.href} style={{ color: C.mid, textDecoration: "none" }}>{it.label}</a> : <span>{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function H1({ children }: { children: ReactNode }) {
  return <h1 style={{ fontSize: 22, fontWeight: 900, color: C.dark, lineHeight: 1.45, margin: "0 0 10px" }}>{children}</h1>;
}

export function Lead({ children }: { children: ReactNode }) {
  return <p style={{ fontSize: 13, color: "#334155", lineHeight: 1.9, margin: "0 0 14px" }}>{children}</p>;
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <section style={{ backgroundColor: "white", border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", marginBottom: 14, ...style }}>{children}</section>;
}

export function H2({ children, id }: { children: ReactNode; id?: string }) {
  return <h2 id={id} style={{ fontSize: 16, fontWeight: 900, color: C.dark, lineHeight: 1.5, margin: "0 0 10px" }}>{children}</h2>;
}

export function P({ children }: { children: ReactNode }) {
  return <p style={{ fontSize: 13, color: "#334155", lineHeight: 1.9, margin: "0 0 10px" }}>{children}</p>;
}

export function Table({ head, rows, minWidth = 640 }: { head: string[]; rows: ReactNode[][]; minWidth?: number }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", minWidth, borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ backgroundColor: C.soft }}>
            {head.map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: C.mid, fontWeight: 700, whiteSpace: "nowrap", borderBottom: `1px solid ${C.border}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
              {r.map((cell, j) => (
                <td key={j} style={{ padding: "8px 10px", color: C.dark, verticalAlign: "top", lineHeight: 1.6 }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RelatedLinks({ current }: { current?: string }) {
  const items = [
    { href: "/", label: "📅 IPOカレンダー（トップ）" },
    { href: "/schedule", label: "📋 上場スケジュール一覧表" },
    { href: "/results", label: "📊 初値の結果一覧" },
    { href: "/lockup", label: "🔓 ロックアップ解除予定" },
    { href: "/how-to-apply", label: "📝 IPOの申込方法" },
    { href: "/tax-nisa", label: "💴 税金・NISAの基本" },
    { href: "/glossary", label: "📖 IPO用語集" },
    { href: "/ipo-guide", label: "💡 IPO投資の実践的法則" },
  ].filter((i) => i.href !== current);
  return (
    <Card>
      <H2>あわせて読みたいページ</H2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {items.map((i) => (
          <a key={i.href} href={i.href} style={{ fontSize: 12, fontWeight: 700, color: C.nav, textDecoration: "none", padding: "7px 12px", borderRadius: 18, border: `1.5px solid ${C.teal}`, backgroundColor: "white", whiteSpace: "nowrap" }}>{i.label}</a>
        ))}
      </div>
    </Card>
  );
}

export function Disclaimer() {
  return (
    <p style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.8, margin: "6px 0 0" }}>
      本ページは公開情報の整理を目的としており、投資勧誘ではありません。日程や価格は変更されることがあります。最終的な投資判断はご自身の責任で行ってください。
    </p>
  );
}

export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}
