"use client";
// 2026/10/24新設(束B・⑧): /x/<token> のボタン部分。原稿のコピーと、Xの投稿画面を原稿入りで開く。
import { useState } from "react";

export default function XPostActions({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const intent = `https://x.com/intent/post?text=${encodeURIComponent(text)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // クリップボードが使えない環境では、選択してコピーできるよう原稿を全選択する
      const el = document.getElementById("x-post-text");
      if (el) {
        const r = document.createRange();
        r.selectNodeContents(el);
        const s = window.getSelection();
        s?.removeAllRanges();
        s?.addRange(r);
      }
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
      <a href={intent} target="_blank" rel="noopener noreferrer"
        style={{ display: "block", textAlign: "center", padding: "15px 20px", backgroundColor: "#0f1419", color: "white", borderRadius: 999, fontWeight: 800, fontSize: 15, textDecoration: "none" }}>
        𝕏 この原稿で投稿する →
      </a>
      <button type="button" onClick={copy}
        style={{ padding: "13px 20px", backgroundColor: "white", color: "#0d4f52", border: "1.5px solid #66c3c6", borderRadius: 999, fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
        {copied ? "コピーしました ✓" : "📋 原稿をコピー"}
      </button>
    </div>
  );
}
