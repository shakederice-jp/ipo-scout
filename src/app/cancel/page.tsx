"use client";
import { useState } from "react";

const PRIMARY = "#66c3c6";
const DARK = "#082b2e";
const MID = "#0d4f52";
const LIGHT = "#e8f9f9";
const BORDER = "#b3e8ea";

export default function CancelPage() {
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleProceed = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/portal", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "手続き画面の起動に失敗しました");
        return;
      }
      window.location.href = body.url;
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f4fbfc", fontFamily: "'Noto Sans JP',sans-serif" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 16px 48px" }}>

        <div style={{ marginBottom: 20 }}>
          <a href="/mypage" style={{ fontSize: 12, color: PRIMARY, textDecoration: "none" }}>← マイページに戻る</a>
        </div>

        <h1 style={{ fontSize: 20, fontWeight: 900, color: DARK, marginBottom: 8 }}>解約・プラン変更のお手続き</h1>
        <p style={{ fontSize: 12, color: "#64748b", marginBottom: 24 }}>大手町調査室九課</p>

        <div style={{ background: "white", borderRadius: 16, border: `1px solid ${BORDER}`, padding: 24, marginBottom: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 900, color: DARK, marginBottom: 12 }}>ご確認事項</h2>
          <p style={{ fontSize: 13, color: "#334155", lineHeight: 1.9, margin: "0 0 14px" }}>
            解約は<strong>いつでも何度でも</strong>お手続きいただけます。継続利用の縛りはありません。
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ padding: "12px 14px", backgroundColor: LIGHT, borderRadius: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 900, color: MID, margin: "0 0 4px" }}>⬆️ 上位プランへの変更</p>
              <p style={{ fontSize: 12, color: "#334155", margin: 0, lineHeight: 1.7 }}>
                その場で新プランに切り替わり、差額を日割りでご請求します。
              </p>
            </div>
            <div style={{ padding: "12px 14px", backgroundColor: LIGHT, borderRadius: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 900, color: MID, margin: "0 0 4px" }}>⬇️ 下位プランへの変更・解約</p>
              <p style={{ fontSize: 12, color: "#334155", margin: 0, lineHeight: 1.7 }}>
                <strong>今の請求期間の終了日まで</strong>は現在のプランをご利用いただけます。期間終了と同時に切り替わり、<strong>日割りでの返金は行っておりません</strong>。
              </p>
            </div>
          </div>
          <p style={{ fontSize: 11, color: "#64748b", marginTop: 14, marginBottom: 0 }}>
            お手続きは、次のボタンから遷移するStripe社の安全な決済管理画面で行われます。
          </p>
        </div>

        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 20, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0 }}
          />
          <span style={{ fontSize: 12, color: DARK, lineHeight: 1.7 }}>
            上記の内容（請求期間終了時点での解約・返金なし）を理解した上で、手続きに進みます。
          </span>
        </label>

        <button
          onClick={handleProceed}
          disabled={!agreed || loading}
          style={{
            width: "100%",
            padding: "14px",
            backgroundColor: !agreed || loading ? "#cbd5e1" : PRIMARY,
            color: "white",
            border: "none",
            borderRadius: 10,
            cursor: !agreed || loading ? "not-allowed" : "pointer",
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          {loading ? "接続中..." : "解約・プラン変更の手続きへ進む"}
        </button>

        {error && (
          <p style={{ marginTop: 10, fontSize: 12, color: "#dc2626", textAlign: "center" }}>{error}</p>
        )}

        <div style={{ marginTop: 24, padding: "12px 14px", backgroundColor: LIGHT, borderRadius: 10, fontSize: 11, color: MID, lineHeight: 1.7 }}>
          💡 ログインしていない場合や、まだプランにご加入されていない場合は、お手続きを進めることができません。ご不明な点は
          <a href="/contact" style={{ color: PRIMARY, fontWeight: 700 }}>お問い合わせ</a>
          からご連絡ください。
        </div>

      </div>
    </div>
  );
}