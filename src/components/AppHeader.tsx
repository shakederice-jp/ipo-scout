"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const C = {
  nav:    "#0e5c6b",
  teal:   "#66c3c6",
  teallt: "#e0f7f8",
  text:   "#1a3a3a",
  muted:  "#6b8e8e",
  border: "#b3e8ea",
  white:  "#ffffff",
};

type FontSize = "sm" | "md" | "lg";
type Lang = "ja" | "en";

const FONT_SIZE_MAP: Record<FontSize, number> = { sm: 13, md: 15, lg: 17 };

const NAV_LABELS: Record<Lang, { top: string; calendar: string; analysis: string }> = {
  ja: { top: "トップ", calendar: "カレンダー", analysis: "銘柄分析" },
  en: { top: "Top",    calendar: "Calendar",   analysis: "Analysis"  },
};

const BREADCRUMB_MAP: Record<Lang, Record<string, string>> = {
  ja: { "/": "トップ", "/calendar": "IPOカレンダー", "/analysis": "銘柄分析" },
  en: { "/": "Top",    "/calendar": "IPO Calendar",  "/analysis": "Analysis" },
};

export default function AppHeader() {
  const pathname = usePathname();
  const [fontSize, setFontSize] = useState<FontSize>("sm");
  const [lang, setLang] = useState<Lang>("ja");

  // font size を body に適用
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--app-font-size",
      `${FONT_SIZE_MAP[fontSize]}px`
    );
  }, [fontSize]);

  // パンくずリスト生成
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: { label: string; href: string }[] = [
    { label: BREADCRUMB_MAP[lang]["/"], href: "/" },
  ];
  let acc = "";
  for (const seg of segments) {
    acc += "/" + seg;
    const key = acc.startsWith("/analysis/") ? "/analysis" : acc;
    const label = BREADCRUMB_MAP[lang][key] ?? seg;
    crumbs.push({ label, href: acc });
  }

  const navLabels = NAV_LABELS[lang];

  return (
    <header style={{ backgroundColor: C.nav, position: "sticky", top: 0, zIndex: 50, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
      {/* メインナビ */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 44 }}>
        {/* ロゴ */}
        <Link href="/" style={{ textDecoration: "none" }}>
  <span style={{ fontSize: 15, fontWeight: 900, color: C.teal, letterSpacing: "-0.5px" }}>IPO Scout</span>
</Link>

        {/* ナビリンク */}
        <nav style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {(["/", "/calendar"] as const).map((href) => {
            const label = href === "/" ? navLabels.top : navLabels.calendar;
            const active = pathname === href;
            return (
              <Link key={href} href={href} style={{
                textDecoration: "none", fontSize: 12, fontWeight: active ? 700 : 500,
                color: active ? C.teal : "#a0d4d6",
                padding: "6px 10px", borderRadius: 6,
                backgroundColor: active ? "rgba(102,195,198,0.15)" : "transparent",
              }}>{label}</Link>
            );
          })}
        </nav>

        {/* 右側コントロール */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* 文字サイズ */}
          <div style={{ display: "flex", alignItems: "center", gap: 2, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 6, padding: "2px 4px" }}>
            {(["sm", "md", "lg"] as FontSize[]).map((s) => (
              <button key={s} onClick={() => setFontSize(s)} style={{
                fontSize: s === "sm" ? 10 : s === "md" ? 12 : 14,
                fontWeight: fontSize === s ? 700 : 400,
                color: fontSize === s ? C.teal : "#a0d4d6",
                background: "none", border: "none", cursor: "pointer", padding: "2px 5px", borderRadius: 4,
                backgroundColor: fontSize === s ? "rgba(102,195,198,0.2)" : "transparent",
              }}>A</button>
            ))}
          </div>
          {/* 日英切替 */}
          <button onClick={() => setLang(l => l === "ja" ? "en" : "ja")} style={{
            fontSize: 11, fontWeight: 600, color: C.teal,
            backgroundColor: "rgba(102,195,198,0.15)", border: `1px solid rgba(102,195,198,0.3)`,
            borderRadius: 6, padding: "3px 8px", cursor: "pointer",
          }}>{lang === "ja" ? "EN" : "JA"}</button>
        </div>
      </div>

      {/* パンくず */}
      {crumbs.length > 1 && (
        <div style={{ backgroundColor: "rgba(0,0,0,0.2)", borderTop: "1px solid rgba(102,195,198,0.15)" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto", padding: "4px 16px", display: "flex", alignItems: "center", gap: 4 }}>
            {crumbs.map((c, i) => (
              <span key={c.href} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {i > 0 && <span style={{ color: "#a0d4d6", fontSize: 10 }}>›</span>}
                {i < crumbs.length - 1
                  ? <Link href={c.href} style={{ fontSize: 11, color: "#a0d4d6", textDecoration: "none" }}>{c.label}</Link>
                  : <span style={{ fontSize: 11, color: C.teal, fontWeight: 600 }}>{c.label}</span>
                }
              </span>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}