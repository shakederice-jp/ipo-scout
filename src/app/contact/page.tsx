"use client";
import { useState } from "react";
import { Send, CheckCircle } from "lucide-react";

const C = {
  teal: "#66c3c6", nav: "#0d4f52", dark: "#082b2e",
  light: "#f0fafa", border: "#b3e8ea",
};

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", category: "bug", message: "" });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (form.message.trim().length < 10) {
      setError("お問い合わせ内容を10文字以上入力してください");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); }
      else { setDone(true); }
    } catch {
      setError("通信エラーが発生しました。しばらく経ってから再度お試しください。");
    }
    setLoading(false);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px", borderRadius: 10,
    border: `1px solid ${C.border}`, fontSize: 14, boxSizing: "border-box",
    fontFamily: "'Noto Sans JP',sans-serif", color: C.dark, outline: "none",
    backgroundColor: "white",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, color: C.nav,
    display: "block", marginBottom: 6,
  };

  if (done) return (
    <div style={{ backgroundColor: C.light, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ backgroundColor: "white", borderRadius: 20, border: `1px solid ${C.border}`, padding: "40px 32px", maxWidth: 480, width: "100%", textAlign: "center" }}>
        <CheckCircle size={48} color={C.teal} style={{ margin: "0 auto 16px" }} />
        <h2 style={{ fontSize: 20, fontWeight: 900, color: C.dark, marginBottom: 12 }}>
          お問い合わせを受け付けました
        </h2>
        <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.9, marginBottom: 8 }}>
          ご連絡いただきありがとうございます。<br/>
          メールアドレスをご入力の場合は、確認メールをお送りしました。
        </p>
        <p style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.8, marginBottom: 24 }}>
          いただいた内容はサービス改善の参考とさせていただきます。<br/>
          引き続きどうぞよろしくお願いいたします。
        </p>
        <a href="/" style={{ display: "inline-block", padding: "12px 28px", backgroundColor: C.teal, color: "white", borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
          トップページへ戻る
        </a>
      </div>
    </div>
  );

  return (
    <div style={{ backgroundColor: C.light, minHeight: "100vh", fontFamily: "'Noto Sans JP',sans-serif" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 16px 64px" }}>

        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: C.dark, marginBottom: 8 }}>お問い合わせ</h1>
          <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.9 }}>
            バグのご報告・分析内容へのご質問・機能改善のご提案など、お気づきの点をお気軽にお聞かせください。
            いただいたご意見はサービス向上に役立ててまいります。
          </p>
        </div>

        <div style={{ backgroundColor: "white", borderRadius: 16, border: `1px solid ${C.border}`, padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>

          {/* 種別 */}
          <div>
            <label style={labelStyle}>お問い合わせの種別 *</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inputStyle}>
              <option value="bug">🐛 バグ・不具合の報告</option>
              <option value="analysis">📊 分析内容への質問・指摘</option>
              <option value="feature">💡 機能改善のご提案</option>
              <option value="other">💬 その他</option>
            </select>
          </div>

          {/* 名前 */}
          <div>
            <label style={labelStyle}>お名前（任意）</label>
            <input
              type="text" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="例：山田 太郎"
              style={inputStyle}
            />
          </div>

          {/* メール */}
          <div>
            <label style={labelStyle}>メールアドレス（任意・返信をご希望の場合）</label>
            <input
              type="email" value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="例：example@email.com"
              style={inputStyle}
            />
            <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
              ご入力いただいた場合、受付確認メールをお送りします。
            </p>
          </div>

          {/* 内容 */}
          <div>
            <label style={labelStyle}>お問い合わせ内容 *</label>
            <textarea
              value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              placeholder="お気づきの点やご意見を、できるだけ具体的にお聞かせください。&#10;（例：〇〇銘柄の分析ページで△△が表示されません）"
              rows={6}
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.8 }}
            />
            <p style={{ fontSize: 11, color: form.message.length < 10 ? "#f87171" : "#94a3b8", marginTop: 4 }}>
              {form.message.length}文字（10文字以上必要）
            </p>
          </div>

          {/* エラー */}
          {error && (
            <div style={{ padding: "10px 14px", backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, fontSize: 13, color: "#b91c1c" }}>
              {error}
            </div>
          )}

          {/* 送信ボタン */}
          <button
            onClick={handleSubmit} disabled={loading}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px", backgroundColor: loading ? "#94a3b8" : C.nav, color: "white", border: "none", borderRadius: 12, fontWeight: 900, fontSize: 15, cursor: loading ? "default" : "pointer", fontFamily: "'Noto Sans JP',sans-serif" }}>
            <Send size={16} />
            {loading ? "送信中..." : "送信する"}
          </button>

          <p style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", lineHeight: 1.7 }}>
            ご意見・ご提案はサービス改善の参考とさせていただきますが、<br/>
            すべてのご要望にお応えできるとは限りません。あらかじめご了承ください。
          </p>
        </div>
      </div>
    </div>
  );
}