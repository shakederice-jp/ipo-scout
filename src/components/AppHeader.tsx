"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

const C = {
  nav: "#0d4f52",
  teal: "#66c3c6",
};

type FontSize = "sm" | "md" | "lg";
const FONT_SIZE_MAP: Record<FontSize, number> = { sm: 13, md: 15, lg: 17 };

interface AppHeaderProps {
  slot?: React.ReactNode;
}

export default function AppHeader({ slot }: AppHeaderProps = {}) {
  const pathname = usePathname();
  const [fontSize, setFontSize] = useState<FontSize>("md");
  const [lang, setLang] = useState<"ja" | "en">("ja");

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--app-font-size",
      `${FONT_SIZE_MAP[fontSize]}px`
    );
  }, [fontSize]);

  const isAnalysis = pathname.startsWith("/analysis/");

  type Crumb = { label: string; href: string; link: boolean };
  let crumbs: Crumb[] = [];

  if (isAnalysis) {
    crumbs = [
      { label: lang === "ja" ? "トップ" : "Top", href: "/", link: true },
      { label: lang === "ja" ? "銘柄分析" : "Analysis", href: pathname, link: false },
    ];
  }

  return (
    <header style={{ backgroundColor: C.nav, position: "sticky", top: 0, zIndex: 50, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 44 }}>
        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20, lineHeight: 1 }}>📊</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: "#ffffff", letterSpacing: "0.3px", lineHeight: 1.3 }}>IPO企業情報AI分析レポート</span>
            <span style={{ fontSize: 10, fontWeight: 500, color: "#a0d4d6", lineHeight: 1.3 }}>担当：大手町調査室九課</span>
          </div>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
          <button onClick={() => setLang(l => l === "ja" ? "en" : "ja")} style={{
            fontSize: 11, fontWeight: 600, color: C.teal,
            backgroundColor: "rgba(102,195,198,0.15)", border: "1px solid rgba(102,195,198,0.3)",
            borderRadius: 6, padding: "3px 8px", cursor: "pointer",
          }}>{lang === "ja" ? "EN" : "JA"}</button>
        </div>
      </div>
      {crumbs.length > 0 && (
        <div style={{ backgroundColor: "rgba(0,0,0,0.2)", borderTop: "1px solid rgba(102,195,198,0.15)" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto", padding: "4px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {crumbs.map((c, i) => (
                <span key={c.href} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {i > 0 && <span style={{ color: "#a0d4d6", fontSize: 10 }}>›</span>}
                  {c.link
                    ? <Link href={c.href} style={{ fontSize: 11, color: "#a0d4d6", textDecoration: "none" }}>{c.label}</Link>
                    : <span style={{ fontSize: 11, color: C.teal, fontWeight: 600 }}>{c.label}</span>
                  }
                </span>
              ))}
            </div>
            {slot}
          </div>
        </div>
      )}
    </header>
  );
}