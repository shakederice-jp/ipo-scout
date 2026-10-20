"use client";
// 2026/10/20新設(案2): 「IPO週報」(毎週金曜18時・メール)の、受け取り希望の申込みカード。
// ・ログインしていない人には、無料会員登録への案内を出す。
// ・ログイン済みの人は、ボタン1つで「受け取る／止める」を切り替えられる(/api/weekly-brief)。
// /schedule とマイページに置く。
import { useEffect, useState } from "react";

const PRIMARY = "#66c3c6", DARK = "#082b2e", MID = "#0d4f52", BORDER = "#b3e8ea", LIGHT = "#e8f9f9";

export default function WeeklyBriefSignup({ style }: { style?: React.CSSProperties }) {
  const [state, setState] = useState<"loading" | "guest" | "off" | "on">("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/weekly-brief", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setState(!d.loggedIn ? "guest" : d.subscribed ? "on" : "off"))
      .catch(() => setState("guest"));
  }, []);

  const toggle = async (subscribe: boolean) => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await fetch("/api/weekly-brief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscribe }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setState(subscribe ? "on" : "off");
        setMessage(subscribe ? "✅ 申し込みました。次の金曜18時から届きます。" : "配信を止めました。");
      } else {
        setMessage(`❌ ${d.error ?? "うまくいきませんでした。時間をおいてお試しください。"}`);
      }
    } catch {
      setMessage("❌ 通信に失敗しました。時間をおいてお試しください。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="IPO週報の申込み" style={{ backgroundColor: "white", border: `1.5px solid ${PRIMARY}`, borderRadius: 14, padding: "16px 18px", marginBottom: 14, ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 16 }}>📰</span>
        <span style={{ fontWeight: 900, fontSize: 15, color: DARK }}>IPO週報（無料）</span>
        <span style={{ fontSize: 10, fontWeight: 900, color: MID, backgroundColor: LIGHT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "2px 8px" }}>毎週金曜18時にメールでお届け</span>
      </div>
      <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.9, margin: "0 0 12px" }}>
        週末の3分で、来週のIPOの予定と今週の初値結果を確認できます。今週の要点・来週のスケジュール・注目銘柄をまとめてお届けします。
      </p>

      {state === "loading" && <div style={{ height: 38 }} />}

      {state === "guest" && (
        <a href="/auth" style={{ display: "inline-block", padding: "10px 20px", backgroundColor: PRIMARY, color: DARK, borderRadius: 10, fontWeight: 900, fontSize: 13, textDecoration: "none" }}>
          無料会員登録して受け取る →
        </a>
      )}

      {state === "off" && (
        <button onClick={() => toggle(true)} disabled={busy}
          style={{ padding: "10px 20px", backgroundColor: busy ? "#94a3b8" : PRIMARY, color: DARK, border: "none", borderRadius: 10, fontWeight: 900, fontSize: 13, cursor: busy ? "default" : "pointer" }}>
          {busy ? "送信中..." : "IPO週報を受け取る"}
        </button>
      )}

      {state === "on" && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: "#15803d" }}>✅ 受け取り中です</span>
          <button onClick={() => toggle(false)} disabled={busy}
            style={{ padding: "7px 14px", backgroundColor: "white", color: "#64748b", border: "1px solid #cbd5e1", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: busy ? "default" : "pointer" }}>
            {busy ? "処理中..." : "配信を止める"}
          </button>
        </div>
      )}

      {message && (
        <p style={{ margin: "10px 0 0", fontSize: 12, fontWeight: 700, color: message.startsWith("❌") ? "#dc2626" : "#15803d" }}>{message}</p>
      )}
    </section>
  );
}
