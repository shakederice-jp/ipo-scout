"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const C = { teal: "#66c3c6", nav: "#0d4f52", bg: "#f0fafa" };

const COLORS = ["#66c3c6","#0d4f52","#f59e0b","#6366f1","#10b981","#f43f5e","#8b5cf6","#ec4899"];

export default function VizCharts({ vizData }: { vizData: any }) {
  if (!vizData) return null;

  const { revenue_chart, shareholders_chart, valuation_table } = vizData;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 8 }}>

      {/* ① 業績グラフ */}
      {revenue_chart?.available && revenue_chart.data?.length > 0 && (
        <div style={{ backgroundColor: "white", borderRadius: 12, padding: "20px", border: "1px solid #d0f0f0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 16 }}>📈</span>
            <h3 style={{ fontSize: 14, fontWeight: 900, color: C.nav, margin: 0 }}>{revenue_chart.title}</h3>
          </div>
          {revenue_chart.citation && (
            <p style={{ fontSize: 10, color: "#6b9ea0", marginBottom: 12 }}>📄 {revenue_chart.citation}</p>
          )}
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={revenue_chart.data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0f0f0" />
              <XAxis dataKey="year" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}億`} />
              <Tooltip formatter={(value: any) => [`${(value/100).toFixed(1)}億円`]} />
              <Legend />
              <Bar dataKey="revenue" name="売上高" fill={C.teal} radius={[4,4,0,0]} />
              <Bar dataKey="profit" name="営業利益" fill={C.nav} radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ② 株主構成 */}
      {shareholders_chart?.available && shareholders_chart.data?.length > 0 && (
        <div style={{ backgroundColor: "white", borderRadius: 12, padding: "20px", border: "1px solid #d0f0f0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 16 }}>🥧</span>
            <h3 style={{ fontSize: 14, fontWeight: 900, color: C.nav, margin: 0 }}>{shareholders_chart.title}</h3>
          </div>
          {shareholders_chart.citation && (
            <p style={{ fontSize: 10, color: "#6b9ea0", marginBottom: 12 }}>📄 {shareholders_chart.citation}</p>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
            <ResponsiveContainer width={200} height={200}>
              <PieChart>
                <Pie data={shareholders_chart.data} dataKey="ratio" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, ratio }) => `${ratio}%`} labelLine={false}>
                  {shareholders_chart.data.map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => [`${v}%`]} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex: 1, minWidth: 160 }}>
              {shareholders_chart.data.map((s: any, i: number) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: COLORS[i % COLORS.length], flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: "#082b2e" }}>{s.name}</span>
                  <span style={{ fontSize: 11, color: C.teal, fontWeight: 700, marginLeft: "auto" }}>{s.ratio}%</span>
                  {s.lockup && <span style={{ fontSize: 9, backgroundColor: "#fef3c7", color: "#92400e", padding: "1px 4px", borderRadius: 4 }}>🔒LU</span>}
                </div>
              ))}
              {shareholders_chart.lockup_info && (
                <p style={{ fontSize: 10, color: "#6b7280", marginTop: 8, padding: "6px 8px", backgroundColor: "#fef9e7", borderRadius: 6 }}>
                  🔒 {shareholders_chart.lockup_info}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ③ バリュエーション */}
      {valuation_table?.available && (
        <div style={{ backgroundColor: "white", borderRadius: 12, padding: "20px", border: "1px solid #d0f0f0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 16 }}>📊</span>
            <h3 style={{ fontSize: 14, fontWeight: 900, color: C.nav, margin: 0 }}>{valuation_table.title}</h3>
          </div>
          {valuation_table.citation && (
            <p style={{ fontSize: 10, color: "#6b9ea0", marginBottom: 12 }}>📄 {valuation_table.citation}</p>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
            {[
              { label: "IPO価格", value: valuation_table.ipo_price ? `¥${valuation_table.ipo_price?.toLocaleString()}` : "不明" },
              { label: "時価総額", value: valuation_table.market_cap ? `${(valuation_table.market_cap/100).toFixed(0)}億円` : "不明" },
              { label: "PER", value: valuation_table.per ? `${valuation_table.per}倍` : "不明" },
              { label: "PBR", value: valuation_table.pbr ? `${valuation_table.pbr}倍` : "不明" },
              { label: "流通比率", value: valuation_table.float_ratio ? `${valuation_table.float_ratio}%` : "不明" },
              { label: "調達額", value: valuation_table.fundraising ? `${valuation_table.fundraising}百万円` : "不明" },
            ].map((item, i) => (
              <div key={i} style={{ backgroundColor: C.bg, borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#6b9ea0", marginBottom: 2 }}>{item.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.nav }}>{item.value}</div>
              </div>
            ))}
          </div>
          {valuation_table.comment && (
            <p style={{ fontSize: 12, color: "#374151", padding: "10px 12px", backgroundColor: "#f0fafa", borderRadius: 8, margin: 0 }}>
              💡 {valuation_table.comment}
            </p>
          )}
        </div>
      )}

    </div>
  );
}