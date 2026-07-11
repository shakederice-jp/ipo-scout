"use client";
import { useState, useEffect } from "react";

type Company = {
  id: string;
  name: string;
  ticker: string | null;
  listing_date: string | null;
  initial_price: number | null;
  price_change_rate: number | null;
  status: string | null;
  ipo_price: number | null;
};

const STATUS_OPTIONS = [
  "仮条件決定前",
  "ブックビルディング",
  "公募価格決定",
  "申込受付中",
  "上場済",
  "上場中止",
];

export default function InitialPriceForm() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selected, setSelected] = useState("");
  const [initPrice, setInitPrice] = useState("");
  const [changeRate, setChangeRate] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const today = new Date().toISOString().split("T")[0];

  const loadCompanies = () => {
    fetch("/api/companies")
      .then(r => r.json())
      .then((data: Company[]) => {
        setCompanies(data.sort((a, b) =>
          (a.listing_date ?? "").localeCompare(b.listing_date ?? "")
        ));
      });
  };

  useEffect(() => { loadCompanies(); }, []);

  const handleSelect = (id: string) => {
    setSelected(id);
    const c = companies.find(x => x.id === id);
    if (c) {
      setInitPrice(c.initial_price != null ? String(c.initial_price) : "");
      setChangeRate(c.price_change_rate != null ? String(c.price_change_rate) : "");
      setStatus(c.status ?? "");
    }
    setMsg("");
  };

  const handleSave = async () => {
    if (!selected) { setMsg("❌ 銘柄を選択してください"); return; }
    setSaving(true); setMsg("");
    const r = await fetch("/api/admin/initial-price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stockId: selected,
        initialPrice: initPrice || null,
        priceChangeRate: changeRate || null,
        status: status || null,
      }),
    });
    const d = await r.json();
    setMsg(d.success ? "✅ 保存しました" : `❌ ${d.error}`);
    setSaving(false);
    loadCompanies();
  };

  const inputStyle = {
    width: "100%", padding: "8px 10px", borderRadius: "8px",
    border: "1px solid #b3e8ea", boxSizing: "border-box" as const,
    fontSize: "13px",
  };
  const labelStyle = {
    fontSize: "11px", fontWeight: "700" as const,
    color: "#2a7a7e", marginBottom: "4px", display: "block" as const,
  };

  const selectedCompany = companies.find(c => c.id === selected);
  const isPast = selectedCompany?.listing_date && selectedCompany.listing_date <= today;

  return (
    <div>
      {/* 銘柄一覧(上場日が過去のものをハイライト) */}
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>銘柄を選択 *</label>
        <select value={selected} onChange={e => handleSelect(e.target.value)} style={inputStyle}>
          <option value="">-- 銘柄を選択してください --</option>
          {companies.map(c => {
            const past = c.listing_date && c.listing_date <= today;
            const done = c.status === "上場済";
            return (
              <option key={c.id} value={c.id}>
                {past && !done ? "⚠️ " : done ? "✅ " : ""}{c.name}（{c.listing_date}）{c.status ? `[${c.status}]` : ""}
              </option>
            );
          })}
        </select>
      </div>

      {selectedCompany && (
        <div style={{ background: isPast && selectedCompany.status !== "上場済" ? "#fffbeb" : "#f0fdf4",
          borderRadius: 8, padding: "10px 12px", marginBottom: 12,
          border: `1px solid ${isPast && selectedCompany.status !== "上場済" ? "#fde68a" : "#bbf7d0"}`,
          fontSize: 12 }}>
          <strong>{selectedCompany.name}</strong>（{selectedCompany.ticker}）
          　上場日: {selectedCompany.listing_date}
          　公募価格: {selectedCompany.ipo_price ? `¥${selectedCompany.ipo_price.toLocaleString()}` : "未入力"}
          {isPast && selectedCompany.status !== "上場済" && (
            <span style={{ color: "#d97706", fontWeight: 700, marginLeft: 8 }}>⚠️ 上場日を過ぎています</span>
          )}
        </div>
      )}

      {/* ステータス */}
      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>ステータス</label>
        <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle}>
          <option value="">-- 変更しない --</option>
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* 初値 */}
      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>初値（円）</label>
        <input type="number" placeholder="例：1500" value={initPrice}
          onChange={e => setInitPrice(e.target.value)} style={inputStyle} />
      </div>

      {/* 騰落率 */}
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>騰落率（%）公募価格比</label>
        <input type="number" placeholder="例：20.5 または -5.2" value={changeRate}
          onChange={e => setChangeRate(e.target.value)} style={inputStyle} />
      </div>

      <button onClick={handleSave} disabled={saving}
        style={{ width: "100%", padding: "10px", backgroundColor: saving ? "#94a3b8" : "#66c3c6",
          color: "white", border: "none", borderRadius: "8px", fontSize: "13px",
          fontWeight: 700, cursor: saving ? "default" : "pointer" }}>
        {saving ? "保存中..." : "📈 保存する"}
      </button>

      {msg && (
        <p style={{ marginTop: 8, fontSize: 12,
          color: msg.startsWith("✅") ? "#166534" : "#b91c1c" }}>{msg}</p>
      )}
    </div>
  );
}