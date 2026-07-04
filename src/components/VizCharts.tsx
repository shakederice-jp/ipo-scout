"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const C = { teal: "#66c3c6", nav: "#0d4f52", bg: "#f0fafa" };

const COLORS = ["#66c3c6","#0d4f52","#f59e0b","#6366f1","#10b981","#f43f5e","#8b5cf6","#ec4899"];

export default function VizCharts({ vizData }: { vizData: any }) {
  if (!vizData) return null;

  const { revenue_chart, shareholders_chart, valuation_table, share_structure_chart, recent_ipo_chart, key_metrics_table } = vizData;

  const keyMetricsRows: any[] = key_metrics_table?.trend_rows ?? [];
  const keyMetricsVisible = key_metrics_table?.available && keyMetricsRows.length > 0;
  const latestSummary = key_metrics_table?.latest_summary;
  const per = key_metrics_table?.per;
  const pbr = key_metrics_table?.pbr;

  const shareholderData: any[] = shareholders_chart?.data ?? [];
  const hasShareholders = shareholderData.length > 0;
  const hasRatios = shareholderData.some((s) => typeof s.ratio === "number");
  const pieData = shareholderData.filter((s) => typeof s.ratio === "number");

  const valHasContent = valuation_table && [
    valuation_table.ipo_price,
    valuation_table.market_cap,
    valuation_table.per,
    valuation_table.pbr,
    valuation_table.float_ratio,
    valuation_table.fundraising,
    valuation_table.comment,
  ].some((v) => v !== null && v !== undefined);

  const fmt = (v: any, suffix: string = "") => (v === null || v === undefined ? "未定" : `${v}${suffix}`);

  const revenueVisible = revenue_chart?.available && revenue_chart.data?.length > 0;
  const structureData: any[] = share_structure_chart?.data ?? [];
  const structureVisible = share_structure_chart?.available && structureData.length > 0;
  const recentIpoData: any[] = recent_ipo_chart?.data ?? [];
  const recentIpoVisible = recent_ipo_chart?.available && recentIpoData.length > 0
    && recentIpoData.some((d) => typeof d.performance === "number");
  const maxAbsPerf = recentIpoVisible
    ? Math.max(10, ...recentIpoData.map((d) => Math.abs(d.performance ?? 0)))
    : 10;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 8 }}>

      {/* ① 業績グラフ */}
      {revenueVisible && (
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
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v/100).toFixed(0)}億`} />
              <Tooltip formatter={(value: any) => [`${(value/100).toFixed(1)}億円`]} />
              <Legend />
              <Bar dataKey="revenue" name="売上高" fill={C.teal} radius={[4,4,0,0]} />
              <Bar dataKey="profit" name="経常利益" fill={C.nav} radius={[4,4,0,0]} />
              </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 主要経営指標の推移 */}
      {keyMetricsVisible && (
        <div style={{ backgroundColor: "white", borderRadius: 12, padding: "20px", border: "1px solid #d0f0f0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 16 }}>📐</span>
            <h3 style={{ fontSize: 14, fontWeight: 900, color: C.nav, margin: 0 }}>主要経営指標の推移</h3>
          </div>
          {key_metrics_table.citation && (
            <p style={{ fontSize: 10, color: "#6b9ea0", marginBottom: 12 }}>📄 {key_metrics_table.citation}</p>
          )}

          {latestSummary && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
              {[
                { label: "自己資本比率", value: latestSummary.equity_ratio },
                { label: "ROE", value: latestSummary.roe },
                { label: "PER", value: per ? `${per}倍` : "未定" },
                { label: "PBR", value: pbr ? `${pbr}倍` : "未定" },
              ].map((item, i) => (
                <div key={i} style={{ backgroundColor: C.bg, borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "#6b9ea0", marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: item.value === "未定" ? "#cbd5e1" : C.nav }}>{item.value ?? "不明"}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #d0f0f0" }}>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "#6b9ea0" }}>決算期</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: "#6b9ea0" }}>売上高</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: "#6b9ea0" }}>経常利益</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: "#6b9ea0" }}>当期純利益</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: "#6b9ea0" }}>自己資本比率</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: "#6b9ea0" }}>ROE</th>
                </tr>
              </thead>
              <tbody>
                {keyMetricsRows.map((row: any, i: number) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f0fafa" }}>
                    <td style={{ padding: "6px 8px", color: "#082b2e", fontWeight: 700 }}>{row.period}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: "#374151" }}>{row.revenue}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: "#374151" }}>{row.ordinary_profit}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: "#374151" }}>{row.net_profit}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: "#374151" }}>{row.equity_ratio}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: "#374151" }}>{row.roe}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ② 株主構成 */}
      {hasShareholders && (
        <div style={{ backgroundColor: "white", borderRadius: 12, padding: "20px", border: "1px solid #d0f0f0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 16 }}>🥧</span>
            <h3 style={{ fontSize: 14, fontWeight: 900, color: C.nav, margin: 0 }}>{shareholders_chart.title ?? "株主構成"}</h3>
          </div>
          {shareholders_chart.citation && (
            <p style={{ fontSize: 10, color: "#6b9ea0", marginBottom: 12 }}>📄 {shareholders_chart.citation}</p>
          )}

          {hasRatios ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
              <ResponsiveContainer width={200} height={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="ratio"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    labelLine={false}
                    label={({ cx, cy, midAngle, innerRadius, outerRadius, value }: any) => {
                      const RADIAN = Math.PI / 180;
                      const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
                      const x = cx + radius * Math.cos(-midAngle * RADIAN);
                      const y = cy + radius * Math.sin(-midAngle * RADIAN);
                      return (
                        <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700}>
                          {`${value}%`}
                        </text>
                      );
                    }}
                  >
                    {pieData.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => [`${v}%`]} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1, minWidth: 160 }}>
                {shareholderData.map((s: any, i: number) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: COLORS[i % COLORS.length], flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: "#082b2e" }}>{s.name}</span>
                    <span style={{ fontSize: 11, color: C.teal, fontWeight: 700, marginLeft: "auto" }}>
                      {typeof s.ratio === "number" ? `${s.ratio}%` : "不明"}
                    </span>
                    {s.lockup && <span style={{ fontSize: 9, backgroundColor: "#fef3c7", color: "#92400e", padding: "1px 4px", borderRadius: 4 }}>🔒LU</span>}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {shareholderData.map((s: any, i: number) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", backgroundColor: C.bg, borderRadius: 8 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#082b2e" }}>{s.name}</div>
                    {s.type && <div style={{ fontSize: 10, color: "#6b9ea0" }}>{s.type}</div>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 11, color: "#9ca3af" }}>比率不明</span>
                    {s.lockup && <span style={{ fontSize: 9, backgroundColor: "#fef3c7", color: "#92400e", padding: "2px 6px", borderRadius: 4 }}>🔒ロックアップ</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {shareholders_chart.lockup_info && (
            <p style={{ fontSize: 10, color: "#6b7280", marginTop: 12, padding: "8px 10px", backgroundColor: "#fef9e7", borderRadius: 6 }}>
              🔒 {shareholders_chart.lockup_info}
            </p>
          )}
        </div>
      )}

      {/* ③ IPO概要・バリュエーション */}
      {valHasContent && (
        <div style={{ backgroundColor: "white", borderRadius: 12, padding: "20px", border: "1px solid #d0f0f0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 16 }}>📊</span>
            <h3 style={{ fontSize: 14, fontWeight: 900, color: C.nav, margin: 0 }}>
              {valuation_table.ipo_price == null ? "IPO概要" : (valuation_table.title ?? "バリュエーション指標")}
            </h3>
          </div>
          {valuation_table.ipo_price == null && (
            <p style={{ fontSize: 10, color: "#9ca3af", marginBottom: 4 }}>※ IPO価格未決定のため、PER・PBR・時価総額は上場後に算出されます</p>
          )}
          {valuation_table.citation && (
            <p style={{ fontSize: 10, color: "#6b9ea0", marginBottom: 12 }}>📄 {valuation_table.citation}</p>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
            {[
              { label: "IPO価格", value: valuation_table.ipo_price ? `¥${valuation_table.ipo_price?.toLocaleString()}` : "未定" },
              { label: "時価総額", value: valuation_table.market_cap ? `${(valuation_table.market_cap/100).toFixed(0)}億円` : "未定" },
              { label: "PER", value: valuation_table.per ? `${valuation_table.per}倍` : "未定" },
              { label: "PBR", value: valuation_table.pbr ? `${valuation_table.pbr}倍` : "未定" },
              { label: "流通比率", value: fmt(valuation_table.float_ratio, "%") },
              { label: "調達額", value: valuation_table.fundraising ? `${valuation_table.fundraising}百万円` : "未定" },
            ].map((item, i) => (
              <div key={i} style={{ backgroundColor: C.bg, borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#6b9ea0", marginBottom: 2 }}>{item.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: item.value === "未定" ? "#cbd5e1" : C.nav }}>{item.value}</div>
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

      {/* ④ 株式構成（上場時） */}
      {structureVisible && (
        <div style={{ backgroundColor: "white", borderRadius: 12, padding: "20px", border: "1px solid #d0f0f0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 16 }}>📦</span>
            <h3 style={{ fontSize: 14, fontWeight: 900, color: C.nav, margin: 0 }}>{share_structure_chart.title ?? "株式構成（上場時）"}</h3>
          </div>
          {share_structure_chart.citation && (
            <p style={{ fontSize: 10, color: "#6b9ea0", marginBottom: 12 }}>📄 {share_structure_chart.citation}</p>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", marginBottom: 12 }}>
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie
                  data={structureData}
                  dataKey="ratio"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={80}
                  labelLine={false}
                  label={({ cx, cy, midAngle, innerRadius, outerRadius, value }: any) => {
                    const RADIAN = Math.PI / 180;
                    const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
                    const x = cx + radius * Math.cos(-midAngle * RADIAN);
                    const y = cy + radius * Math.sin(-midAngle * RADIAN);
                    return (
                      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700}>
                        {`${value}%`}
                      </text>
                    );
                  }}
                >
                  {structureData.map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => [`${v}%`]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {structureData.map((d: any, i: number) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: COLORS[i % COLORS.length], flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: "#082b2e", flex: 1 }}>{d.label}</span>
                {typeof d.shares === "number" && (
                  <span style={{ fontSize: 10, color: "#94a3b8" }}>{d.shares.toLocaleString()}株</span>
                )}
                <span style={{ fontSize: 11, color: C.teal, fontWeight: 700, width: 48, textAlign: "right" }}>
                  {typeof d.ratio === "number" ? `${d.ratio}%` : "不明"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ⑤ 直近の同業種IPO 初値パフォーマンス */}
      {recentIpoVisible && (
        <div style={{ backgroundColor: "white", borderRadius: 12, padding: "20px", border: "1px solid #d0f0f0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 16 }}>🚀</span>
            <h3 style={{ fontSize: 14, fontWeight: 900, color: C.nav, margin: 0 }}>{recent_ipo_chart.title ?? "直近の同業種IPO 初値パフォーマンス"}</h3>
          </div>
          {recent_ipo_chart.citation && (
            <p style={{ fontSize: 10, color: "#6b9ea0", marginBottom: 4 }}>📄 {recent_ipo_chart.citation}</p>
          )}
          <p style={{ fontSize: 10, color: "#94a3b8", marginBottom: 12 }}>
            棒の起点(中央線)が各社の公募価格。右に伸びるほど公募価格を上回った初値、左に伸びるほど下回った初値を示します。
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, paddingLeft: 118 }}>
            <div style={{ flex: 1, position: "relative", fontSize: 9, color: "#94a3b8" }}>
              <span style={{ position: "absolute", left: 0 }}>← 公募割れ</span>
              <span style={{ position: "absolute", left: "50%", transform: "translateX(-50%)" }}>公募価格 0%</span>
              <span style={{ position: "absolute", right: 0 }}>初値上昇 →</span>
            </div>
            <span style={{ width: 48 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
            {recentIpoData.filter((d: any) => typeof d.performance === "number").map((d: any, i: number) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "#082b2e", width: 110, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                <div style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: C.bg, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: "#cbd5e1", left: "50%" }} />
                  <div style={{
                    position: "absolute", top: 0, height: "100%", borderRadius: 4,
                    ...(d.performance >= 0 ? { left: "50%" } : { right: "50%" }),
                    width: `${Math.min(50, (Math.abs(d.performance) / maxAbsPerf) * 50)}%`,
                    backgroundColor: d.performance >= 0 ? "#22c55e" : "#f87171",
                  }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: d.performance >= 0 ? "#15803d" : "#b91c1c", width: 48, textAlign: "right" }}>
                  {d.performance >= 0 ? "+" : ""}{d.performance}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}