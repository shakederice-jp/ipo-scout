"use client";
import { useState, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refCode, setRefCode] = useState("");

  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    if (typeof window !== "undefined") {
      // 2026/9/6修正: 紹介リンクはトップページ(/?ref=コード)に案内する作りのため、
      // トップページ等を見てから登録画面に来た場合はURLに?refが付いていない。
      // その場合は、ReferralCapture.tsx がlayout側で保存しておいたコードを
      // localStorageから拾う(URL側にあれば従来通りそちらを優先)。
      const urlRef = new URLSearchParams(window.location.search).get("ref");
      if (urlRef) {
        setRefCode(urlRef);
      } else {
        try {
          const stored = localStorage.getItem("pendingReferralCode");
          if (stored) {
            const parsed = JSON.parse(stored);
            const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;
            if (parsed?.code && Date.now() - (parsed.savedAt ?? 0) < THIRTY_DAYS_MS) {
              setRefCode(parsed.code);
            }
          }
        } catch {}
      }
    }
  }, []);

  const handleSubmit = async () => {
    setLoading(true); setError(null); setMessage(null);
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });

    if (error) {
      setError(error.message);
    } else {
      // 2026/9/6修正: 以前は紹介コードがある場合、確認メール送信自体のメッセージが
      // 表示されない(登録できたのに何も起きていないように見える)バグがあったため修正。
      // あわせて、紹介コードの適用が成功/失敗したかをはっきり本人に伝えるようにした
      // (以前は成功しても失敗しても画面上は何も分からず、気づけないままだった)。
      let referralNote = "";
      if (refCode.trim() && data?.user?.id) {
        try {
          const res = await fetch("/api/referral", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ referral_code: refCode.trim(), user_id: data.user.id }),
          });
          const json = await res.json().catch(() => ({} as any));
          if (res.ok && json?.success) {
            referralNote = " 🎉紹介特典を適用しました（メール確認後、あなたと紹介者様に2ヶ月無料が付与されます）。";
            try { localStorage.removeItem("pendingReferralCode"); } catch {}
          } else {
            const reason =
              json?.error === "invalid code" ? "紹介コードが見つかりませんでした。" :
              json?.error === "self referral" ? "ご自身の紹介コードは利用できません。" :
              json?.error === "already referred" ? "このアカウントは既に紹介特典を利用済みです。" :
              "紹介コードの適用に失敗しました。";
            referralNote = ` ${reason}（登録自体は完了しています）`;
          }
        } catch (e) {
          console.error("referral apply failed", e);
          referralNote = " 紹介コードの適用中に通信エラーが発生しました（登録自体は完了しています）。";
        }
      }
      setMessage(`確認メールを送信しました。メールをご確認ください。${referralNote}`);
    }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError("メールアドレスまたはパスワードが違います");
      else location.href = "/";
    }
    setLoading(false);
  };

  return (
    <div style={{ display:"flex", justifyContent:"center", alignItems:"center", minHeight:"100vh", backgroundColor:"#f4fbfc" }}>
      <div style={{ background:"white", padding:"32px", borderRadius:"16px", border:"1px solid #b3e8ea", width:"100%", maxWidth:"360px" }}>
        <h1 style={{ margin:"0 0 4px", fontSize:"18px", color:"#082b2e", fontWeight:"900" }}>
          📊 IPO企業情報AI分析レポート
        </h1>
        <p style={{ margin:"0 0 24px", fontSize:"11px", color:"#2a7a7e" }}>担当：大手町調査室九課</p>

        <div style={{ display:"flex", marginBottom:"24px", borderRadius:"8px", overflow:"hidden", border:"1px solid #b3e8ea" }}>
          {(["login", "signup"] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setError(null); setMessage(null); }}
              style={{ flex:1, padding:"10px", border:"none", cursor:"pointer", fontWeight:"700", fontSize:"13px",
                backgroundColor: mode === m ? "#66c3c6" : "white",
                color: mode === m ? "white" : "#2a7a7e" }}>
              {m === "login" ? "ログイン" : "新規登録"}
            </button>
          ))}
        </div>

        <div style={{ marginBottom:"16px" }}>
          <label style={{ display:"block", fontSize:"12px", fontWeight:"700", color:"#2a7a7e", marginBottom:"6px" }}>メールアドレス</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="example@email.com"
            style={{ width:"100%", padding:"10px", borderRadius:"8px", border:"1px solid #b3e8ea", boxSizing:"border-box", fontSize:"14px" }}/>
        </div>

        <div style={{ marginBottom:"24px" }}>
          <label style={{ display:"block", fontSize:"12px", fontWeight:"700", color:"#2a7a7e", marginBottom:"6px" }}>パスワード</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="8文字以上"
            style={{ width:"100%", padding:"10px", borderRadius:"8px", border:"1px solid #b3e8ea", boxSizing:"border-box", fontSize:"14px" }}
          />
        </div>

        {mode === "signup" && (
          <div style={{ marginBottom:"24px" }}>
            <label style={{ display:"block", fontSize:"12px", fontWeight:"700", color:"#2a7a7e", marginBottom:"6px" }}>紹介コード（任意）</label>
            <input type="text" value={refCode} onChange={e => setRefCode(e.target.value)}
              placeholder="お持ちの方はコードを入力"
              style={{ width:"100%", padding:"10px", borderRadius:"8px", border:"1px solid #b3e8ea", boxSizing:"border-box", fontSize:"14px" }}
            />
            <p style={{ fontSize:"11px", color:"#66c3c6", margin:"6px 0 0", fontWeight:"700" }}>
              紹介コードを入力して登録すると、あなたと紹介者の両方に2ヶ月間無料特典が付与されます
            </p>
          </div>
        )}

        {error && <p style={{ color:"#b91c1c", fontSize:"13px", margin:"0 0 16px" }}>{error}</p>}
        {message && <p style={{ color:"#2a7a7e", fontSize:"13px", margin:"0 0 16px" }}>{message}</p>}

        <button onClick={handleSubmit} disabled={loading}
          style={{ width:"100%", padding:"12px", backgroundColor: loading ? "#b3e8ea" : "#66c3c6",
            color:"white", border:"none", borderRadius:"8px", cursor: loading ? "default" : "pointer",
            fontWeight:"900", fontSize:"14px" }}>
          {loading ? "処理中..." : mode === "login" ? "ログイン" : "登録する"}
        </button>

        <a href="/" style={{ display:"block", textAlign:"center", marginTop:"16px", fontSize:"12px", color:"#2a7a7e" }}>
          ← トップへ戻る
        </a>
      </div>
    </div>
  );
}