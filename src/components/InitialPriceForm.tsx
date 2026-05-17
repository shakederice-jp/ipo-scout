"use client";

import { useState, useEffect } from "react";

type Company = { id: string; name: string; listing_date: string | null; initial_price: number | null; price_change_rate: number | null; };

export default function InitialPriceForm() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selected,  setSelected]  = useState("");
  const [initPrice, setInitPrice] = useState("");
  const [changeRate,setChangeRate]= useState("");
  const [saving,    setSaving]    = useState(false);
  const [msg,       setMsg]       = useState("");

  useEffect(() => {
    fetch("/api/companies")
      .then(r => r.json())
      .then((data: Company[]) => {
        const today = new Date().toISOString().split("T")[0];
        const listed = data.filter(c => c.listing_date && c.listing_date <= today);
        setCompanies(listed);
      });
  }, []);

  const handleSave = async () => {
    if (!selected) { setMsg("❌ 銘柄を選択してください"); return; }
    setSaving(true); setMsg("");
    const r = await fetch("/api/admin/initial-price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stockId: selected, initialPrice: initPrice, priceChangeRate: changeRate }),
    });
    const d = await r.json();
    setMsg(d.success ? "✅ 保存しました" : `❌ ${d.error}`);
    setSaving(false);
  };

  const inputStyle = { width:"100%", padding:"10px", borderRadius:"8px",
    border:"1px solid #b3e8ea", boxSizing:"border-box" as const, fontSize:"14px", marginBottom:"12px" };

  return (
    <div>
      <select value={selected} onChange={e => setSelected(e.target.value)} style={inputStyle}>
        <option value="">銘柄を選択...</option>
        {companies.map(c => (
          <option key={c.id} value={c.id}>{c.name}（{c.listing_date}）</option>
        ))}
      </select>
      <input type="number" placeholder="初値（円）例：1200" value={initPrice}
        onChange={e => setInitPrice(e.target.value)} style={inputStyle} />
      <input type="number" placeholder="騰落率（%）例：20.5 または -5.2" value={changeRate}
        onChange={e => setChangeRate(e.target.value)} style={inputStyle} />
      <button onClick={handleSave} disabled={saving}
        style={{ width:"100%", padding:"12px", backgroundColor: saving ? "#b3e8ea" : "#66c3c6",
          color:"white", border:"none", borderRadius:"8px", fontSize:"14px",
          fontWeight:"900", cursor: saving ? "default" : "pointer" }}>
        {saving ? "保存中..." : "📈 初値・騰落率を保存する"}
      </button>
      {msg && <p style={{ marginTop:"8px", fontSize:"13px", color: msg.startsWith("✅") ? "#2a7a7e" : "#b91c1c" }}>{msg}</p>}
    </div>
  );
}