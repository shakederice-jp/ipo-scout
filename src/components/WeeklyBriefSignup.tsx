"use client";
// 2026/10/20新設(案2): 「IPO週報」(毎週金曜18時・メール)の、受け取り希望の申込みカード。
// ・ログインしていない人には、無料会員登録への案内を出す。
// ・ログイン済みの人は、ボタン1つで「受け取る／止める」を切り替えられる(/api/weekly-brief)。
// /schedule とマイページに置く。
// 2026/11/1改修(集客施策2): 未ログインの人には、会員登録ではなく「メールアドレスだけ」の申込み欄を出す
// (確認メールで本人確認 → /api/weekly-brief/guest)。トップページ・銘柄ページ用に、小さく出す compact 表示を追加。
// compact のとき、すでに受け取り中の人には何も表示しない。
import { useEffect, useState } from "react";

const PRIMARY = "#66c3c6", DARK = "#082b2e", MID = "#0d4f52", BORDER = "#b3e8ea", LIGHT = "#e8f9f9";

export default function WeeklyBriefSignup({ style, compact }: { style?: React.CSSProperties; compact?: boolean }) {
  const [state, setState] = useState<"loading" | "guest" | "off" | "on">("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // ボット対策の見えない欄
  const [sentTo, setSentTo] = useState<string | null>(null);

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

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const r = await fetch("/api/weekly-brief/guest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, website }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) setSentTo(email.trim());
      else setMessage(`❌ ${d.error ?? "うまくいきませんでした。時間をおいてお試しください。"}`);
    } catch {
      setMessage("❌ 通信に失敗しました。時間をおいてお試しください。");
    } finally {
      setBusy(false);
    }
  };

  if (compact && (state === "loading" || state === "on")) return null;

  return (
    <section aria-label="IPO週報の申込み" style={{ backgroundColor: "white", border: `1.5px solid ${PRIMARY}`, borderRadius: 14, padding: "16px 18px", marginBottom: 14, ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 16 }}>📰</span>
        <span style={{ fontWeight: 900, fontSize: 15, color: DARK }}>IPO週報（無料）</span>
        <span style={{ fontSize: 10, fontWeight: 900, color: MID, backgroundColor: LIGHT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "2px 8px" }}>毎週金曜18時にメールでお届け</span>
      </div>
      <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.9, margin: "0 0 12px" }}>
        {compact
          ? "週末の3分で、来週のIPO予定と今週の初値結果を確認できます。メールアドレスだけで登録できます。"
          : "週末の3分で、来週のIPOの予定と今週の初値結果を確認できます。今週の要点・来週のスケジュール・注目銘柄をまとめてお届けします。"}
      </p>

      {state === "loading" && <div style={{ height: 38 }} />}

      {state === "guest" && !sentTo && (
        <form onSubmit={submitEmail} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="メールアドレス" autoComplete="email" aria-label="メールアドレス"
            style={{ flex: "1 1 180px", minWidth: 0, padding: "10px 12px", border: `1.5px solid ${BORDER}`, borderRadius: 10, fontSize: 16, color: DARK }} />
          <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true"
            style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
          <button type="submit" disabled={busy}
            style={{ padding: "10px 18px", backgroundColor: busy ? "#94a3b8" : PRIMARY, color: DARK, border: "none", borderRadius: 10, fontWeight: 900, fontSize: 13, cursor: busy ? "default" : "pointer", whiteSpace: "nowrap" }}>
            {busy ? "送信中..." : "無料で受け取る"}
          </button>
          <p style={{ flexBasis: "100%", margin: 0, fontSize: 10, color: "#64748b", lineHeight: 1.7 }}>
            確認メールのボタンを押すと登録完了です。メールアドレスは週報の配信にのみ使い、いつでも停止できます。
            会員登録(<a href="/auth" style={{ color: MID, fontWeight: 700 }}>無料</a>)がお済みの方は、ログイン後にこちらで設定できます。
          </p>
        </form>
      )}

      {state === "guest" && sentTo && (
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#15803d", lineHeight: 1.8 }}>
          ✅ {sentTo} に確認メールを送りました。メール内の「登録を完了する」ボタンを押してください。<br />
          <span style={{ fontSize: 11, color: "#64748b", fontWeight: 400 }}>届かない場合は、迷惑メールフォルダもご確認ください。</span>
        </p>
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
