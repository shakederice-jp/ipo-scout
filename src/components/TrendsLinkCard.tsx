// 2026/10/24新設(束C・⑨): 「📡 大手町発マーケットトレンド」へのカード。
// トップページにだけあったものを部品にして、/schedule にも同じ見た目・同じ文言で置けるようにした。
export default function TrendsLinkCard({ marginBottom = 0 }: { marginBottom?: number }) {
  return (
    <a
      href="/trends"
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px",
        backgroundColor: "#0d4f52", border: "2px solid #0d4f52", textDecoration: "none",
        borderRadius: 16, overflow: "hidden", marginBottom,
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 900, color: "white" }}>📡 大手町発マーケットトレンド</div>
        <div style={{ fontSize: 10, color: "#a0d4d6", marginTop: 2 }}>IPO・スタートアップ・資金調達の最新動向</div>
      </div>
      <span style={{ fontSize: 16, color: "#66c3c6" }}>→</span>
    </a>
  );
}
