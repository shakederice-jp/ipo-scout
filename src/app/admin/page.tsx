"use client";
import { useState } from "react";
import InitialPriceForm from "@/components/InitialPriceForm";

const ADMIN_PASSWORD = "otemachi9";

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [form, setForm] = useState({
    name: "", ticker: "", exchange: "グロース",
    listing_date: "", bb_start_date: "", apply_start_date: "",
  });
  const [loading, setLoading] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [autoResult, setAutoResult] = useState<string | null>(null);

  if (!authed) return (
    <div style={{ display:"flex", justifyContent:"center", alignItems:"center", height:"100vh", backgroundColor:"#f4fbfc" }}>
      <div style={{ background:"white", padding:"32px", borderRadius:"16px", border:"1px solid #b3e8ea", minWidth:"300px" }}>
        <h2 style={{ margin:"0 0 16px", fontSize:"16px", color:"#082b2e" }}>🔐 管理者ログイン</h2>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder="パスワード" style={{ width:"100%", padding:"10px", borderRadius:"8px", border:"1px solid #b3e8ea", marginBottom:"12px", boxSizing:"border-box" }}/>
        <button onClick={() => password === ADMIN_PASSWORD ? setAuthed(true) : alert("パスワードが違います")}
          style={{ width:"100%", padding:"10px", backgroundColor:"#66c3c6", color:"white", border:"none", borderRadius:"8px", cursor:"pointer", fontWeight:"700" }}>
          ログイン
        </button>
      </div>
    </div>
  );

  const handleSubmit = async () => {
    if (!form.name || !form.ticker || !form.listing_date) { alert("会社名・ティッカー・上場日は必須です"); return; }
    setLoading(true); setResult(null);
    try {
      const res = await fetch("/api/admin/add-ipo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.error) setResult("❌ エラー: " + data.error);
      else setResult("✅ 追加成功: " + data.name);
      setForm({ name:"", ticker:"", exchange:"グロース", listing_date:"", bb_start_date:"", apply_start_date:"" });
    } catch(e) { setResult("❌ 通信エラー"); }
    setLoading(false);
  };

  const handleAutoFetch = async () => {
    setAutoLoading(true); setAutoResult("IPOスケジュールを取得・分析中...");
    try {
      const res = await fetch("/api/admin/auto-fetch", { method: "POST" });
      const data = await res.json();
      if (data.error) setAutoResult("❌ エラー: " + data.error);
      else setAutoResult(`✅ 完了: ${data.added}件追加、${data.skipped}件スキップ（既存）${data.errors ? " / エラー: " + data.errors.join(", ") : ""}`);
    } catch(e) { setAutoResult("❌ 通信エラー"); }
    setAutoLoading(false);
  };

  const fields = [
    { key:"name", label:"会社名", placeholder:"例：バトンズ", required:true },
    { key:"ticker", label:"ティッカー", placeholder:"例：554A", required:true },
    { key:"listing_date", label:"上場日", placeholder:"例：2026-06-16", required:true },
    { key:"bb_start_date", label:"BB開始日", placeholder:"例：2026-06-02", required:false },
    { key:"apply_start_date", label:"申込開始日", placeholder:"例：2026-06-09", required:false },
  ];

  return (
    <div style={{ minHeight:"100vh", backgroundColor:"#f4fbfc", padding:"24px" }}>
      <div style={{ maxWidth:"480px", margin:"0 auto" }}>
        <h1 style={{ fontSize:"18px", color:"#082b2e", marginBottom:"24px" }}>📋 IPO銘柄管理（管理者）</h1>

        <div style={{ background:"white", padding:"24px", borderRadius:"16px", border:"2px solid #66c3c6", marginBottom:"24px" }}>
          <h2 style={{ margin:"0 0 8px", fontSize:"14px", color:"#082b2e" }}>🤖 最新IPOを自動取得</h2>
          <p style={{ fontSize:"12px", color:"#2a7a7e", margin:"0 0 4px" }}>
            IPOスケジュールサイトから新しい銘柄を自動取得し、ClaudeとGeminiのダブルチェックで分析してDBに追加します
          </p>
          <p style={{ fontSize:"11px", color:"#92400e", margin:"0 0 16px", backgroundColor:"#fffbeb", padding:"6px 8px", borderRadius:"6px" }}>
            ⚠️ 処理に30秒〜1分かかります。ボタンを押したら完了までお待ちください
          </p>
          <button onClick={handleAutoFetch} disabled={autoLoading}
            style={{ width:"100%", padding:"12px", backgroundColor: autoLoading ? "#b3e8ea" : "#0d4f52",
              color:"white", border:"none", borderRadius:"8px", cursor: autoLoading ? "default" : "pointer",
              fontWeight:"900", fontSize:"14px" }}>
            {autoLoading ? "⏳ 取得・分析中（しばらくお待ちください）..." : "🚀 最新IPOを自動取得する"}
          </button>
          {autoResult && <p style={{ marginTop:"12px", fontSize:"13px", color: autoResult.startsWith("✅") ? "#2a7a7e" : "#b91c1c" }}>{autoResult}</p>}
        </div>

        <div style={{ background:"white", padding:"24px", borderRadius:"16px", border:"1px solid #b3e8ea" }}>
          <h2 style={{ margin:"0 0 16px", fontSize:"14px", color:"#082b2e" }}>✏️ 手動で1件追加</h2>
          {fields.map(f => (
            <div key={f.key} style={{ marginBottom:"16px" }}>
              <label style={{ display:"block", fontSize:"12px", fontWeight:"700", color:"#2a7a7e", marginBottom:"6px" }}>
                {f.label}{f.required && " *"}
              </label>
              <input value={(form as any)[f.key]} onChange={e => setForm({...form, [f.key]: e.target.value})}
                placeholder={f.placeholder}
                style={{ width:"100%", padding:"10px", borderRadius:"8px", border:"1px solid #b3e8ea", boxSizing:"border-box", fontSize:"14px" }}/>
            </div>
          ))}
          <div style={{ marginBottom:"16px" }}>
            <label style={{ display:"block", fontSize:"12px", fontWeight:"700", color:"#2a7a7e", marginBottom:"6px" }}>取引所</label>
            <select value={form.exchange} onChange={e => setForm({...form, exchange: e.target.value})}
              style={{ width:"100%", padding:"10px", borderRadius:"8px", border:"1px solid #b3e8ea", boxSizing:"border-box", fontSize:"14px" }}>
              <option>グロース</option><option>スタンダード</option><option>プライム</option>
            </select>
          </div>
          <p style={{ fontSize:"11px", color:"#2a7a7e", margin:"0 0 16px" }}>✨ セクター・業態・AI分析・スコアはClaudeが自動生成します</p>
          <button onClick={handleSubmit} disabled={loading}
            style={{ width:"100%", padding:"12px", backgroundColor: loading ? "#b3e8ea" : "#66c3c6",
              color:"white", border:"none", borderRadius:"8px", cursor: loading ? "default" : "pointer",
              fontWeight:"900", fontSize:"14px" }}>
            {loading ? "AI分析中..." : "追加する"}
          </button>
          {result && <p style={{ marginTop:"12px", fontSize:"13px", color: result.startsWith("✅") ? "#2a7a7e" : "#b91c1c" }}>{result}</p>}
        </div>
        {/* ── ステータス自動更新 ── */}
        <div style={{ background:"white", padding:"24px", borderRadius:"16px", border:"1px solid #b3e8ea", marginBottom:"16px" }}>
          <p style={{ fontWeight:"900", fontSize:"14px", color:"#082b2e", marginBottom:"8px" }}>🔄 ステータス自動更新</p>
          <p style={{ fontSize:"12px", color:"#2a7a7e", marginBottom:"12px" }}>日付をもとに全銘柄のステータスを自動更新します</p>
          <button onClick={async () => {
            const r = await fetch("/api/admin/update-status", { method:"POST" });
            const d = await r.json();
            alert(d.updated !== undefined ? `✅ ${d.updated}件更新しました` : "エラーが発生しました");
          }} style={{ width:"100%", padding:"12px", backgroundColor:"#0d4f52", color:"white", border:"none", borderRadius:"8px", fontSize:"14px", fontWeight:"900", cursor:"pointer" }}>
            🔄 ステータスを今すぐ更新する
          </button>
        </div>

        {/* ── 初値・騰落率入力 ── */}
        <div style={{ background:"white", padding:"24px", borderRadius:"16px", border:"1px solid #b3e8ea", marginBottom:"16px" }}>
          <p style={{ fontWeight:"900", fontSize:"14px", color:"#082b2e", marginBottom:"16px" }}>📈 初値・騰落率の入力</p>
          <InitialPriceForm />
        </div>
        <a href="/" style={{ display:"block", textAlign:"center", marginTop:"16px", fontSize:"12px", color:"#2a7a7e" }}>← トップへ戻る</a>
      </div>
    </div>
  );
}