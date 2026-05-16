"use client";
import { useState } from "react";

const ADMIN_PASSWORD = "otemachi9";

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [form, setForm] = useState({
    name: "", ticker: "", exchange: "グロース",
    listing_date: "", bb_start_date: "", apply_start_date: "",
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

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
    if (!form.name || !form.ticker || !form.listing_date) {
      alert("会社名・ティッカー・上場日は必須です"); return;
    }
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
    } catch(e) {
      setResult("❌ 通信エラー");
    }
    setLoading(false);
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
        <h1 style={{ fontSize:"18px", color:"#082b2e", marginBottom:"24px" }}>📋 IPO銘柄追加（管理者）</h1>
        <div style={{ background:"white", padding:"24px", borderRadius:"16px", border:"1px solid #b3e8ea" }}>
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
          <p style={{ fontSize:"11px", color:"#2a7a7e", margin:"0 0 16px" }}>
            ✨ セクター・業態・AI分析・スコアはClaudeが自動生成します
          </p>
          <button onClick={handleSubmit} disabled={loading}
            style={{ width:"100%", padding:"12px", backgroundColor: loading ? "#b3e8ea" : "#66c3c6",
              color:"white", border:"none", borderRadius:"8px", cursor: loading ? "default" : "pointer",
              fontWeight:"900", fontSize:"14px" }}>
            {loading ? "AI分析中..." : "追加する"}
          </button>
          {result && <p style={{ marginTop:"12px", fontSize:"13px", color: result.startsWith("✅") ? "#2a7a7e" : "#b91c1c" }}>{result}</p>}
        </div>
        <a href="/" style={{ display:"block", textAlign:"center", marginTop:"16px", fontSize:"12px", color:"#2a7a7e" }}>← トップへ戻る</a>
      </div>
    </div>
  );
}