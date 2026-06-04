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

  // EDINET 7ステップ用state
  const [edinetCompanyId, setEdinetCompanyId] = useState("");
  const [edinetCompanyName, setEdinetCompanyName] = useState("");
  const [edinetDocId, setEdinetDocId] = useState("");
  const [stepLoading, setStepLoading] = useState<Record<string,boolean>>({});
  const [stepResult, setStepResult] = useState<Record<string,string|null>>({});

  useEffect(() => {
    if (!authed) return;
    fetch("/api/admin/companies").then(r => r.json()).then(setCompanies).catch(() => {});
  }, [authed]);

  const handleGenerateAnalysis = async (companyId: string) => {
    setAnalyzeLoading(prev => ({...prev, [companyId]: true}));
    setAnalyzeResult(prev => ({...prev, [companyId]: ""}));
    try {
      const res = await fetch("/api/analyze", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({id: companyId}),
      });
      const data = await res.json();
      if (data.error) setAnalyzeResult(prev => ({...prev, [companyId]: "❌ " + data.error}));
      else {
        setAnalyzeResult(prev => ({...prev, [companyId]: "✅ ③完了"}));
        fetch("/api/admin/companies").then(r => r.json()).then(setCompanies).catch(() => {});
      }
    } catch {
      setAnalyzeResult(prev => ({...prev, [companyId]: "❌ エラー"}));
    }
    setAnalyzeLoading(prev => ({...prev, [companyId]: false}));
  };

  const setStep = (key: string, loading: boolean, result?: string) => {
    setStepLoading(prev => ({...prev, [key]: loading}));
    if (result !== undefined) setStepResult(prev => ({...prev, [key]: result}));
  };

  // STEP1: EDINET取得
  const handleStep1 = async () => {
    if (!edinetCompanyId || !edinetCompanyName) { alert("銘柄IDと銘柄名を入力してください"); return; }
    setStep("1", true, "📥 EDINETから目論見書テキストを取得中...");
    ["2","3","4","5","6","7"].forEach(k => setStepResult(prev => ({...prev, [k]: null})));
    try {
      const res = await fetch("/api/edinet", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ company_id: edinetCompanyId, company_name: edinetCompanyName, edinet_doc_id: edinetDocId || undefined }),
      });
      const data = await res.json();
      setStep("1", false, data.error ? `❌ ${data.error}` : `${data.message}（${data.sections_found?.join("・")}）`);
    } catch { setStep("1", false, "❌ エラーが発生しました"); }
  };

  // STEP2: 構造化
  const handleStep2 = async () => {
    if (!edinetCompanyId) { alert("銘柄IDを入力してください"); return; }
    setStep("2", true, "🔧 財務データを構造化中...");
    try {
      const res = await fetch("/api/structure", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ company_id: edinetCompanyId }),
      });
      const data = await res.json();
      if (data.error) setStep("2", false, `❌ ${data.error}`);
      else {
        const p = data.preview;
        setStep("2", false, `${data.message}\n財務: ${p?.financials ?? "-"}\n公募売出: ${p?.public_shares ?? "-"}\nロックアップ: ${p?.lockup ?? "-"}\nリスク: ${p?.risks_count ?? 0}件`);
      }
    } catch { setStep("2", false, "❌ エラーが発生しました"); }
  };

  // STEP3: Sonnetスコア・シナリオ
  const handleStep3 = async () => {
    if (!edinetCompanyId) { alert("銘柄IDを入力してください"); return; }
    setStep("3", true, "🤖 Claudeがスコア・シナリオを生成中...");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ id: edinetCompanyId }),
      });
      const data = await res.json();
      if (data.error) setStep("3", false, `❌ ${data.error}`);
      else setStep("3", false, `✅ スコア生成完了！総合: ${data.total_score}/100（${data.grade}）\n超短期: ${data.ultra_short_grade} / 短期: ${data.short_grade} / 長期: ${data.long_grade}`);
    } catch { setStep("3", false, "❌ エラーが発生しました"); }
  };

  const handleAxes = async (period: string, stepNum: string, label: string) => {
    if (!edinetCompanyId) { alert("銘柄IDを入力してください"); return; }
    
    const axisMap: Record<string, string[]> = {
      ultra_short: ["float", "lockup", "timing"],
      short: ["valuation", "vc_sell", "growth"],
      long: ["management", "unit_econ", "competitor"],
    };
    const axes = axisMap[period];
    
    setStep(stepNum, true, `📊 ${label}（1/3）分析中...`);
    
    let allResults: any[] = [];
    
    for (let i = 0; i < axes.length; i++) {
      const axisId = axes[i];
      setStepResult(prev => ({...prev, [stepNum]: `📊 ${label}（${i+1}/3）${axisId}を分析中...`}));
      try {
        const res = await fetch("/api/axes", {
          method: "POST", headers: {"Content-Type": "application/json"},
          body: JSON.stringify({ company_id: edinetCompanyId, period, single_axis: axisId }),
        });
        const data = await res.json();
        if (data.error) {
          setStep(stepNum, false, `❌ ${axisId}でエラー: ${data.error}`);
          return;
        }
        allResults = [...allResults, ...(data.preview ?? [])];
      } catch {
        setStep(stepNum, false, `❌ ${axisId}でエラーが発生しました`);
        return;
      }
    }
    
    const preview = allResults.map((a: any) => `${a.id}:${a.grade}(${a.score}) ${a.chars}字`).join(" / ");
    setStep(stepNum, false, `✅ ${label}の詳細分析完了！\n${preview}`);
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
        method: "POST", headers: {"Content-Type": "application/json"},
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

  const stepBox = (num: string, color: string, title: string, desc: string, btnLabel: string, onClick: () => void) => {
    const isLoading = stepLoading[num];
    const res = stepResult[num];
    return (
      <div style={{ background: res?.startsWith("❌") ? "#fef2f2" : res ? "#f0fdf4" : "#f8fafc", borderRadius:"10px", padding:"14px", marginBottom:"12px", border:`1px solid ${res?.startsWith("❌") ? "#fecaca" : res ? "#bbf7d0" : "#e2e8f0"}` }}>
        <div style={{ fontSize:"12px", fontWeight:"900", color, marginBottom:"4px" }}>{"①②③④⑤⑥⑦"[parseInt(num)-1]} {title}</div>
        <p style={{ fontSize:"11px", color:"#64748b", marginBottom:"10px", margin:"4px 0 10px" }}>{desc}</p>
        <button onClick={onClick} disabled={isLoading}
          style={{ padding:"10px 16px", backgroundColor: isLoading ? "#94a3b8" : color, color:"white", border:"none", borderRadius:"8px", cursor: isLoading ? "default" : "pointer", fontWeight:"700", fontSize:"13px", width:"100%", marginBottom: res ? "8px" : "0" }}>
          {isLoading ? "処理中..." : btnLabel}
        </button>
        {res && <div style={{ fontSize:"11px", lineHeight:"1.7", padding:"8px 10px", borderRadius:"6px", backgroundColor: res.startsWith("❌") ? "#fef2f2" : "#f0fdf4", color: res.startsWith("❌") ? "#dc2626" : "#166534", whiteSpace:"pre-wrap" }}>{res}</div>}
      </div>
    );
  };

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

        {/* 銘柄一覧 */}
        <div style={sectionStyle}>
          <h2 style={{ fontSize:"14px", fontWeight:"900", color:"#082b2e", marginBottom:"16px" }}>📊 銘柄一覧・③クイック生成</h2>
          {companies.length === 0 ? (
            <p style={{ fontSize:"12px", color:"#64748b" }}>銘柄がありません</p>
          ) : companies.map(c => (
            <div key={c.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
              padding:"10px 12px", marginBottom:"8px", borderRadius:"8px",
              backgroundColor: c.analysis_summary ? "#f0fdf4" : "#fff7ed",
              border:`1px solid ${c.analysis_summary ? "#86efac" : "#fed7aa"}` }}>
              <div>
                <div style={{ fontWeight:"700", fontSize:"13px", color:"#082b2e" }}>{c.name}</div>
                <div style={{ fontSize:"11px", color:"#64748b", marginTop:"2px" }}>
                  {c.listing_date} ／ {c.sector ?? "未設定"}
                  {c.analysis_summary
                    ? <span style={{ color:"#16a34a", marginLeft:"8px" }}>✅ ③完了</span>
                    : <span style={{ color:"#ea580c", marginLeft:"8px" }}>⏳ 未生成</span>}
                  {c.analysis_axes_long
                    ? <span style={{ color:"#0891b2", marginLeft:"8px" }}>📊 詳細済</span>
                    : null}
                </div>
                {analyzeResult[c.id] && (
                  <div style={{ fontSize:"11px", marginTop:"4px", color: analyzeResult[c.id].startsWith("✅") ? "#16a34a" : "#dc2626" }}>
                    {analyzeResult[c.id]}
                  </div>
                )}
              </div>
              <button onClick={() => handleGenerateAnalysis(c.id)} disabled={analyzeLoading[c.id]}
                style={{ padding:"6px 12px", backgroundColor: analyzeLoading[c.id] ? "#94a3b8" : "#0e7490",
                  color:"white", border:"none", borderRadius:"6px", cursor: analyzeLoading[c.id] ? "default" : "pointer",
                  fontSize:"11px", fontWeight:"700", whiteSpace:"nowrap", flexShrink:0, marginLeft:"12px" }}>
                {analyzeLoading[c.id] ? "生成中..." : c.analysis_summary ? "③再生成" : "③生成"}
              </button>
            </div>
          ))}
        </div>

        {/* 初値・騰落率入力 */}
        <div style={sectionStyle}>
          <h2 style={{ fontSize:"14px", fontWeight:"900", color:"#082b2e", marginBottom:"16px" }}>📈 初値・騰落率入力</h2>
          <InitialPriceForm />
        </div>

        {/* EDINET 7ステップ */}
        <div style={{ ...sectionStyle, borderColor:"#a8d5e2", borderWidth:"2px" }}>
          <h2 style={{ fontSize:"14px", fontWeight:"900", color:"#082b2e", marginBottom:"4px" }}>📄 EDINET分析（7ステップ）</h2>
          <p style={{ fontSize:"11px", color:"#64748b", marginBottom:"16px" }}>①→②→③→④→⑤→⑥の順に実行してください。⑦は近日実装予定。</p>

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
              placeholder="例：S100XLWF" style={inputStyle}/>
          </div>

          {stepBox("1","#3b82f6","EDINETからテキスト取得","目論見書のテキストをDBに保存します（約10〜20秒）","📥 ① テキストを取得する", handleStep1)}
          {stepBox("2","#16a34a","財務データを構造化（Claude Haiku）","テキストから財務・株主・ロックアップ情報をJSON化します（約15〜25秒）","🔧 ② 財務データを構造化する", handleStep2)}
          {stepBox("3","#0e7490","スコア・シナリオ生成（Claude Sonnet）","総合スコア・A〜E判定・株価シナリオを生成します（約30〜40秒）","🤖 ③ スコア・シナリオを生成する", handleStep3)}
          {stepBox("4","#7c3aed","超短期3軸 詳細分析（Gemini Flash）","需給・ロックアップ・タイミングの詳細レポートを生成します（約30〜45秒）","📊 ④ 超短期3軸を詳細分析する", () => handleAxes("ultra_short","4","超短期3軸詳細"))}
          {stepBox("5","#b45309","短期3軸 詳細分析（Gemini Flash）","バリュエーション・VC売圧・成長性の詳細レポートを生成します（約30〜45秒）","📊 ⑤ 短期3軸を詳細分析する", () => handleAxes("short","5","短期3軸詳細"))}
          {stepBox("6","#065f46","長期3軸 詳細分析（Gemini Flash）","経営陣・ユニットエコノミクス・競合環境の詳細レポートを生成します（約30〜45秒）","📊 ⑥ 長期3軸を詳細分析する", () => handleAxes("long","6","長期3軸詳細"))}

          <div style={{ background:"#f1f5f9", borderRadius:"10px", padding:"14px", border:"1px solid #cbd5e1", opacity:0.6 }}>
            <div style={{ fontSize:"12px", fontWeight:"900", color:"#475569", marginBottom:"4px" }}>⑦ 市場・競合情報収集（Claude Sonnet + Web検索）</div>
            <p style={{ fontSize:"11px", color:"#94a3b8", margin:"0" }}>主幹事証券・同業PER比較・VC実績・直近同セクターIPO比較（近日実装予定）</p>
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