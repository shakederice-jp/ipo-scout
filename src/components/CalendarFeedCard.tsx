"use client";
// 2026/10/24新設(束A・①): マイページの「予定の自動登録」カード。
// ・Cプランの会員 … 購読リンク(カレンダーに1回登録すると、上場日・BB・申込・ロックアップ解除日が自動で入る)を表示する。
// ・それ以外の会員 … どんな機能かの説明と、Cプランへの案内だけを表示する(リンクは渡さない)。
// ・未ログインの場合は何も表示しない。
import { useEffect, useState } from "react";
import { PLAN_CATALOG } from "@/lib/plan-catalog";

const PRIMARY = "#66c3c6", DARK = "#082b2e", MID = "#0d4f52", BORDER = "#b3e8ea", LIGHT = "#e8f9f9";

type FeedState = { loggedIn: boolean; eligible: boolean; webcal?: string; https?: string; error?: string };

export default function CalendarFeedCard({ style }: { style?: React.CSSProperties }) {
  const [st, setSt] = useState<FeedState | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/calendar/feed", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setSt(d))
      .catch(() => setSt(null));
  }, []);

  if (!st || !st.loggedIn) return null;
  const c = PLAN_CATALOG.plan_c;

  const copy = async () => {
    if (!st.https) return;
    try {
      await navigator.clipboard.writeText(st.https);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const regenerate = async () => {
    if (!confirm("購読リンクを作り直します。これまでのリンクは使えなくなるため、カレンダーに登録し直す必要があります。よろしいですか？")) return;
    setBusy(true);
    try {
      const r = await fetch("/api/calendar/feed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ regenerate: true }) });
      setSt(await r.json());
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="予定の自動登録" style={{ backgroundColor: "white", border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: "16px 18px", marginBottom: 14, ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 16 }}>🗓️</span>
        <span style={{ fontWeight: 900, fontSize: 15, color: DARK }}>予定の自動登録（カレンダー購読）</span>
        <span style={{ fontSize: 10, fontWeight: 900, color: MID, backgroundColor: LIGHT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "2px 8px" }}>{c.letter} {c.name}の機能</span>
      </div>
      <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.9, margin: "0 0 12px" }}>
        上場日・BB開始日・申込開始日・ロックアップ解除日を、お使いのカレンダー（iPhone標準・Googleカレンダー・Outlookなど）に自動で入れます。一度登録すれば、日程が変わったときも自動で更新されます。
      </p>

      {st.eligible && st.https ? (
        <div>
          <a href={st.webcal} style={{ display: "inline-block", padding: "10px 18px", backgroundColor: PRIMARY, color: DARK, borderRadius: 8, fontWeight: 900, fontSize: 13, textDecoration: "none" }}>
            カレンダーに登録する
          </a>
          <p style={{ fontSize: 11, color: "#64748b", lineHeight: 1.8, margin: "10px 0 6px" }}>
            うまく開かない場合は、下のリンクをコピーして、カレンダーアプリの「URLで追加（購読）」に貼り付けてください。Googleカレンダーは、パソコンの画面で「他のカレンダー」→「URLで追加」から登録できます。
          </p>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <input readOnly value={st.https} onFocus={(e) => e.currentTarget.select()}
              style={{ flex: "1 1 240px", minWidth: 0, fontSize: 11, padding: "7px 8px", border: `1px solid ${BORDER}`, borderRadius: 6, color: "#475569", fontFamily: "monospace" }} />
            <button type="button" onClick={copy}
              style={{ padding: "7px 12px", border: `1.5px solid ${PRIMARY}`, backgroundColor: "white", color: MID, borderRadius: 6, fontWeight: 900, fontSize: 12, cursor: "pointer" }}>
              {copied ? "コピーしました" : "コピー"}
            </button>
          </div>
          <p style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.7, margin: "10px 0 0" }}>
            このリンクは、あなた専用です。他の人に教えないでください。
            <button type="button" onClick={regenerate} disabled={busy}
              style={{ background: "none", border: "none", padding: 0, marginLeft: 6, color: "#64748b", textDecoration: "underline", cursor: "pointer", fontSize: 10 }}>
              リンクを作り直す
            </button>
          </p>
        </div>
      ) : st.eligible ? (
        <p style={{ fontSize: 12, color: "#b91c1c", margin: 0 }}>{st.error ?? "購読リンクを取得できませんでした。"}</p>
      ) : (
        <div>
          <p style={{ fontSize: 12, color: "#92400e", backgroundColor: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 10px", margin: "0 0 10px" }}>
            🔒 この機能は、{c.letter} {c.name}（{c.price}{c.period}）の会員向けです。
          </p>
          <a href="/plans" style={{ display: "inline-block", padding: "9px 18px", border: `1.5px solid ${PRIMARY}`, color: MID, borderRadius: 8, fontWeight: 900, fontSize: 12, textDecoration: "none" }}>
            プランを見る →
          </a>
        </div>
      )}
    </section>
  );
}
