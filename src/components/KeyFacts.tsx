// 分析ページの冒頭に置く「結論1行＋主要数値表」。中身は src/lib/key-facts.ts で作る。
// サーバー側で最初のHTMLに入るため、検索エンジンや生成AIが「この銘柄の上場日・公募価格」を
// そのまま文字として読み取れる。
import type { KeyFactsData } from "@/lib/key-facts";

const DARK = "#082b2e", BORDER = "#b3e8ea", TTEXT = "#2a7a7e";

export default function KeyFacts({ data }: { data: KeyFactsData }) {
  return (
    <section aria-label="結論と主要数値" style={{ backgroundColor: "white", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 16px" }}>
      <p style={{ fontSize: 14, fontWeight: 900, color: DARK, lineHeight: 1.7, margin: "0 0 10px" }}>{data.line}</p>
      {data.rows.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <caption style={{ captionSide: "top", textAlign: "left", fontSize: 11, fontWeight: 700, color: TTEXT, paddingBottom: 6 }}>
            {data.title}
          </caption>
          <tbody>
            {data.rows.map(([k, v]) => (
              <tr key={k} style={{ borderTop: `1px solid ${BORDER}` }}>
                <th scope="row" style={{ textAlign: "left", fontWeight: 700, color: TTEXT, padding: "7px 8px 7px 0", width: "34%", verticalAlign: "top" }}>{k}</th>
                <td style={{ color: DARK, padding: "7px 0", lineHeight: 1.6 }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p style={{ fontSize: 10, color: "#64748b", lineHeight: 1.7, margin: "8px 0 0" }}>{data.note}</p>
    </section>
  );
}
