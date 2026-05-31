"use client";
import { useState, useEffect } from "react";
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
  const [companies, setCompanies] = useState<any[]>([]);
  const [analyzeLoading, setAnalyzeLoading] = useState<Record<string,boolean>>({});
  const [analyzeResult, setAnalyzeResult] = useState<Record<string,string>>({});

  // EDINET 3ステップ用state
  const [edinetCompanyId, setEdinetCompanyId] = useState("");
  const [edinetCompanyName, setEdinetCompanyName] = useState("");
  const [edinetDocId, setEdinetDocId] = useState("");
  const [step1Loading, setStep1Loading] = useState(false);
  const [step2Loading, setStep2Loading] = useState(false);
  const [step3Loading, setStep3Loading] = useState(false);
  const [step1Result, setStep1Result] = useState<string | null>(null);
  const [step2Result, setStep2Result] = useState<string | null>(null);
  const [step3Result, setStep3Result] = useState<string | null>(null);

  useEffect(() => {
    if (!authed) return;
    fetch("/api/admin/companies").then(r => r.json()).then(setCompanies).catch(() => {});
  }, [authed]);

  const handleGenerateAnalysis = async (companyId: string) => {
    setAnalyzeLoading(prev => ({...prev, [companyId]: true}));
    setAnalyzeResult(prev => ({...prev, [companyId]: ""}));
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({id: companyId}),
      });
      const data = await res.json();
      if (data.error) setAnalyzeResult(prev => ({...prev, [companyId]: "❌ " + data.error}));
      else {
        setAnalyzeResult(prev => ({...prev, [companyId]: "✅ 分析完了！"}));
        fetch("/api/admin/companies").then(r => r.json()).then(setCompanies).catch(() => {});
      }
    } catch {
      setAnalyzeResult(prev => ({...prev, [companyId]: "❌ エラーが発生しました"}));
    }
    setAnalyzeLoading(prev => ({...prev, [companyId]: false}));
  };

  // STEP1: EDINET取得
  const handleStep1 = async () => {
    if (!edinetCompanyId || !edinetCompanyName) { alert("銘柄IDと銘柄名を入力してください"); return; }
    setStep1Loading(true);
    setStep1Result("📥 EDINETから目論見書テキストを取得中...");
    setStep2Result(null);
    setStep3Result(null);
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
      if (data.error) setStep1Result("❌ " + data.error);
      else setStep1Result(`${data.message}（書類ID: ${data.doc_id}）取得セクション: ${data.sections_found?.join("・")}`);
    } catch { setStep1Result("❌ エラーが発生しました"); }
    setStep1Loading(false);
  };

  // STEP2: Gemini構造化
  const handleStep2 = async () => {
    if (!edinetCompanyId) { alert("銘柄IDを入力してください"); return; }
    setStep2Loading(true);
    setStep2Result("🔧 Geminiでデータを構造化中...");
    setStep3Result(null);
    try {
      const res = await fetch("/api/structure", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: edinetCompanyId }),
      });
      const data = await res.json();
      if (data.error) setStep2Result("❌ " + data.error);
      else {
        const preview = data.preview;
        setStep2Result(
          `${data.message}\n` +
          `事業: ${preview?.business ?? "-"}\n` +
          `財務: ${preview?.financials ?? "-"}\n` +
          `リスク: ${preview?.risks_count ?? 0}件`
        );
      }
    } catch { setStep2Result("❌ エラーが発生しました"); }
    setStep2Loading(false);
  };

  // STEP3: Claude分析
  const handleStep3 = async () => {
    if (!edinetCompanyId) { alert("銘柄IDを入力してください"); return; }
    setStep3Loading(true);
    setStep3Result("🤖 Claudeで分析レポートを生成中...");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: edinetCompanyId }),
      });
      const data = await res.json();
      if (data.error) setStep3Result("❌ " + data.error);
      else {
        setStep3Result(`✅ 分析完了！分析ページで結果を確認してください。（データソース: ${data.data_source}）`);
        fetch("/api/admin/companies").then(r => r.json()).then(setCompanies).catch(() => {});
      }
    } catch { setStep3Result("❌ エラーが発生しました"); }
    setStep3Loading(false);
  };

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
    } catch { setResult("エラーが発生しました"); }
    setLoading(false);
  };

  const handleAutoFetch = async () => {
    setAutoLoading(true); setAutoResult("IPO情報を自動取得中...");
    try {
      const res = await fetch("/api/admin/auto-fetch", { method: "POST" });
      const data = await res.json();
      if (data.error) setAutoResult("エラー: " + data.error);
      else setAutoResult(`完了: ${data.added}社追加・${data.skipped}社スキップ`);
    } catch { setAutoResult("エラーが発生しました"); }
    setAutoLoading(false);
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

  const stepBtn = (color: string, disabled: boolean) => ({
    padding:"10px 16px", backgroundColor: disabled ? "#94a3b8" : color,
    color:"white", border:"none", borderRadius:"8px",
    cursor: disabled ? "default" : "pointer",
    fontWeight:"700" as const, fontSize:"13px", width:"100%", marginBottom:"8px"
  });

  const resultStyle = (txt: string) => ({
    fontSize:"12px", lineHeight:"1.7", padding:"8px 10px", borderRadius:"6px",
    backgroundColor: txt.startsWith("❌") ? "#fef2f2" : "#f0fdf4",
    color: txt.startsWith("❌") ? "#dc2626" : "#166534",
    whiteSpace:"pre-wrap" as const, marginBottom:"8px"
  });

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
            <select value={form.exchange} onChange={e => setForm({...form, exchange: e.target.value})} style={inputStyle}>
              <option>グロース</option><option>スタンダード</option><option>プライム</option>
            </select>
          </div>
          <button onClick={handleSubmit} disabled={loading}
            style={{ padding:"10px 20px", backgroundColor: loading ? "#94a3b8" : "#66c3c6", color:"white", border:"none", borderRadius:"8px", cursor: loading ? "default" : "pointer", fontWeight:"700", fontSize:"13px" }}>
            {loading ? "追加中..." : "銘柄を追加"}
          </button>
          {result && <p style={{ marginTop:"8px", fontSize:"12px", color: result.includes("エラー") ? "#e53e3e" : "#2a7a7e" }}>{result}</p>}
        </div>

        {/* 銘柄一覧・分析生成 */}
        <div style={sectionStyle}>
          <h2 style={{ fontSize:"14px", fontWeight:"900", color:"#082b2e", marginBottom:"16px" }}>📊 銘柄一覧・分析生成</h2>
          {companies.length === 0 ? (
            <p style={{ fontSize:"12px", color:"#64748b" }}>銘柄がありません</p>
          ) : (
            companies.map(c => (
              <div key={c.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                padding:"10px 12px", marginBottom:"8px", borderRadius:"8px",
                backgroundColor: c.analysis_detail ? "#f0fdf4" : "#fff7ed",
                border:`1px solid ${c.analysis_detail ? "#86efac" : "#fed7aa"}` }}>
                <div>
                  <div style={{ fontWeight:"700", fontSize:"13px", color:"#082b2e" }}>{c.name}</div>
                  <div style={{ fontSize:"11px", color:"#64748b", marginTop:"2px" }}>
                    {c.listing_date} ／ {c.sector ?? "未設定"}
                    {c.analysis_detail
                      ? <span style={{ color:"#16a34a", marginLeft:"8px" }}>✅ 分析済み</span>
                      : <span style={{ color:"#ea580c", marginLeft:"8px" }}>⏳ 未生成</span>}
                    {c.structured_data
                      ? <span style={{ color:"#0891b2", marginLeft:"8px" }}>🔧 構造化済み</span>
                      : null}
                  </div>
                  {analyzeResult[c.id] && (
                    <div style={{ fontSize:"11px", marginTop:"4px",
                      color: analyzeResult[c.id].startsWith("✅") ? "#16a34a" : "#dc2626" }}>
                      {analyzeResult[c.id]}
                    </div>
                  )}
                </div>
                <button onClick={() => handleGenerateAnalysis(c.id)} disabled={analyzeLoading[c.id]}
                  style={{ padding:"6px 12px",
                    backgroundColor: analyzeLoading[c.id] ? "#94a3b8" : "#0e7490",
                    color:"white", border:"none", borderRadius:"6px",
                    cursor: analyzeLoading[c.id] ? "default" : "pointer",
                    fontSize:"11px", fontWeight:"700", whiteSpace:"nowrap", flexShrink:0, marginLeft:"12px" }}>
                  {analyzeLoading[c.id] ? "生成中..." : c.analysis_detail ? "再生成" : "分析生成"}
                </button>
              </div>
            ))
          )}
        </div>

        {/* 初値・騰落率入力 */}
        <div style={sectionStyle}>
          <h2 style={{ fontSize:"14px", fontWeight:"900", color:"#082b2e", marginBottom:"16px" }}>📈 初値・騰落率入力</h2>
          <InitialPriceForm />
        </div>

        {/* EDINET 3ステップ */}
        <div style={{ ...sectionStyle, borderColor:"#a8d5e2", borderWidth:"2px" }}>
          <h2 style={{ fontSize:"14px", fontWeight:"900", color:"#082b2e", marginBottom:"4px" }}>📄 EDINET目論見書取得（3ステップ）</h2>
          <p style={{ fontSize:"11px", color:"#64748b", marginBottom:"16px" }}>
            タイムアウト対策として3段階に分けています。①→②→③の順に実行してください。
          </p>

          {/* 共通入力 */}
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
          <div style={{ marginBottom:"20px" }}>
            <label style={labelStyle}>EDINET書類ID（任意・空白で自動検索）</label>
            <input value={edinetDocId} onChange={e => setEdinetDocId(e.target.value)}
              placeholder="例：S100ABCD" style={inputStyle}/>
          </div>

          {/* STEP 1 */}
          <div style={{ background:"#f0f9ff", borderRadius:"10px", padding:"14px", marginBottom:"12px", border:"1px solid #bae6fd" }}>
            <div style={{ fontSize:"12px", fontWeight:"900", color:"#0369a1", marginBottom:"8px" }}>
              ① EDINETからテキスト取得
            </div>
            <p style={{ fontSize:"11px", color:"#64748b", marginBottom:"10px" }}>目論見書のテキストをDBに保存します（約10〜20秒）</p>
            <button onClick={handleStep1} disabled={step1Loading} style={stepBtn("#3b82f6", step1Loading)}>
              {step1Loading ? "取得中..." : "📥 ① テキストを取得する"}
            </button>
            {step1Result && <div style={resultStyle(step1Result)}>{step1Result}</div>}
          </div>

          {/* STEP 2 */}
          <div style={{ background:"#f0fdf4", borderRadius:"10px", padding:"14px", marginBottom:"12px", border:"1px solid #bbf7d0" }}>
            <div style={{ fontSize:"12px", fontWeight:"900", color:"#15803d", marginBottom:"8px" }}>
              ② Geminiで財務データを構造化
            </div>
            <p style={{ fontSize:"11px", color:"#64748b", marginBottom:"10px" }}>取得テキストから財務・株主・リスク情報をJSON化します（約15〜25秒）</p>
            <button onClick={handleStep2} disabled={step2Loading} style={stepBtn("#16a34a", step2Loading)}>
              {step2Loading ? "構造化中..." : "🔧 ② Geminiで構造化する"}
            </button>
            {step2Result && <div style={resultStyle(step2Result)}>{step2Result}</div>}
          </div>

          {/* STEP 3 */}
          <div style={{ background:"#fdf4ff", borderRadius:"10px", padding:"14px", border:"1px solid #e9d5ff" }}>
            <div style={{ fontSize:"12px", fontWeight:"900", color:"#7c3aed", marginBottom:"8px" }}>
              ③ Claudeで分析レポート生成
            </div>
            <p style={{ fontSize:"11px", color:"#64748b", marginBottom:"10px" }}>構造化データをもとにClaudeが9軸スコア・シナリオ・インサイトを生成します（約30〜40秒）</p>
            <button onClick={handleStep3} disabled={step3Loading} style={stepBtn("#7c3aed", step3Loading)}>
              {step3Loading ? "生成中..." : "🤖 ③ Claudeで分析する"}
            </button>
            {step3Result && <div style={resultStyle(step3Result)}>{step3Result}</div>}
          </div>
        </div>

        {/* 自動取得 */}
        <div style={sectionStyle}>
          <h2 style={{ fontSize:"14px", fontWeight:"900", color:"#082b2e", marginBottom:"8px" }}>🤖 IPO情報自動取得</h2>
          <button onClick={handleAutoFetch} disabled={autoLoading}
            style={{ padding:"10px 20px", backgroundColor: autoLoading ? "#94a3b8" : "#9b59b6", color:"white", border:"none", borderRadius:"8px", cursor: autoLoading ? "default" : "pointer", fontWeight:"700", fontSize:"13px" }}>
            {autoLoading ? "取得中..." : "自動取得実行"}
          </button>
          {autoResult && <p style={{ marginTop:"8px", fontSize:"12px", color:"#2a7a7e" }}>{autoResult}</p>}
        </div>

      </div>
    </div>
  );
}