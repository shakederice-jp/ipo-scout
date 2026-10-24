"use client";
// 2026/10/24新設(束C・⑨): ヘッダーから外した「初心者向け/中・上級者向け」の切替を、フッターに移したもの。
// 動きは以前のヘッダーと同じ。サイト全体の「好み」を更新し、銘柄分析ページを見ているときは
// 今見ている銘柄の該当バージョンへその場で移動する(例: /analysis/1234 ⇔ /analysis/1234/beginner)。
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "@/contexts/AppContext";

type Level = "beginner" | "expert";

export default function FooterLevelSwitch() {
  const pathname = usePathname();
  const router = useRouter();
  const { level, setLevel } = useApp();

  const handleLevelChange = (l: Level) => {
    setLevel(l);
    if (pathname.startsWith("/analysis/")) {
      const segments = pathname.split("/").filter(Boolean);
      const id = segments[1];
      if (id) {
        const target = l === "beginner" ? `/analysis/${id}/beginner` : `/analysis/${id}`;
        if (target !== pathname) router.push(target);
      }
    }
  };

  const opts: { key: Level; label: string }[] = [
    { key: "beginner", label: "📖 初心者向け" },
    { key: "expert", label: "🎓 中・上級者向け" },
  ];

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
      <span style={{ fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }}>分析ページの表示</span>
      <div style={{ display: "flex", gap: 4, backgroundColor: "#f1f5f9", borderRadius: 18, padding: 3 }}>
        {opts.map((o) => (
          <button
            key={o.key}
            onClick={() => handleLevelChange(o.key)}
            style={{
              fontSize: 12, fontWeight: level === o.key ? 800 : 500, whiteSpace: "nowrap",
              color: level === o.key ? "#ffffff" : "#0d4f52",
              backgroundColor: level === o.key ? "#0d4f52" : "transparent",
              border: "none", borderRadius: 15, padding: "5px 12px", cursor: "pointer",
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
