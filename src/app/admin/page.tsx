"use client";
import { useState, useEffect } from "react";
import InitialPriceForm from "@/components/InitialPriceForm";

const ADMIN_PASSWORD = "otemachi9";

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [groupAOpen, setGroupAOpen] = useState(false);
  const [groupCOpen, setGroupCOpen] = useState(false);

  // グループA
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoResult, setAutoResult] = useState<string | null>(null);
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifyResult, setNotifyResult] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthResult, setHealthResult] = useState<any | null>(null);
  const [dbCheckLoading, setDbCheckLoading] = useState(false);
  const [dbCheckResult, setDbCheckResult] = useState<any | null>(null);

  // グループB
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<any | null>(null);
  const [edinetDocId, setEdinetDocId] = useState("");
  const [stepLoading, setStepLoading] = useState<Record<string,boolean>>({});
  const [stepResult, setStepResult] = useState<Record<string,string|null>>({});
  const [vizLoading, setVizLoading] = useState(false);
  const [vizResult, setVizResult] = useState<string | null>(null);
  const [ipoPriceInput, setIpoPriceInput] = useState("");
  const [ipoPriceLoading, setIpoPriceLoading] = useState(false);
  const [ipoPriceResult, setIpoPriceResult] = useState<string | null>(null);
  const [allAxesLoading, setAllAxesLoading] = useState(false);
  const [edinetSearchLoading, setEdinetSearchLoading] = useState(false);
  const [edinetSearchResult, setEdinetSearchResult] = useState<string | null>(null);
  const [bulkEdinetLoading, setBulkEdinetLoading] = useState(false);
  const [bulkEdinetResult, setBulkEdinetResult] = useState<string | null>(null);

  // グループC
  const [compLoading, setCompLoading] = useState(false);
  const [compResult, setCompResult] = useState<string | null>(null);
  const [edinetResult, setEdinetResult] = useState("");
  const [econEvents, setEconEvents] = useState<any[]>([]);
  const [econDate, setEconDate] = useState("");
  const [econType, setEconType] = useState("FOMC");
  const [econLabel, setEconLabel] = useState("");
  const [econLoading, setEconLoading] = useState(false);
  const [econResult, setEconResult] = useState<string | null>(null);

  useEffect(() => {
    if (!authed) return;
    fetch("/api/admin/companies").then(r => r.json()).then(setCompanies).catch(() => {});
    fetch("/api/admin/economic-events").then(r => r.json()).then(data => {
      if (Array.isArray(data)) setEconEvents(data);
    }).catch(() => {});
  }, [authed]);

  const setStep = (key: string, loading: boolean, result?: string) => {
    setStepLoading(prev => ({...prev, [key]: loading}));
    if (result !== undefined) setStepResult(prev => ({...prev, [key]: result}));
  };

  const handleSelectCompany = (c: any) => {
    setSelectedCompany(c);
    setEdinetDocId(c.edinet_doc_id ?? "");
    setStepResult({});
    setStepLoading({});
    setVizResult(null);
    setIpoPriceInput(c.ipo_price != null ? String(c.ipo_price) : "");
    setIpoPriceResult(null);
  };

  // ステップ関数
  const handleStep1 = async () => {
    if (!selectedCompany) return;
    setStep("1", true);
    try {
      const res = await fetch("/api/edinet", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ company_id: selectedCompany.id, company_name: selectedCompany.name, edinet_doc_id: edinetDocId || undefined }),
      });
      const data = await res.json();
      setStep("1", false, data.error ? `❌ ${data.error}` : `✅ ${data.message}`);
    } catch { setStep("1", false, "❌ 通信エラー"); }
  };

  const handleStep7 = async () => {
    if (!selectedCompany) return;
    setStep("7", true);
    try {
      const res = await fetch("/api/market", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ companyId: selectedCompany.id }),
      });
      const data = await res.json();
      setStep("7", false, data.error ? `❌ ${data.error}` : `✅ 完了・主幹事:${data.data?.lead_underwriter ?? "不明"}・競合${data.data?.competitors?.length ?? 0}社`);
    } catch { setStep("7", false, "❌ 通信エラー"); }
  };

  const handleStep2 = async () => {
    if (!selectedCompany) return;
    setStep("2", true);
    try {
      const res = await fetch("/api/structure", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ company_id: selectedCompany.id }),
      });
      const data = await res.json();
      setStep("2", false, data.error ? `❌ ${data.error}` : `✅ ${data.message}`);
    } catch { setStep("2", false, "❌ 通信エラー"); }
  };

  const handleStep3 = async () => {
    if (!selectedCompany) return;
    setStep("3", true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ id: selectedCompany.id }),
      });
      const data = await res.json();
      setStep("3", false, data.error ? `❌ ${data.error}` : `✅ スコア: ${data.total_score}/100・${data.grade}ランク`);
    } catch { setStep("3", false, "❌ 通信エラー"); }
  };

  const runAxes = async (period: string, label: string, stepNum: string) => {
    const axisMap: Record<string, string[]> = {
      ultra_short: ["float", "lockup", "timing"],
      short: ["valuation", "vc_sell", "growth"],
      long: ["management", "unit_econ", "competitor"],
    };
    const axes = axisMap[period];
    const totalSteps = axes.length * 2;
    const allResults: any[] = [];
    for (let i = 0; i < axes.length; i++) {
      const axisId = axes[i];
      let combinedText = "";
      let axisLabel = "", axisScore = 0, axisGrade = "C";
      for (let part = 1; part <= 2; part++) {
        const stepIndex = i * 2 + part;
        setStepResult(prev => ({...prev, [stepNum]: `⏳ ${label} ${stepIndex}/${totalSteps}・${axisId}（${part}/2）分析中...`}));
        try {
          const res = await fetch("/api/axes", {
            method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ company_id: selectedCompany.id, period, single_axis: axisId, part }),
          });
          const data = await res.json();
          if (data.error) { setStep(stepNum, false, `❌ ${axisId}: ${data.error}`); return false; }
          combinedText += (part === 2 ? "\n\n" : "") + (data.text ?? "");
          axisLabel = data.label; axisScore = data.score; axisGrade = data.grade;
        } catch { setStep(stepNum, false, `❌ ${axisId} 通信エラー`); return false; }
      }
      allResults.push({ id: axisId, label: axisLabel, score: axisScore, grade: axisGrade, report: combinedText.trim() });
    }
    setStepResult(prev => ({...prev, [stepNum]: `⏳ ${label} 保存中...`}));
    try {
      const saveRes = await fetch("/api/axes", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ company_id: selectedCompany.id, period, save_results: allResults }),
      });
      const saveData = await saveRes.json();
      if (saveData.error) { setStep(stepNum, false, `❌ 保存エラー: ${saveData.error}`); return false; }
    } catch { setStep(stepNum, false, "❌ 保存通信エラー"); return false; }
    const preview = allResults.map((a: any) => `${a.id}:${a.grade}`).join("/");
    setStep(stepNum, false, `✅ ${label} 完了（${preview}）`);
    return true;
  };

  // ④⑤⑥一括実行
  const handleAllAxes = async () => {
    if (!selectedCompany) return;
    setAllAxesLoading(true);
    setStep("4", true); setStep("5", true); setStep("6", true);
    const ok4 = await runAxes("ultra_short", "超短期3軸", "4");
    if (!ok4) { setAllAxesLoading(false); return; }
    const ok5 = await runAxes("short", "短期3軸", "5");
    if (!ok5) { setAllAxesLoading(false); return; }
    await runAxes("long", "長期3軸", "6");
    setAllAxesLoading(false);
  };

  const handleVisualize = async () => {
    if (!selectedCompany) return;
    setVizLoading(true);
    const chartTypes = [
      "revenue_chart","shareholders_chart","valuation_table","market_structure_chart",
      "ipo_summary_table","use_of_proceeds_table","risk_table","shareholders_lockup_table","key_metrics_table",
    ];
    const labels: Record<string,string> = {
      revenue_chart:"売上・利益", shareholders_chart:"株主構成", valuation_table:"IPO概要",
      market_structure_chart:"株式構成・市場比較", ipo_summary_table:"IPO条件", use_of_proceeds_table:"資金使途",
      risk_table:"リスク表", shareholders_lockup_table:"大株主・LU", key_metrics_table:"主要経営指標",
    };
    const merged: Record<string, any> = {};
    for (let i = 0; i < chartTypes.length; i++) {
      const type = chartTypes[i];
      setVizResult(`⏳ ${labels[type]} 生成中 (${i+1}/${chartTypes.length})...`);
      try {
        const res = await fetch("/api/visualize", {
          method: "POST", headers: {"Content-Type": "application/json"},
          body: JSON.stringify({ companyId: selectedCompany.id, chart_type: type }),
        });
        const data = await res.json();
        if (data.error) { setVizResult(`❌ ${labels[type]}: ${data.error}`); setVizLoading(false); return; }
        Object.assign(merged, data.data);
      } catch { setVizResult(`❌ 通信エラー`); setVizLoading(false); return; }
    }
    setVizResult("⏳ 保存中...");
    try {
      const saveRes = await fetch("/api/visualize", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ companyId: selectedCompany.id, save_results: merged }),
      });
      const saveData = await saveRes.json();
      setVizResult(saveData.success ? "✅ 視覚化データ生成完了" : `❌ 保存エラー: ${saveData.error}`);
    } catch { setVizResult("❌ 保存通信エラー"); }
    finally { setVizLoading(false); }
  };

  const handleSetIpoPrice = async () => {
    if (!selectedCompany) return;
    setIpoPriceLoading(true); setIpoPriceResult(null);
    try {
      const res = await fetch("/api/admin/set-ipo-price", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ company_id: selectedCompany.id, ipo_price: ipoPriceInput }),
      });
      const data = await res.json();
      setIpoPriceResult(data.error ? `❌ ${data.error}` : "✅ 保存しました");
    } catch { setIpoPriceResult("❌ 通信エラー"); }
    setIpoPriceLoading(false);
  };

  const handleBulkEdinetSearch = async () => {
    setBulkEdinetLoading(true); setBulkEdinetResult(null);
    const targets = companies.filter(c => !c.edinet_doc_id);
    if (targets.length === 0) { setBulkEdinetResult("✅ 全銘柄の書類IDが設定済みです"); setBulkEdinetLoading(false); return; }
    const results: string[] = [];
    for (const c of targets) {
      try {
        const res = await fetch("/api/admin/find-edinet-doc", {
          method: "POST", headers: {"Content-Type": "application/json"},
          body: JSON.stringify({ company_name: c.name }),
        });
        const data = await res.json();
        if (data.error) { results.push(`❌ ${c.name}: ${data.error}`); }
        else {
          // DBに保存
          await fetch("/api/admin/set-edinet-doc-id", {
            method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ company_id: c.id, edinet_doc_id: data.doc_id }),
          });
          results.push(`✅ ${c.name}: ${data.doc_id}`);
        }
      } catch { results.push(`❌ ${c.name}: 通信エラー`); }
    }
    setBulkEdinetResult(results.join("\n"));
    // 一覧を再取得
    fetch("/api/admin/companies").then(r => r.json()).then(setCompanies).catch(() => {});
    setBulkEdinetLoading(false);
  };

  const handleCompetitor = async () => {
    if (!selectedCompany) return;
    setCompLoading(true); setCompResult(null);
    try {
      const res = await fetch("/api/competitor", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ company_id: selectedCompany.id }),
      });
      const data = await res.json();
      if (data.error) setCompResult(`❌ ${data.error}`);
      else setCompResult(data.results.map((r: any) =>
        r.error ? `❌ ${r.name}: ${r.error}` : `✅ ${r.name}: 売上${r.revenue}億`
      ).join("\n"));
    } catch { setCompResult("❌ 通信エラー"); }
    setCompLoading(false);
  };

  const handleAutoFetch = async () => {
    setAutoLoading(true); setAutoResult("IPO情報を取得中...");
    try {
      const res = await fetch("/api/admin/auto-fetch", { method: "POST" });
      const data = await res.json();
      setAutoResult(data.error ? `❌ ${data.error}` : `✅ ${data.added}件追加・${data.skipped}件スキップ`);
    } catch { setAutoResult("❌ 通信エラー"); }
    setAutoLoading(false);
  };

  const handleTestNotify = async () => {
    setNotifyLoading(true); setNotifyResult(null);
    try {
      const res = await fetch("/api/admin/send-notify", { method: "POST" });
      const data = await res.json();
      setNotifyResult(data.error ? `❌ ${data.error}` : `✅ 送信完了・${data.sent}件`);
    } catch { setNotifyResult("❌ 通信エラー"); }
    setNotifyLoading(false);
  };

  const handleHealthCheck = async () => {
    setHealthLoading(true); setHealthResult(null);
    try {
      const res = await fetch("/api/admin/health", { headers: { "x-admin-password": "otemachi9" } });
      setHealthResult(await res.json());
    } catch (e) { setHealthResult({ ok: false, error: String(e) }); }
    setHealthLoading(false);
  };

  const handleDbCheck = async () => {
    setDbCheckLoading(true); setDbCheckResult(null);
    try {
      const res = await fetch("/api/cron/db-check", { headers: { authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? "otemachi9"}` } });
      setDbCheckResult(await res.json());
    } catch (e) { setDbCheckResult({ ok: false, error: String(e) }); }
    setDbCheckLoading(false);
  };

  const handleEdinetCodes = () => {
    window.open("https://disclosure2.edinet-fsa.go.jp/weee0010.aspx", "_blank");
    setEdinetResult("📋 新しいタブでEDINETのダウンロードページを開きました。CSVを取得後、edinet_companiesテーブルにインポートしてください。");
  };

  const handleAddEconEvent = async () => {
    if (!econDate || !econType) return;
    setEconLoading(true); setEconResult(null);
    try {
      const res = await fetch("/api/admin/economic-events", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ event_date: econDate, event_type: econType, label: econLabel || null }),
      });
      const data = await res.json();
      if (data.error) setEconResult(`❌ ${data.error}`);
      else {
        setEconResult("✅ 追加しました");
        setEconDate(""); setEconLabel("");
        const updated = await fetch("/api/admin/economic-events").then(r => r.json());
        if (Array.isArray(updated)) setEconEvents(updated);
      }
    } catch { setEconResult("❌ 通信エラー"); }
    setEconLoading(false);
  };

  const handleDeleteEconEvent = async (id: string) => {
    if (!confirm("このイベントを削除しますか？")) return;
    try {
      await fetch("/api/admin/economic-events", {
        method: "DELETE", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ id }),
      });
      setEconEvents(prev => prev.filter(e => e.id !== id));
    } catch {}
  };

  // スタイル定数
  const inputStyle = { width:"100%", padding:"8px 10px", borderRadius:"8px", border:"1px solid #b3e8ea", boxSizing:"border-box" as const, fontSize:"13px" };
  const labelStyle = { fontSize:"11px", fontWeight:"700" as const, color:"#2a7a7e", marginBottom:"4px", display:"block" as const };
  const sectionStyle = { background:"white", borderRadius:"12px", padding:"20px", marginBottom:"12px", border:"1px solid #d1f5f7" };

  const StepRow = ({ num, color, title, desc, btnLabel, onClick, disabled }: any) => {
    const isLoading = stepLoading[num];
    const res = stepResult[num];
    const isErr = res?.startsWith("❌");
    return (
      <div style={{ borderRadius:10, padding:"12px 14px", marginBottom:10, border:`1px solid ${isErr?"#fecaca":res?"#bbf7d0":"#e2e8f0"}`, background:isErr?"#fef2f2":res?"#f0fdf4":"#f8fafc" }}>
        <div style={{ fontWeight:900, color, fontSize:13, marginBottom:3 }}>{title}</div>
        <p style={{ fontSize:11, color:"#64748b", margin:"2px 0 8px" }}>{desc}</p>
        <button onClick={onClick} disabled={isLoading || disabled}
          style={{ padding:"8px 14px", backgroundColor:isLoading||disabled?"#94a3b8":color, color:"white", border:"none", borderRadius:8, cursor:isLoading||disabled?"default":"pointer", fontWeight:700, fontSize:12, width:"100%", marginBottom:res?"6px":0 }}>
          {isLoading ? "処理中..." : btnLabel}
        </button>
        {res && <div style={{ fontSize:11, lineHeight:1.7, padding:"6px 8px", borderRadius:6, background:isErr?"#fef2f2":"#f0fdf4", color:isErr?"#dc2626":"#166534", whiteSpace:"pre-wrap" }}>{res}</div>}
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
        <h1 style={{ fontSize:"18px", fontWeight:900, color:"#082b2e", marginBottom:"20px" }}>⚙️ 管理画面</h1>

        {/* ═══ グループA: 自動実行(折りたたみ) ═══ */}
        <div style={{ ...sectionStyle, padding:"0", overflow:"hidden" }}>
          <button onClick={() => setGroupAOpen(v => !v)}
            style={{ width:"100%", padding:"16px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", background:"#0d4f52", border:"none", cursor:"pointer", borderRadius:groupAOpen?"12px 12px 0 0":"12px" }}>
            <div style={{ fontWeight:900, fontSize:14, color:"white" }}>🤖 自動実行ツール</div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:11, color:"rgba(255,255,255,0.7)" }}>ヘルスチェック・DB整合性・IPO取得・メール通知</span>
              <span style={{ color:"white", fontSize:12, transform:groupAOpen?"rotate(180deg)":"none", display:"inline-block", transition:"transform 0.2s" }}>▼</span>
            </div>
          </button>
          {groupAOpen && (
            <div style={{ padding:"16px 20px", display:"flex", flexDirection:"column", gap:10 }}>

              {/* ヘルスチェック */}
              <div>
                <div style={{ fontWeight:700, fontSize:13, color:"#082b2e", marginBottom:6 }}>🩺 システムヘルスチェック</div>
                <button onClick={handleHealthCheck} disabled={healthLoading}
                  style={{ padding:"8px 14px", backgroundColor:healthLoading?"#94a3b8":"#0d4f52", color:"white", border:"none", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:12 }}>
                  {healthLoading ? "確認中..." : "ヘルスチェックを実行"}
                </button>
                {healthResult && (
                  <div style={{ marginTop:8, fontSize:11, color:healthResult.ok?"#166534":"#b91c1c" }}>
                    {healthResult.ok ? "✅ 全システム正常" : "⚠️ 一部に問題があります"}
                    {healthResult.results && Object.entries(healthResult.results).map(([key, val]: [string, any]) => (
                      <div key={key} style={{ marginTop:4, padding:"4px 8px", borderRadius:6, background:val.ok?"#f0fdf4":"#fef2f2" }}>
                        {val.ok?"✅":"❌"} {{"supabase":"Supabase DB","claude":"Claude API","edinet":"EDINET API","last_cron":"直近Cron"}[key]??key}: {val.detail}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <hr style={{ border:"none", borderTop:"1px solid #e2e8f0" }}/>

              {/* DB整合性 */}
              <div>
                <div style={{ fontWeight:700, fontSize:13, color:"#082b2e", marginBottom:6 }}>🔍 DB整合性チェック <span style={{ fontSize:10, color:"#94a3b8" }}>（毎週月曜自動）</span></div>
                <button onClick={handleDbCheck} disabled={dbCheckLoading}
                  style={{ padding:"8px 14px", backgroundColor:dbCheckLoading?"#94a3b8":"#7c3aed", color:"white", border:"none", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:12 }}>
                  {dbCheckLoading ? "確認中..." : "整合性チェックを実行"}
                </button>
                {dbCheckResult && (
                  <div style={{ marginTop:8, fontSize:11 }}>
                    <div style={{ color:(dbCheckResult.issues?.length??0)===0?"#166534":"#d97706", fontWeight:700 }}>
                      {(dbCheckResult.issues?.length??0)===0 ? "✅ 問題なし" : `⚠️ ${dbCheckResult.issues?.length}件の問題を検出`}
                    </div>
                    {dbCheckResult.issues?.map((issue: string, i: number) => (
                      <div key={i} style={{ marginTop:4, padding:"4px 8px", background:"#fffbeb", borderRadius:6, color:"#374151", whiteSpace:"pre-wrap" }}>{issue}</div>
                    ))}
                  </div>
                )}
              </div>

              <hr style={{ border:"none", borderTop:"1px solid #e2e8f0" }}/>

              {/* IPO自動取得 */}
              <div>
                <div style={{ fontWeight:700, fontSize:13, color:"#082b2e", marginBottom:6 }}>📡 IPO情報自動取得</div>
                <button onClick={handleAutoFetch} disabled={autoLoading}
                  style={{ padding:"8px 14px", backgroundColor:autoLoading?"#94a3b8":"#9b59b6", color:"white", border:"none", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:12 }}>
                  {autoLoading ? "取得中..." : "自動取得実行"}
                </button>
                {autoResult && <p style={{ marginTop:6, fontSize:11, color:"#2a7a7e" }}>{autoResult}</p>}
              </div>

              <hr style={{ border:"none", borderTop:"1px solid #e2e8f0" }}/>

              {/* メール通知 */}
              <div>
                <div style={{ fontWeight:700, fontSize:13, color:"#082b2e", marginBottom:4 }}>📧 メール通知送信 <span style={{ fontSize:10, color:"#94a3b8" }}>（毎週金曜18時自動）</span></div>
                <p style={{ fontSize:11, color:"#64748b", margin:"0 0 8px" }}>翌週のBB開始・申込開始・上場銘柄がある場合に送信</p>
                <button onClick={handleTestNotify} disabled={notifyLoading}
                  style={{ padding:"8px 14px", backgroundColor:notifyLoading?"#94a3b8":"#0369a1", color:"white", border:"none", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:12 }}>
                  {notifyLoading ? "送信中..." : "通知メールを今すぐ送信"}
                </button>
                {notifyResult && <p style={{ marginTop:6, fontSize:11, color:notifyResult.startsWith("❌")?"#dc2626":"#166534" }}>{notifyResult}</p>}
              </div>
            </div>
          )}
        </div>

        {/* ═══ グループB: 銘柄分析(メイン) ═══ */}
        <div style={sectionStyle}>
          <h2 style={{ fontSize:"15px", fontWeight:900, color:"#082b2e", marginBottom:4 }}>🔬 銘柄分析</h2>
          <p style={{ fontSize:11, color:"#64748b", marginBottom:16 }}>①→⑦→②→③→④⑤⑥一括→視覚化の順に実行してください。</p>

{/* 一括EDINET書類ID取得 */}
<div style={{ marginBottom:14, padding:"12px 14px", backgroundColor:"#f0fafa", borderRadius:10, border:"1px solid #b3e8ea" }}>
            <div style={{ fontWeight:700, fontSize:13, color:"#082b2e", marginBottom:6 }}>
              📋 書類ID未設定銘柄を一括検索
              <span style={{ fontSize:10, color:"#94a3b8", marginLeft:6 }}>
                ({companies.filter(c => !c.edinet_doc_id).length}件が未設定)
              </span>
            </div>
            <button onClick={handleBulkEdinetSearch} disabled={bulkEdinetLoading}
              style={{ padding:"8px 14px", backgroundColor:bulkEdinetLoading?"#94a3b8":"#0369a1", color:"white", border:"none", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:12 }}>
              {bulkEdinetLoading ? "検索中...（しばらくお待ちください）" : "🔍 一括でEDINET書類IDを検索・保存"}
            </button>
            {bulkEdinetResult && (
              <div style={{ marginTop:8, fontSize:11, lineHeight:1.8, padding:"8px 10px", backgroundColor:"white", borderRadius:8, border:"1px solid #e2e8f0", whiteSpace:"pre-wrap", maxHeight:120, overflowY:"auto" }}>
                {bulkEdinetResult}
              </div>
            )}
          </div>

          {/* 銘柄選択 */}
          <div style={{ marginBottom:14 }}>
            <label style={labelStyle}>銘柄を選択 *</label>
            <select onChange={e => { const c = companies.find(x => x.id === e.target.value); if (c) handleSelectCompany(c); }}
              style={inputStyle} value={selectedCompany?.id ?? ""}>
              <option value="">-- 銘柄を選択してください --</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}（{c.listing_date}）</option>)}
            </select>
          </div>

          {selectedCompany && (
            <>
              <div style={{ background:"#f0fdf4", borderRadius:8, padding:"8px 12px", marginBottom:14, fontSize:12, color:"#166534" }}>
                ✅ 選択中：<strong>{selectedCompany.name}</strong>（ID: {selectedCompany.id}）
              </div>

              {/* IPO公開価格 */}
              <div style={{ background:"#fffbeb", borderRadius:8, padding:12, marginBottom:14, border:"1px solid #fde68a" }}>
                <label style={labelStyle}>IPO公開価格（円）※決定後に入力。PER・PBRの自動計算に使われます</label>
                <div style={{ display:"flex", gap:8 }}>
                  <input type="number" value={ipoPriceInput} onChange={e => setIpoPriceInput(e.target.value)} placeholder="例：1290" style={{ ...inputStyle, flex:1 }}/>
                  <button onClick={handleSetIpoPrice} disabled={ipoPriceLoading}
                    style={{ padding:"8px 14px", backgroundColor:ipoPriceLoading?"#94a3b8":"#d97706", color:"white", border:"none", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:12, whiteSpace:"nowrap" }}>
                    {ipoPriceLoading ? "保存中..." : "保存"}
                  </button>
                </div>
                {ipoPriceResult && <p style={{ marginTop:6, fontSize:11, color:ipoPriceResult.startsWith("❌")?"#dc2626":"#166534" }}>{ipoPriceResult}</p>}
              </div>

              {/* EDINET書類ID */}
              <div style={{ marginBottom:14 }}>
                <label style={labelStyle}>EDINET書類ID（任意・空白で自動検索）</label>
                <div style={{ display:"flex", gap:8 }}>
                  <input value={edinetDocId} onChange={e => setEdinetDocId(e.target.value)}
                    placeholder="例：S100XLWF" style={{ ...inputStyle, flex:1 }}/>
                  <button
                    onClick={async () => {
                      if (!selectedCompany) return;
                      setEdinetSearchLoading(true); setEdinetSearchResult(null);
                      try {
                        const res = await fetch("/api/admin/find-edinet-doc", {
                          method: "POST", headers: {"Content-Type": "application/json"},
                          body: JSON.stringify({ company_name: selectedCompany.name }),
                        });
                        const data = await res.json();
                        if (data.error) setEdinetSearchResult(`❌ ${data.error}`);
                        else { setEdinetDocId(data.doc_id); setEdinetSearchResult(`✅ 見つかりました: ${data.doc_id}`); }
                      } catch { setEdinetSearchResult("❌ 通信エラー"); }
                      setEdinetSearchLoading(false);
                    }}
                    disabled={edinetSearchLoading}
                    style={{ padding:"8px 12px", backgroundColor:edinetSearchLoading?"#94a3b8":"#475569", color:"white", border:"none", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:12, whiteSpace:"nowrap" }}>
                    {edinetSearchLoading ? "検索中..." : "🔍 検索"}
                  </button>
                </div>
                {edinetSearchResult && <p style={{ marginTop:6, fontSize:11, color:edinetSearchResult.startsWith("❌")?"#dc2626":"#166534" }}>{edinetSearchResult}</p>}
              </div>

              <StepRow num="1" color="#3b82f6" title="① EDINETからテキスト取得" desc="目論見書のテキストをDBに保存します（約10〜20秒）" btnLabel="① テキストを取得する" onClick={handleStep1}/>
              <StepRow num="7" color="#0369a1" title="⑦ 市場・競合情報収集" desc="主幹事証券・競合企業・業界PER・直近IPO事例を収集します（約20〜30秒）" btnLabel="⑦ 市場・競合情報を収集する" onClick={handleStep7}/>
              <StepRow num="2" color="#16a34a" title="② 財務データを構造化" desc="テキストから財務・株主・ロックアップ情報をJSON化します（約15〜25秒）" btnLabel="② 財務データを構造化する" onClick={handleStep2}/>
              <StepRow num="3" color="#0e7490" title="③ スコア・シナリオ生成" desc="総合スコア・A〜E判定・株価シナリオを生成します（約30〜40秒）" btnLabel="③ スコア・シナリオを生成する" onClick={handleStep3}/>

              {/* ④⑤⑥一括 */}
              <div style={{ borderRadius:10, padding:"12px 14px", marginBottom:10, border:`1px solid ${(stepResult["4"]||stepResult["5"]||stepResult["6"])?.startsWith("❌")?"#fecaca":stepResult["6"]?"#bbf7d0":"#e2e8f0"}`, background:(stepResult["4"]||stepResult["5"]||stepResult["6"])?.startsWith("❌")?"#fef2f2":stepResult["6"]?"#f0fdf4":"#f8fafc" }}>
                <div style={{ fontWeight:900, color:"#7c3aed", fontSize:13, marginBottom:3 }}>④⑤⑥ 9軸 詳細分析（一括実行）</div>
                <p style={{ fontSize:11, color:"#64748b", margin:"2px 0 8px" }}>超短期・短期・長期の9軸をすべて自動で順番に分析します（約2〜4分）</p>
                <button onClick={handleAllAxes} disabled={allAxesLoading}
                  style={{ padding:"8px 14px", backgroundColor:allAxesLoading?"#94a3b8":"#7c3aed", color:"white", border:"none", borderRadius:8, cursor:allAxesLoading?"default":"pointer", fontWeight:700, fontSize:12, width:"100%", marginBottom:8 }}>
                  {allAxesLoading ? "分析中（しばらくお待ちください）..." : "④⑤⑥ 9軸を一括分析する"}
                </button>
                {["4","5","6"].map(n => stepResult[n] && (
                  <div key={n} style={{ fontSize:11, lineHeight:1.7, padding:"4px 8px", borderRadius:6, marginBottom:4, background:stepResult[n]?.startsWith("❌")?"#fef2f2":"#f0fdf4", color:stepResult[n]?.startsWith("❌")?"#dc2626":"#166534", whiteSpace:"pre-wrap" }}>
                    {stepResult[n]}
                  </div>
                ))}
              </div>

              {/* 視覚化 */}
              <div style={{ borderRadius:10, padding:"12px 14px", marginBottom:10, border:`1px solid ${vizResult?.startsWith("❌")?"#fecaca":vizResult?.includes("完了")?"#bbf7d0":"#e2e8f0"}`, background:vizResult?.startsWith("❌")?"#fef2f2":vizResult?.includes("完了")?"#f0fdf4":"#f8fafc" }}>
                <div style={{ fontWeight:900, color:"#0d4f52", fontSize:13, marginBottom:3 }}>📊 視覚化データ生成</div>
                <p style={{ fontSize:11, color:"#64748b", margin:"2px 0 8px" }}>グラフ・表データをまとめて生成します（約30〜60秒）</p>
                <button onClick={handleVisualize} disabled={vizLoading}
                  style={{ padding:"8px 14px", backgroundColor:vizLoading?"#94a3b8":"#0d4f52", color:"white", border:"none", borderRadius:8, cursor:vizLoading?"default":"pointer", fontWeight:700, fontSize:12, width:"100%", marginBottom:vizResult?6:0 }}>
                  {vizLoading ? "⏳ 生成中..." : "📊 視覚化データを生成"}
                </button>
                {vizResult && <div style={{ fontSize:11, lineHeight:1.7, padding:"4px 8px", borderRadius:6, background:vizResult.startsWith("❌")?"#fef2f2":"#f0fdf4", color:vizResult.startsWith("❌")?"#dc2626":"#166534" }}>{vizResult}</div>}
              </div>
            </>
          )}
        </div>

        {/* ═══ グループC: マスタ管理(折りたたみ) ═══ */}
        <div style={{ ...sectionStyle, padding:0, overflow:"hidden" }}>
          <button onClick={() => setGroupCOpen(v => !v)}
            style={{ width:"100%", padding:"16px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", background:"#475569", border:"none", cursor:"pointer", borderRadius:groupCOpen?"12px 12px 0 0":"12px" }}>
            <div style={{ fontWeight:900, fontSize:14, color:"white" }}>🗂 マスタ管理</div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:11, color:"rgba(255,255,255,0.7)" }}>競合財務・EDINETコード・初値・カレンダー</span>
              <span style={{ color:"white", fontSize:12, transform:groupCOpen?"rotate(180deg)":"none", display:"inline-block", transition:"transform 0.2s" }}>▼</span>
            </div>
          </button>
          {groupCOpen && (
            <div style={{ padding:"16px 20px", display:"flex", flexDirection:"column", gap:16 }}>

              {/* 競合財務 */}
              <div>
                <div style={{ fontWeight:700, fontSize:13, color:"#082b2e", marginBottom:4 }}>🏢 競合他社財務データ取得</div>
                <p style={{ fontSize:11, color:"#64748b", margin:"0 0 8px" }}>⑦で収集した競合企業の有価証券報告書から財務データを取得します（約30〜60秒）</p>
                {!selectedCompany && <p style={{ fontSize:11, color:"#94a3b8" }}>※ 銘柄分析で銘柄を選択してください</p>}
                {selectedCompany && (
                  <>
                    <button onClick={handleCompetitor} disabled={compLoading}
                      style={{ padding:"8px 14px", backgroundColor:compLoading?"#94a3b8":"#0f766e", color:"white", border:"none", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:12 }}>
                      {compLoading ? "取得中..." : "競合財務データを取得する"}
                    </button>
                    {compResult && <div style={{ marginTop:8, fontSize:11, lineHeight:1.7, padding:"6px 8px", borderRadius:6, background:"#f0fdf4", color:"#166534", whiteSpace:"pre-wrap" }}>{compResult}</div>}
                  </>
                )}
              </div>

              <hr style={{ border:"none", borderTop:"1px solid #e2e8f0" }}/>

              {/* EDINETコード */}
              <div>
                <div style={{ fontWeight:700, fontSize:13, color:"#082b2e", marginBottom:4 }}>🏢 EDINETコードリスト取得 <span style={{ fontSize:10, color:"#94a3b8" }}>（数ヶ月に1回）</span></div>
                <p style={{ fontSize:11, color:"#64748b", margin:"0 0 8px" }}>EDINETサイトからCSVをダウンロードし、edinet_companiesテーブルにインポートします。</p>
                <button onClick={handleEdinetCodes}
                  style={{ padding:"8px 14px", backgroundColor:"#0369a1", color:"white", border:"none", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:12 }}>
                  EDINETダウンロードページを開く
                </button>
                {edinetResult && <p style={{ marginTop:8, fontSize:11, color:"#0d4f52", lineHeight:1.7 }}>{edinetResult}</p>}
              </div>

              <hr style={{ border:"none", borderTop:"1px solid #e2e8f0" }}/>

              {/* 初値・騰落率 */}
              <div>
                <div style={{ fontWeight:700, fontSize:13, color:"#082b2e", marginBottom:8 }}>📝 初値・騰落率入力</div>
                <InitialPriceForm />
              </div>

              <hr style={{ border:"none", borderTop:"1px solid #e2e8f0" }}/>

              {/* 経済指標カレンダー */}
              <div>
                <div style={{ fontWeight:700, fontSize:13, color:"#082b2e", marginBottom:4 }}>🌐 経済指標カレンダー登録 <span style={{ fontSize:10, color:"#94a3b8" }}>（年に数回）</span></div>
                <p style={{ fontSize:11, color:"#64748b", margin:"0 0 10px" }}>FOMC・日銀・NFP・CPIの日程を登録します。</p>
                <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:12 }}>
                  <div>
                    <label style={labelStyle}>日付 *</label>
                    <input type="date" value={econDate} onChange={e => setEconDate(e.target.value)} style={inputStyle}/>
                  </div>
                  <div>
                    <label style={labelStyle}>イベント種別 *</label>
                    <select value={econType} onChange={e => setEconType(e.target.value)} style={inputStyle}>
                      <option value="FOMC">🇺🇸 FOMC</option>
                      <option value="日銀">🇯🇵 日銀金融政策決定会合</option>
                      <option value="NFP">📊 米雇用統計（NFP）</option>
                      <option value="CPI">📈 米CPI</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>メモ（任意）</label>
                    <input value={econLabel} onChange={e => setEconLabel(e.target.value)} placeholder="例：結果発表23:00" style={inputStyle}/>
                  </div>
                  <button onClick={handleAddEconEvent} disabled={econLoading || !econDate}
                    style={{ padding:"8px 14px", backgroundColor:econLoading?"#94a3b8":"#0369a1", color:"white", border:"none", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:12 }}>
                    {econLoading ? "追加中..." : "➕ 追加する"}
                  </button>
                  {econResult && <p style={{ fontSize:11, color:econResult.startsWith("❌")?"#dc2626":"#166534" }}>{econResult}</p>}
                </div>
                {econEvents.length > 0 && (
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:"#2a7a7e", marginBottom:6 }}>登録済みイベント（{econEvents.length}件）</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:4, maxHeight:200, overflowY:"auto" }}>
                      {econEvents.map(e => (
                        <div key={e.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 10px", background:"#f8fafc", borderRadius:8, border:"1px solid #e2e8f0" }}>
                          <div>
                            <span style={{ fontSize:12, fontWeight:700, color:"#082b2e" }}>{e.event_date}</span>
                            <span style={{ fontSize:11, color:"#2a7a7e", marginLeft:8 }}>{e.event_type}</span>
                            {e.label && <span style={{ fontSize:11, color:"#64748b", marginLeft:6 }}>（{e.label}）</span>}
                          </div>
                          <button onClick={() => handleDeleteEconEvent(e.id)}
                            style={{ background:"none", border:"none", cursor:"pointer", color:"#ef4444", fontSize:16, padding:"2px 6px" }}>×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}