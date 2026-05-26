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

  // EDINET用state
  const [edinetCompanyId, setEdinetCompanyId] = useState("");
  const [edinetCompanyName, setEdinetCompanyName] = useState("");
  const [edinetDocId, setEdinetDocId] = useState("");
  const [edinetLoading, setEdinetLoading] = useState(false);
  const [edinetResult, setEdinetResult] = useState<string | null>(null);

  if (!authed) return (
    <div style={{ display:"flex", justifyContent:"center", alignItems:"center", height:"100vh", backgroundColor:"#f4fbfc" }}>
      <div style={{ background:"white", padding:"32px", borderRadius:"16px", border:"1px solid #b3e8ea", minWidth:"300px" }}>
        <h2 style={{ margin:"0 0 16px", fontSize:"16px", color:"#082b2e" }}>管理者ログイン</h2>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder="パスワードを入力" style={{ width:"100%", padding:"10px", borderRadius:"8px", border:"1px solid #b3e8ea", marginBottom:"12px", boxSizing:"border-box" }}/>
        <button onClick={() => password === ADMIN_PASSWORD ? setAuthed(true) : alert("パスワードが違います")}
          style={{ width:"100%", padding:"10px", backgroundColor:"#66c3c6", color:"white", border:"none", borderRadius:"8px", cursor:"pointer", fontWeight:"700" }}>
          ログイン
        </button>
      </div>
    </div>
  );

  const handleSubmit = async () => {
    if (!form.name || !form.ticker || !form.listing_date) { alert("銘柄名・証券コード・上場日は必須です"); return; }
    setLoading(true); setResult(null);
    try {
      const res = await fetch("/api/admin/add-ipo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.error) setResult("エラー: " + data.error);
      else setResult("追加成功: " + data.name);
      setForm({ name:"", ticker:"", exchange:"グロース", listing_date:"", bb_start_date:"", apply_start_date:"" });
    } catch(e) { setResult("エラーが発生しました"); }
    setLoading(false);
  };

  const handleAutoFetch = async () => {
    setAutoLoading(true); setAutoResult("IPO情報を自動取得中...");
    try {
      const res = await fetch("/api/admin/auto-fetch", { method: "POST" });
      const data = await res.json();
      if (data.error) setAutoResult("エラー: " + data.error);
      else setAutoResult(`完了: ${data.added}社追加・${data.skipped}社スキップ${data.errors ? " / エラー: " + data.errors.join(", ") : ""}`);
    } catch(e) { setAutoResult("エラーが発生しました"); }
    setAutoLoading(false);
  };

  const handleEdinetFetch = async () => {
    if (!edinetCompanyId || !edinetCompanyName) { alert("銘柄IDと銘柄名を入力してください"); return; }
    setEdinetLoading(true); setEdinetResult("EDINETから目論見書を取得中...");
    try {
      const res = await fetch("/api/edinet", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: edinetCompanyId,
          company_name: edinetCompanyName,
          edinet_doc_id: edinetDocId || undefined,
        }),
      });
      const data = await res.json();
      if (data.error) setEdinetResult("エラー: " + data.error);
      else setEdinetResult(`✅ ${data.message}（書類ID: ${data.doc_id}）取得セクション: ${data.sections_found?.join("・")}`);
    } catch(e) { setEdinetResult("エラーが発生しました"); }
    setEdinetLoading(false);
  };

  const fields = [
    { key:"name", label:"銘柄名", placeholder:"例：壱番屋ホールディングス", required:true },
    { key:"ticker", label:"証券コード", placeholder:"例：54A", required:true },
    { key:"listing_date", label:"上場日程", placeholder:"例：2026-06-16", required:true },
    { key:"bb_start_date", label:"BB開始日（任意）", placeholder:"例：2026-06-02", required:false },
    { key:"apply_start_date", label:"申込み開始日（任意）", placeholder:"例：2026-06-09", required:false },
  ];

  const inputStyle = { width:"100%", padding:"8px 10px", borderRadius:"8px", border:"1px solid #b3e8ea", boxSizing:"border-box" as const, fontSize:"13px" };
  const labelStyle = { fontSize:"11px", fontWeight:"700" as const, color:"#2a7a7e", marginBottom:"4px", display:"block" as const };
  const sectionStyle = { background:"white", borderRadius:"12px", padding:"20px", marginBottom:"16px", border:"1px solid #d1f5f7" };
  const btnStyle = (color: string) => ({ padding:"10px 20px", backgroundColor:color, color:"white", border:"none", borderRadius:"8px", cursor:"pointer", fontWeight:"700" as const, fontSize:"13px" });

  return (
    <div style={{ minHeight:"100vh", backgroundColor:"#f4fbfc", padding:"24px" }}>
      <div style={{ maxWidth:"480px", margin:"0 auto" }}>
        <h1 style={{ fontSize:"18px", fontWeight:"900", color:"#082b2e", marginBottom:"20px" }}>⚙️ 管理画面</h1>

        {/* 銘柄追加 */}
        <div style={sectionStyle}>
          <h2 style={{ fontSize:"14px", fontWeight:"900", color:"#082b2e", marginBottom:"16px" }}>📋 銘柄追加</h2>
          {fields.map(f => (
            <div key={f.key} style={{ marginBottom:"12px" }}>
              <label style={labelStyle}>{f.label}{f.required && " *"}</label>
              <input value={(form as any)[f.key]} onChange={e => setForm({...form, [f.key]: e.target.value})}
                placeholder={f.placeholder} style={inputStyle}/>
            </div>
          ))}
          <div style={{ marginBottom:"12px" }}>
            <label style={labelStyle}>取引所</label>
            <select value={form.exchange} onChange={e => setForm({...form, exchange: e.target.value})}
              style={inputStyle}>
              <option>グロース</option><option>スタンダード</option><option>プライム</option>
            </select>
          </div>
          <button onClick={handleSubmit} disabled={loading} style={btnStyle("#66c3c6")}>
            {loading ? "追加中..." : "銘柄を追加"}
          </button>
          {result && <p style={{ marginTop:"8px", fontSize:"12px", color: result.includes("エラー") ? "#e53e3e" : "#2a7a7e" }}>{result}</p>}
        </div>

        {/* 初値・騰落率入力 */}
        <div style={sectionStyle}>
          <h2 style={{ fontSize:"14px", fontWeight:"900", color:"#082b2e", marginBottom:"16px" }}>📈 初値・騰落率入力</h2>
          <InitialPriceForm />
        </div>

        {/* EDINET目論見書取得 */}
        <div style={{ ...sectionStyle, borderColor:"#a8d5e2" }}>
          <h2 style={{ fontSize:"14px", fontWeight:"900", color:"#082b2e", marginBottom:"4px" }}>📄 EDINET目論見書取得</h2>
          <p style={{ fontSize:"11px", color:"#64748b", marginBottom:"16px" }}>EDINETに目論見書が登録された後に実行してください</p>
          <div style={{ marginBottom:"12px" }}>
            <label style={labelStyle}>銘柄ID（SupabaseのID）*</label>
            <input value={edinetCompanyId} onChange={e => setEdinetCompanyId(e.target.value)}
              placeholder="例：13bb5096-7115-43b3-8227-4adf2953d1ba" style={inputStyle}/>
          </div>
          <div style={{ marginBottom:"12px" }}>
            <label style={labelStyle}>銘柄名 *</label>
            <input value={edinetCompanyName} onChange={e => setEdinetCompanyName(e.target.value)}
              placeholder="例：ギークリー" style={inputStyle}/>
          </div>
          <div style={{ marginBottom:"16px" }}>
            <label style={labelStyle}>EDINET書類ID（任意・空白で自動検索）</label>
            <input value={edinetDocId} onChange={e => setEdinetDocId(e.target.value)}
              placeholder="例：S100ABCD" style={inputStyle}/>
          </div>
          <button onClick={handleEdinetFetch} disabled={edinetLoading} style={btnStyle("#3b82f6")}>
            {edinetLoading ? "取得中..." : "📥 目論見書を取得・再分析"}
          </button>
          {edinetResult && <p style={{ marginTop:"8px", fontSize:"12px", color: edinetResult.includes("エラー") ? "#e53e3e" : "#2a7a7e", lineHeight:"1.6" }}>{edinetResult}</p>}
        </div>

        {/* 自動取得 */}
        <div style={sectionStyle}>
          <h2 style={{ fontSize:"14px", fontWeight:"900", color:"#082b2e", marginBottom:"8px" }}>🤖 IPO情報自動取得</h2>
          <button onClick={handleAutoFetch} disabled={autoLoading} style={btnStyle("#9b59b6")}>
            {autoLoading ? "取得中..." : "自動取得実行"}
          </button>
          {autoResult && <p style={{ marginTop:"8px", fontSize:"12px", color:"#2a7a7e" }}>{autoResult}</p>}
        </div>

      </div>
    </div>
  );
}