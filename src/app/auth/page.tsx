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
      // 2026/9/26改修: 紹介コードは、ここではその人のアカウント情報に預けておくだけにした。
      // 実際の特典の付与は、確認メールのリンクを押してログインが完了した時点で、サーバーが本人を
      // 確認してから行う(src/lib/referral.ts・src/app/auth/callback/route.ts)。以前はここから会員IDを
      // 送って即時に付与していたため、架空のIDで特典を何度でも発生させられる問題があった。
      const pendingCode = refCode.trim().toUpperCase();
      const { data, error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback`,
        ...(pendingCode ? { data: { pending_referral_code: pendingCode } } : {}),
      },
    });

    if (error) {
      setError(error.message);
    } else {
      let referralNote = "";
      if (pendingCode) {
        try { localStorage.removeItem("pendingReferralCode"); } catch {}
        if (data?.session) {
          // メール確認なしでその場でログインできた場合は、すぐに適用を試みる
          try {
            const res = await fetch("/api/referral", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ referral_code: pendingCode }) });
            const json = await res.json().catch(() => ({} as any));
            referralNote = res.ok && json?.success
              ? " 🎉紹介特典を適用しました（あなたと紹介者様の有料分析が2ヶ月間読み放題になりました）。"
              : json?.error === "invalid code" ? " 紹介コードが見つかりませんでした（登録自体は完了しています）。"
              : json?.error === "self referral" ? " ご自身の紹介コードは利用できません（登録自体は完了しています）。"
              : json?.error === "already referred" ? " このアカウントは既に紹介特典を利用済みです。"
              : " 紹介コードの適用に失敗しました（登録自体は完了しています）。";
          } catch {
            referralNote = " 紹介コードの適用中に通信エラーが発生しました（登録自体は完了しています）。";
          }
        } else {
          referralNote = " 紹介コードを受け付けました。メール内のリンクから登録を完了すると、あなたと紹介者様の有料分析が2ヶ月間読み放題になります。";
        }
      }
      setMessage(`確認メールを送信しました。メールをご確認ください。${referralNote}`);
    }
    } else {
      const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError("メールアドレスまたはパスワードが違います");
      else {
        // 2026/9/26追加: 確認メールのリンクを別の端末で開いた等で、紹介特典がまだ適用されていない場合は
        // ログインのタイミングで適用する(条件チェックはサーバー側。対象外なら何もしない)
        if ((signInData?.user?.user_metadata as any)?.pending_referral_code) {
          try { await fetch("/api/referral", { method: "POST" }); } catch {}
        }
        location.href = "/";
      }
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
              紹介コードを入力して登録すると、あなたと紹介者の両方が有料分析を2ヶ月間読み放題になります
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