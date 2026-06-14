"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const C = { teal: "#66c3c6", nav: "#0d4f52", bg: "#f0fafa" };

const COLORS = ["#66c3c6","#0d4f52","#f59e0b","#6366f1","#10b981","#f43f5e","#8b5cf6","#ec4899"];

export default function VizCharts({ vizData }: { vizData: any }) {
  if (!vizData) {
    return (
      <div style={{ fontSize: 11, color: "#94a3b8", padding: 12, backgroundColor: "#f8fafc", borderRadius: 8 }}>
        [デバッグ] visualizationDataがnull/undefinedです（VizCharts自体は呼ばれていません）
      </div>
    );
  }

  const { revenue_chart, shareholders_chart, valuation_table } = vizData;

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
  const anyVisible = revenueVisible || hasShareholders || valHasContent;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 8 }}>

      {!anyVisible && (
        <div style={{ fontSize: 10, color: "#92400e", padding: 12, backgroundColor: "#fffbeb", borderRadius: 8, whiteSpace: "pre-wrap", fontFamily: "monospace", lineHeight: 1.6 }}>
          [デバッグ] vizDataは存在しますが、表示条件を満たす項目がありません。{"\n"}
          revenue_chart.available: {String(revenue_chart?.available)} / data件数: {revenue_chart?.data?.length ?? "なし"}{"\n"}
          shareholders_chart.data件数: {shareholderData.length}{"\n"}
          valuation_table: {JSON.stringify(valuation_table)}
        </div>
      )}

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
              <Bar dataKey="profit" name="営業利益" fill={C.nav} radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
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
                  <Pie data={pieData} dataKey="ratio" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ value }) => `${value}%`} labelLine={false}>
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

    </div>
  );
}