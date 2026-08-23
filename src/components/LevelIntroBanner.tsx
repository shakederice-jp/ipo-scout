"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";

const DISMISS_KEY = "app-level-banner-dismissed";

// 初めて訪れたユーザー向けに、「初心者向け／中上級者向け」の
// 表示切り替えがあることをさりげなく案内するバナー。
// 一度選択する・閉じるのいずれかを行うと、以後は表示しない。
export default function LevelIntroBanner() {
  const { setLevel, levelChosen } = useApp();
  const [dismissed, setDismissed] = useState(true); // 判定が終わるまでは非表示のまま

  useEffect(() => {
    const seen = localStorage.getItem(DISMISS_KEY);
    setDismissed(!!seen || levelChosen);
  }, [levelChosen]);

  const close = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  const choose = (l: "beginner" | "expert") => {
    setLevel(l);
    close();
  };

  if (dismissed) return null;

  return (
    <div style={{
      maxWidth: 1100, margin: "10px auto 0", padding: "0 16px",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        backgroundColor: "#e8f9f9", border: "1.5px solid #66c3c6", borderRadius: 12,
        padding: "12px 16px",
      }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>👋</span>
        <div style={{ flex: "1 1 240px" }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: "#082b2e", marginBottom: 2 }}>
            はじめての方へ
          </div>
          <p style={{ fontSize: 12, color: "#2a7a7e", margin: 0, lineHeight: 1.6 }}>
            投資経験に合わせて、レポートの表示を「初心者向け」「中・上級者向け」から選べます。
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button onClick={() => choose("beginner")} style={{
            padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
            backgroundColor: "white", color: "#0d4f52", border: "1.5px solid #66c3c6", cursor: "pointer",
          }}>
            📖 初心者向けで見る
          </button>
          <button onClick={() => choose("expert")} style={{
            padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
            backgroundColor: "#0d4f52", color: "white", border: "1.5px solid #0d4f52", cursor: "pointer",
          }}>
            🎓 中・上級者向けで見る
          </button>
          <button onClick={close} aria-label="閉じる" style={{
            padding: "8px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700,
            backgroundColor: "transparent", color: "#64748b", border: "none", cursor: "pointer",
          }}>
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
