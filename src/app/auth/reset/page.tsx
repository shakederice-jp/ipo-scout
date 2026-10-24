"use client";
// 2026/10/24新設: パスワード再設定の画面。
// 流れ: ログイン画面の「パスワードを忘れた方はこちら」→ 再設定メール → メールのリンク(/auth/callback)で
// ログイン状態になる → この画面で新しいパスワードを入れる。
// リンクの期限が切れた・別のブラウザで開いたなどでログイン状態になっていないときは、やり直しを案内する。
import { useState, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setReady(!!data.session));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async () => {
    setError(null);
    if (password.length < 8) { setError("パスワードは8文字以上で入力してください"); return; }
    if (password !== confirm) { setError("確認用のパスワードが一致しません"); return; }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError("パスワードを変更できませんでした。リンクの有効期限が切れている場合は、もう一度再設定メールをご請求ください。");
      return;
    }
    setDone(true);
  };

  const input = { width:"100%", padding:"10px", borderRadius:"8px", border:"1px solid #b3e8ea", boxSizing:"border-box" as const, fontSize:"14px" };
  const label = { display:"block", fontSize:"12px", fontWeight:"700" as const, color:"#2a7a7e", marginBottom:"6px" };

  return (
    <div style={{ display:"flex", justifyContent:"center", alignItems:"center", minHeight:"100vh", backgroundColor:"#f4fbfc" }}>
      <div style={{ background:"white", padding:"32px", borderRadius:"16px", border:"1px solid #b3e8ea", width:"100%", maxWidth:"360px" }}>
        <h1 style={{ margin:"0 0 4px", fontSize:"18px", color:"#082b2e", fontWeight:"900" }}>📊 IPO企業情報AI分析レポート</h1>
        <p style={{ margin:"0 0 24px", fontSize:"11px", color:"#2a7a7e" }}>担当：大手町調査室九課</p>
        <div style={{ fontSize:"15px", fontWeight:"900", color:"#111", marginBottom:"14px" }}>新しいパスワードの設定</div>

        {ready === null && <p style={{ fontSize:"13px", color:"#2a7a7e" }}>確認しています...</p>}

        {ready === false && !done && (
          <div>
            <p style={{ fontSize:"13px", color:"#b91c1c", lineHeight:1.8, margin:"0 0 16px" }}>
              再設定のリンクが確認できませんでした。リンクの有効期限が切れたか、メールを開いたブラウザが、再設定を申し込んだブラウザと異なる可能性があります。お手数ですが、もう一度お試しください。
            </p>
            <a href="/auth" style={{ display:"block", textAlign:"center", padding:"12px", backgroundColor:"#66c3c6", color:"white", borderRadius:"8px", fontWeight:"900", fontSize:"14px", textDecoration:"none" }}>
              ログイン画面へ戻る
            </a>
          </div>
        )}

        {ready === true && !done && (
          <div>
            <div style={{ marginBottom:"16px" }}>
              <label style={label}>新しいパスワード</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="8文字以上" style={input} />
            </div>
            <div style={{ marginBottom:"20px" }}>
              <label style={label}>新しいパスワード（確認）</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="もう一度入力" style={input} />
            </div>
            {error && <p style={{ color:"#b91c1c", fontSize:"13px", margin:"0 0 16px", lineHeight:1.7 }}>{error}</p>}
            <button onClick={handleSubmit} disabled={loading}
              style={{ width:"100%", padding:"12px", backgroundColor: loading ? "#b3e8ea" : "#66c3c6", color:"white", border:"none", borderRadius:"8px", cursor: loading ? "default" : "pointer", fontWeight:"900", fontSize:"14px" }}>
              {loading ? "処理中..." : "パスワードを変更する"}
            </button>
          </div>
        )}

        {done && (
          <div>
            <p style={{ fontSize:"13px", color:"#2a7a7e", lineHeight:1.8, margin:"0 0 16px" }}>パスワードを変更しました。そのままご利用いただけます。</p>
            <a href="/" style={{ display:"block", textAlign:"center", padding:"12px", backgroundColor:"#66c3c6", color:"white", borderRadius:"8px", fontWeight:"900", fontSize:"14px", textDecoration:"none" }}>
              トップページへ
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
