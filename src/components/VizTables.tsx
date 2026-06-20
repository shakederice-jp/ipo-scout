"use client";

const C = { teal: "#66c3c6", nav: "#0d4f52", bg: "#f0fafa" };

export default function VizTables({ vizData }: { vizData: any }) {
  if (!vizData) return null;

  const { ipo_summary_table, use_of_proceeds_table, risk_table } = vizData;

  const summaryRows: any[] = ipo_summary_table?.rows ?? [];
  const summaryVisible = ipo_summary_table?.available && summaryRows.length > 0;

  const proceedsRows: any[] = use_of_proceeds_table?.rows ?? [];
  const proceedsVisible = use_of_proceeds_table?.available && proceedsRows.length > 0;
  const riskRows: any[] = risk_table?.rows ?? [];
  const riskVisible = risk_table?.available && riskRows.length > 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 8 }}>

      {/* IPO条件・資金調達サマリー表 */}
      {summaryVisible && (
        <div style={{ backgroundColor: "white", borderRadius: 12, padding: "20px", border: "1px solid #d0f0f0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 16 }}>📋</span>
            <h3 style={{ fontSize: 14, fontWeight: 900, color: C.nav, margin: 0 }}>{ipo_summary_table.title ?? "IPO条件・資金調達サマリー"}</h3>
          </div>
          {ipo_summary_table.citation && (
            <p style={{ fontSize: 10, color: "#6b9ea0", marginBottom: 12 }}>📄 {ipo_summary_table.citation}</p>
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {summaryRows.map((r: any, i: number) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: "4px 12px",
                  padding: "10px 4px",
                  borderBottom: i < summaryRows.length - 1 ? "1px solid #eef7f7" : "none",
                }}
              >
                <span style={{ fontSize: 12, color: "#64748b", fontWeight: 700, flexShrink: 0 }}>{r.label}</span>
                <span style={{ fontSize: 13, color: "#082b2e", fontWeight: 700, textAlign: "right", flex: 1, minWidth: 0 }}>{r.value ?? "不明"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 調達資金の使途明細表 */}
      {proceedsVisible && (
        <div style={{ backgroundColor: "white", borderRadius: 12, padding: "20px", border: "1px solid #d0f0f0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 16 }}>💰</span>
            <h3 style={{ fontSize: 14, fontWeight: 900, color: C.nav, margin: 0 }}>{use_of_proceeds_table.title ?? "調達資金の使途"}</h3>
          </div>
          {use_of_proceeds_table.citation && (
            <p style={{ fontSize: 10, color: "#6b9ea0", marginBottom: 12 }}>📄 {use_of_proceeds_table.citation}</p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {proceedsRows.map((r: any, i: number) => (
              <div key={i} style={{ backgroundColor: C.bg, borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#082b2e", marginBottom: 6, lineHeight: 1.5 }}>{r.category}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ backgroundColor: "white", borderRadius: 6, padding: "4px 10px", flex: "1 1 100px" }}>
                    <div style={{ fontSize: 9, color: "#94a3b8" }}>金額</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.nav }}>{r.amount ?? "不明"}</div>
                  </div>
                  {r.timing && (
                    <div style={{ backgroundColor: "white", borderRadius: 6, padding: "4px 10px", flex: "1 1 100px" }}>
                      <div style={{ fontSize: 9, color: "#94a3b8" }}>充当時期</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>{r.timing}</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
{/* 事業等のリスク（重要度別） */}
{riskVisible && (
        <div style={{ backgroundColor: "white", borderRadius: 12, padding: "20px", border: "1px solid #d0f0f0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <h3 style={{ fontSize: 14, fontWeight: 900, color: C.nav, margin: 0 }}>{risk_table.title ?? "事業等のリスク（重要度別）"}</h3>
          </div>
          {risk_table.citation && (
            <p style={{ fontSize: 10, color: "#6b9ea0", marginBottom: 12 }}>📄 {risk_table.citation}</p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {riskRows.map((r: any, i: number) => {
              const sevColor = r.severity === "高" ? "#dc2626" : r.severity === "中" ? "#d97706" : "#64748b";
              const sevBg = r.severity === "高" ? "#fef2f2" : r.severity === "中" ? "#fffbeb" : "#f8fafc";
              return (
                <div key={i} style={{ backgroundColor: sevBg, borderRadius: 10, padding: "10px 12px", borderLeft: `3px solid ${sevColor}` }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 900, padding: "1px 8px", borderRadius: 20, backgroundColor: sevColor, color: "white" }}>{r.severity}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 8px", borderRadius: 20, backgroundColor: "white", color: "#64748b", border: "1px solid #e2e8f0" }}>{r.category}</span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#082b2e", marginBottom: 2 }}>{r.title}</div>
                  <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.6 }}>{r.description}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}