"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

const C = { teal: "#66c3c6", nav: "#0d4f52", bg: "#f0fafa" };
const COLORS = ["#66c3c6","#0d4f52","#f59e0b","#6366f1","#10b981","#f43f5e","#8b5cf6","#ec4899"];

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: "white", borderRadius: 12, padding: "20px", border: "1px solid #d0f0f0" }}>
      {children}
    </div>
  );
}

function buildProceedsChartData(rows: any[]) {
  const valid = rows
    .map((r) => {
      const n = typeof r.amount_value === "number" ? r.amount_value : Number(r.amount_value);
      return { ...r, _val: n };
    })
    .filter((r) => r.amount_value !== null && r.amount_value !== undefined && !isNaN(r._val));

  if (valid.length === 0) return { chartData: [] as any[], categories: [] as string[] };

  const categories: string[] = [];
  valid.forEach((r) => {
    if (!categories.includes(r.category)) categories.push(r.category);
  });

  const timingOrder: string[] = [];
  const byTiming: Record<string, any> = {};
  valid.forEach((r) => {
    const t = r.timing || "時期未定";
    if (!byTiming[t]) {
      byTiming[t] = { timing: t };
      timingOrder.push(t);
    }
    byTiming[t][r.category] = (byTiming[t][r.category] || 0) + r._val;
  });

  const chartData = timingOrder.map((t) => byTiming[t]);
  return { chartData, categories };
}

/* 「推定XX.X%程度」のようにAIが埋め切れなかったプレースホルダー値を検知し、分かりやすい文言に差し替える */
function cleanPlaceholderValue(label: string, value: string | null | undefined): string {
  if (!value) return "目論見書に記載なし";
  const hasPlaceholder = /X{1,3}(\.X+)?/i.test(value) || /[◯○△▲×]{2,}/.test(value);
  if (hasPlaceholder) {
    if (label.includes("流通比率")) return "目論見書に株主別保有比率の記載がなく算出できず";
    return "目論見書に具体的記載なし";
  }
  return value;
}

/* ⑧ IPO条件・資金調達サマリー */
export function IpoSummaryTable({ vizData }: { vizData: any }) {
  const ipo_summary_table = vizData?.ipo_summary_table;
  const summaryRows: any[] = ipo_summary_table?.rows ?? [];
  const visible = ipo_summary_table?.available && summaryRows.length > 0;
  if (!visible) return null;
  return (
    <CardShell>
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
              display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "baseline",
              gap: "4px 12px", padding: "10px 4px",
              borderBottom: i < summaryRows.length - 1 ? "1px solid #eef7f7" : "none",
            }}
          >
            <span style={{ fontSize: 12, color: "#64748b", fontWeight: 700, flexShrink: 0 }}>{r.label}</span>
            <span style={{ fontSize: 13, color: "#082b2e", fontWeight: 700, textAlign: "right", flex: 1, minWidth: 0 }}>{cleanPlaceholderValue(r.label ?? "", r.value)}</span>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

/* ⑮ 調達資金の使途 */
export function UseOfProceedsTable({ vizData }: { vizData: any }) {
  const use_of_proceeds_table = vizData?.use_of_proceeds_table;
  const proceedsRows: any[] = use_of_proceeds_table?.rows ?? [];
  const visible = use_of_proceeds_table?.available && proceedsRows.length > 0;
  if (!visible) return null;
  const { chartData: proceedsChartData, categories: proceedsCategories } = buildProceedsChartData(proceedsRows);
  const proceedsChartVisible = proceedsChartData.length > 0 && proceedsCategories.length > 0;
  return (
    <CardShell>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 16 }}>💰</span>
        <h3 style={{ fontSize: 14, fontWeight: 900, color: C.nav, margin: 0 }}>{use_of_proceeds_table.title ?? "調達資金の使途"}</h3>
      </div>
      {use_of_proceeds_table.citation && (
        <p style={{ fontSize: 10, color: "#6b9ea0", marginBottom: 12 }}>📄 {use_of_proceeds_table.citation}</p>
      )}
      {proceedsChartVisible && (
        <div style={{ marginBottom: 16 }}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={proceedsChartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0f0f0" />
              <XAxis dataKey="timing" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 10).toLocaleString()}万`} />
              <Tooltip formatter={(value: any) => [`${(Number(value) / 10).toLocaleString()}万円`]} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {proceedsCategories.map((cat, i) => (
                <Bar
                  key={cat}
                  dataKey={cat}
                  name={cat}
                  stackId="proceeds"
                  fill={COLORS[i % COLORS.length]}
                  radius={i === proceedsCategories.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {proceedsRows.map((r: any, i: number) => (
          <div key={i} style={{ backgroundColor: C.bg, borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#082b2e", marginBottom: 6, lineHeight: 1.5 }}>{r.category}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <div style={{ backgroundColor: "white", borderRadius: 6, padding: "4px 10px", flex: "1 1 100px" }}>
                <div style={{ fontSize: 9, color: "#94a3b8" }}>金額</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.nav }}>{r.amount ?? "目論見書に記載なし"}</div>
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
    </CardShell>
  );
}

/* ⑯ 大株主・ロックアップ情報 */
export function ShareholdersLockupTable({ vizData }: { vizData: any }) {
  const shareholders_lockup_table = vizData?.shareholders_lockup_table;
  const shareholdersRows: any[] = shareholders_lockup_table?.rows ?? [];
  const visible = shareholders_lockup_table?.available && shareholdersRows.length > 0;
  if (!visible) return null;
  return (
    <CardShell>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 16 }}>👥</span>
        <h3 style={{ fontSize: 14, fontWeight: 900, color: C.nav, margin: 0 }}>{shareholders_lockup_table.title ?? "大株主・ロックアップ情報"}</h3>
      </div>
      {shareholders_lockup_table.citation && (
        <p style={{ fontSize: 10, color: "#6b9ea0", marginBottom: 12 }}>📄 {shareholders_lockup_table.citation}</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {shareholdersRows.map((r: any, i: number) => (
          <div key={i} style={{ backgroundColor: C.bg, borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#082b2e" }}>{r.name}</span>
              <span style={{ fontSize: 13, fontWeight: 900, color: C.teal }}>{r.ratio}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <div style={{ backgroundColor: "white", borderRadius: 6, padding: "4px 10px", flex: "1 1 100px" }}>
                <div style={{ fontSize: 9, color: "#94a3b8" }}>保有株式数</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>{r.shares}</div>
              </div>
              <div style={{ backgroundColor: "white", borderRadius: 6, padding: "4px 10px", flex: "1 1 100px" }}>
                <div style={{ fontSize: 9, color: "#94a3b8" }}>属性</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>{r.type}</div>
              </div>
              <div style={{ backgroundColor: "white", borderRadius: 6, padding: "4px 10px", flex: "1 1 100px" }}>
                <div style={{ fontSize: 9, color: "#94a3b8" }}>ロックアップ</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: r.lockup === "有" ? "#dc2626" : "#475569" }}>{r.lockup}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

/* ⑰ 事業等のリスク（重要度別） */
export function RiskTable({ vizData }: { vizData: any }) {
  const risk_table = vizData?.risk_table;
  const riskRows: any[] = risk_table?.rows ?? [];
  const visible = risk_table?.available && riskRows.length > 0;
  if (!visible) return null;
  return (
    <CardShell>
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
    </CardShell>
  );
}