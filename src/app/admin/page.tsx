"use client";
import { useState, useEffect } from "react";
import InitialPriceForm from "@/components/InitialPriceForm";

const ADMIN_PASSWORD = "otemachi9";

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoResult, setAutoResult] = useState<string | null>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<any | null>(null);
  const [edinetDocId, setEdinetDocId] = useState("");
  const [stepLoading, setStepLoading] = useState<Record<string,boolean>>({});
  const [stepResult, setStepResult] = useState<Record<string,string|null>>({});

  useEffect(() => {
    if (!authed) return;
    fetch("/api/admin/companies").then(r => r.json()).then(setCompanies).catch(() => {});
  }, [authed]);

  const setStep = (key: string, loading: boolean, result?: string) => {
    setStepLoading(prev => ({...prev, [key]: loading}));
    if (result !== undefined) setStepResult(prev => ({...prev, [key]: result}));
  };

  const handleSelectCompany = (c: any) => {
    setSelectedCompany(c);
    setEdinetDocId("");
    setStepResult({});
    setStepLoading({});
  };

  const handleStep1 = async () => {
    if (!selectedCompany) return;
    setStep("1", true, undefined);
    ["2","3","4","5","6","7"].forEach(k => setStepResult(prev => ({...prev, [k]: null})));
    try {
      const res = await fetch("/api/edinet", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ company_id: selectedCompany.id, company_name: selectedCompany.name, edinet_doc_id: edinetDocId || undefined }),
      });
      const data = await res.json();
      setStep("1", false, data.error ? `❌ ${data.error}` : `${data.message}・${data.sections_found?.join("、")}・荏`);
    } catch { setStep("1", false, "❌ 通信エラー"); }
  };

  const handleStep2 = async () => {
    if (!selectedCompany) return;
    setStep("2", true, undefined);
    try {
      const res = await fetch("/api/structure", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ company_id: selectedCompany.id }),
      });
      const data = await res.json();
      if (data.error) setStep("2", false, `❌ ${data.error}`);
      else {
        const p = data.preview;
        setStep("2", false, `${data.message}\n財務: ${p?.financials ?? "-"}\n公募: ${p?.public_shares ?? "-"}\nロックアップ: ${p?.lockup ?? "-"}\nリスク: ${p?.risks_count ?? 0}件`);
      }
    } catch { setStep("2", false, "❌ 通信エラー"); }
  };

  const handleStep3 = async () => {
    if (!selectedCompany) return;
    setStep("3", true, undefined);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ id: selectedCompany.id }),
      });
      const data = await res.json();
      if (data.error) setStep("3", false, `❌ ${data.error}`);
      else setStep("3", false, `✅ スコア: ${data.total_score}/100・${data.grade}・超短期: ${data.ultra_short_grade} / 短期: ${data.short_grade} / 長期: ${data.long_grade}`);
    } catch { setStep("3", false, "❌ 通信エラー"); }
  };

  const handleAxes = async (period: string, stepNum: string, label: string) => {
    if (!selectedCompany) return;
    const axisMap: Record<string, string[]> = {
      ultra_short: ["float", "lockup", "timing"],
      short: ["valuation", "vc_sell", "growth"],
      long: ["management", "unit_econ", "competitor"],
    };
    const axes = axisMap[period];
    setStep(stepNum, true, `⏳ ${label} 分析中 1/3...`);
    const allResults: any[] = [];
    for (let i = 0; i < axes.length; i++) {
      const axisId = axes[i];
      setStepResult(prev => ({...prev, [stepNum]: `⏳ ${label} ${i+1}/3・${axisId} 分析中...`}));
      try {
        const res = await fetch("/api/axes", {
          method: "POST", headers: {"Content-Type": "application/json"},
          body: JSON.stringify({ company_id: selectedCompany.id, period, single_axis: axisId }),
        });
        const data = await res.json();
        if (data.error) { setStep(stepNum, false, `❌ ${axisId}: ${data.error}`); return; }
        allResults.push(data.axis_result);
      } catch { setStep(stepNum, false, `❌ ${axisId} 通信エラー`); return; }
    }
    setStepResult(prev => ({...prev, [stepNum]: `⏳ ${label} 保存中...`}));
    try {
      const saveRes = await fetch("/api/axes", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ company_id: selectedCompany.id, period, save_results: allResults }),
      });
      const saveData = await saveRes.json();
      if (saveData.error) { setStep(stepNum, false, `❌ 保存エラー: ${saveData.error}`); return; }
    } catch { setStep(stepNum, false, "❌ 保存通信エラー"); return; }
    const preview = allResults.map((a: any) => `${a.id}:${a.grade}(${a.report?.length ?? 0}文字)`).join(" / ");
    setStep(stepNum, false, `✅ ${label} 完了・${preview}`);
  };

  const handleAutoFetch = async () => {
    setAutoLoading(true); setAutoResult("IPO情報を取得中...");
    try {
      const res = await fetch("/api/admin/auto-fetch", { method: "POST" });
      const data = await res.json();
      if (data.error) setAutoResult("❌ " + data.error);
      else setAutoResult(`✅ ${data.added}件追加・${data.skipped}件スキップ`);
    } catch { setAutoResult("❌ 通信エラー"); }
    setAutoLoading(false);
  };

  const inputStyle = { width:"100%", padding:"8px 10px", borderRadius:"8px", border:"1px solid #b3e8ea", boxSizing:"border-box" as const, fontSize:"13px" };
  const labelStyle = { fontSize:"11px", fontWeight:"700" as const, color:"#2a7a7e", marginBottom:"4px", display:"block" as const };
  const sectionStyle = { background:"white", borderRadius:"12px", padding:"20px", marginBottom:"16px", border:"1px solid #d1f5f7" };

  const stepBox = (num: string, color: string, title: string, desc: string, btnLabel: string, onClick: () => void) => {
    const isLoading = stepLoading[num];
    const res = stepResult[num];
    return (
      <div style={{ background: res?.startsWith("❌") ? "#fef2f2" : res ? "#f0fdf4" : "#f8fafc", borderRadius:"10px", padding:"14px", marginBottom:"12px", border:`1px solid ${res?.startsWith("❌") ? "#fecaca" : res ? "#bbf7d0" : "#e2e8f0"}` }}>
        <div style={{ fontWeight:"900", color, marginBottom:"4px" }}>{`${"①②③④⑤⑥⑦"[parseInt(num)-1]}`} {title}</div>
        <p style={{ fontSize:"11px", color:"#64748b", marginBottom:"10px", margin:"4px 0 10px" }}>{desc}</p>
        <button onClick={onClick} disabled={isLoading}
          style={{ padding:"10px 16px", backgroundColor: isLoading ? "#94a3b8" : color, color:"white", border:"none", borderRadius:"8px", cursor: isLoading ? "default" : "pointer", fontWeight:"700", fontSize:"13px", width:"100%", marginBottom: res ? "8px" : "0" }}>
          {isLoading ? "処理中..." : btnLabel}
        </button>
        {res && <div style={{ fontSize:"11px", lineHeight:"1.7", padding:"8px 10px", borderRadius:"6px", backgroundColor: res.startsWith("❌") ? "#fef2f2" : "#f0fdf4", color: res.startsWith("❌") ? "#dc2626" : "#166534", whiteSpace:"pre-wrap" }}>{res}</div>}
      </div>
    );
  };

  if (!authed) return (
    <div style={{ display:"flex", justifyContent:"center", alignItems:"center", height:"100vh", backgroundColor:"#f4fbfc" }}>
      <div style={{ background:"white", padding:"32px", borderRadius:"16px", border:"1px solid #b3e8ea", minWidth:"300px" }}>
        <h2 style={{ margin:"0 0 16px", fontSize:"16px", color:"#082b2e" }}>管理画面</h2>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder="パスワードを入力" style={{ width:"100%", padding:"10px", borderRadius:"8px", border:"1px solid #b3e8ea", marginBottom:"12px", boxSizing:"border-box" }}/>
        <button onClick={() => password === ADMIN_PASSWORD ? setAuthed(true) : alert("パスワードが違います")}
          style={{ width:"100%", padding:"10px", backgroundColor:"#66c3c6", color:"white", border:"none", borderRadius:"8px", cursor:"pointer", fontWeight:"700" }}>
          ログイン
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", backgroundColor:"#f4fbfc", padding:"24px" }}>
      <div style={{ maxWidth:"560px", margin:"0 auto" }}>
        <h1 style={{ fontSize:"18px", fontWeight:"900", color:"#082b2e", marginBottom:"20px" }}>⚙️ 管理画面</h1>

        {/* 1. IPO情報自動取得 */}
        <div style={sectionStyle}>
          <h2 style={{ fontSize:"14px", fontWeight:"900", color:"#082b2e", marginBottom:"8px" }}>📡 IPO情報自動取得</h2>
          <button onClick={handleAutoFetch} disabled={autoLoading}
            style={{ padding:"10px 20px", backgroundColor: autoLoading ? "#94a3b8" : "#9b59b6", color:"white", border:"none", borderRadius:"8px", cursor: autoLoading ? "default" : "pointer", fontWeight:"700", fontSize:"13px" }}>
            {autoLoading ? "取得中..." : "自動取得実行"}
          </button>
          {autoResult && <p style={{ marginTop:"8px", fontSize:"12px", color:"#2a7a7e" }}>{autoResult}</p>}
        </div>

        {/* 2. EDINET分析（銘柄選択→7ステップ） */}
        <div style={sectionStyle}>
          <h2 style={{ fontSize:"14px", fontWeight:"900", color:"#082b2e", marginBottom:"4px" }}>🔬 EDINET分析（7ステップ）</h2>
          <p style={{ fontSize:"11px", color:"#64748b", marginBottom:"16px" }}>①→②→③→④→⑤→⑥の順に実行してください。</p>

          {/* 銘柄選択 */}
          <div style={{ marginBottom:"16px" }}>
            <label style={labelStyle}>銘柄を選択 *</label>
            <select onChange={e => {
              const c = companies.find(x => x.id === e.target.value);
              if (c) handleSelectCompany(c);
            }} style={inputStyle} value={selectedCompany?.id ?? ""}>
              <option value="">-- 銘柄を選択してください --</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}（{c.listing_date}）</option>
              ))}
            </select>
          </div>

          {selectedCompany && (
            <>
              <div style={{ background:"#f0fdf4", borderRadius:"8px", padding:"10px 12px", marginBottom:"16px", fontSize:"12px", color:"#166534" }}>
                ✅ 選択中：<strong>{selectedCompany.name}</strong>（ID: {selectedCompany.id}）
              </div>
              <div style={{ marginBottom:"16px" }}>
                <label style={labelStyle}>EDINET書類ID（任意・空白で自動検索）</label>
                <input value={edinetDocId} onChange={e => setEdinetDocId(e.target.value)}
                  placeholder="例：S100XLWF" style={inputStyle}/>
              </div>
              {stepBox("1","#3b82f6","EDINETからテキスト取得","目論見書のテキストをDBに保存します（約10〜20秒）","① テキストを取得する", handleStep1)}
              {stepBox("2","#16a34a","財務データを構造化（Claude Haiku）","テキストから財務・株主・ロックアップ情報をJSON化します（約15〜25秒）","② 財務データを構造化する", handleStep2)}
              {stepBox("3","#0e7490","スコア・シナリオ生成（Claude Sonnet）","総合スコア・A〜E判定・株価シナリオを生成します（約30〜40秒）","③ スコア・シナリオを生成する", handleStep3)}
              {stepBox("4","#7c3aed","超短期3軸 詳細分析（Gemini Flash）","需給・ロックアップ・タイミングの詳細レポートを生成します（約30〜45秒）","④ 超短期3軸を詳細分析する", () => handleAxes("ultra_short","4","超短期3軸"))}
              {stepBox("5","#b45309","短期3軸 詳細分析（Gemini Flash）","バリュエーション・VC売圧・成長性の詳細レポートを生成します（約30〜45秒）","⑤ 短期3軸を詳細分析する", () => handleAxes("short","5","短期3軸"))}
              {stepBox("6","#065f46","長期3軸 詳細分析（Gemini Flash）","経営陣・ユニットエコノミクス・競合環境の詳細レポートを生成します（約30〜45秒）","⑥ 長期3軸を詳細分析する", () => handleAxes("long","6","長期3軸"))}
              <div style={{ background:"#f1f5f9", borderRadius:"10px", padding:"14px", border:"1px solid #cbd5e1", opacity:0.6 }}>
                <div style={{ fontSize:"12px", fontWeight:"900", color:"#475569", marginBottom:"4px" }}>⑦ 市場・競合情報収集（Claude Sonnet + Web検索）</div>
                <p style={{ fontSize:"11px", color:"#94a3b8", margin:"0" }}>主幹事証券・同業PER比較・VC実績・直近同セクターIPO比較（近日実装予定）</p>
              </div>
            </>
          )}
        </div>

        {/* 3. 初値・騰落率入力 */}
        <div style={sectionStyle}>
          <h2 style={{ fontSize:"14px", fontWeight:"900", color:"#082b2e", marginBottom:"16px" }}>📝 初値・騰落率入力</h2>
          <InitialPriceForm />
        </div>

      </div>
    </div>
  );
}