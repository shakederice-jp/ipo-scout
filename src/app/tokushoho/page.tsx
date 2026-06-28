import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表記｜大手町調査室九課",
  robots: { index: false },
};

const S = {
  wrap: { maxWidth: 720, margin: "0 auto", padding: "32px 16px 64px", fontFamily: "'Noto Sans JP',sans-serif" } as React.CSSProperties,
  h1:   { fontSize: 22, fontWeight: 900, color: "#082b2e", marginBottom: 24, paddingBottom: 12, borderBottom: "2px solid #b3e8ea" } as React.CSSProperties,
  table:{ width: "100%", borderCollapse: "collapse" as const, fontSize: 13 },
  th:   { backgroundColor: "#e8f9f9", color: "#0d4f52", fontWeight: 700, padding: "10px 14px", textAlign: "left" as const, border: "1px solid #b3e8ea", width: "30%", verticalAlign: "top" as const },
  td:   { padding: "10px 14px", border: "1px solid #b3e8ea", color: "#374151", lineHeight: 1.8, verticalAlign: "top" as const },
  note: { marginTop: 24, fontSize: 11, color: "#94a3b8", lineHeight: 1.8 } as React.CSSProperties,
};

const rows = [
  ["販売事業者",         "大手町調査室九課"],
  ["運営統括責任者",     "ミヤケテツヤ"],
  ["所在地",            "東京都中央区日本橋兜町17-2-4F\n（請求があった場合は遅滞なく開示します）"],
  ["電話番号",          "非公表\n（請求があった場合は遅滞なく開示します）"],
  ["メールアドレス",    "otemachi.sec9@gmail.com"],
  ["販売URL",           "https://ipo-jp.vercel.app"],
  ["サービス名",        "IPO企業情報AI分析レポート"],
  ["販売価格",          "通知プラン：¥890/月\nレポート無制限プラン：¥1,890/月\nコンプリートパック：¥2,490/月\nシングルレポート：¥500/件\n（表示価格はすべて税込）"],
  ["支払方法",          "クレジットカード決済（Stripe）"],
  ["支払時期",          "お申し込み時に即時決済。月額プランは毎月自動更新"],
  ["サービス提供時期",  "決済完了後、即時利用可能"],
  ["返品・キャンセル",  "月額プランはいつでもマイページよりキャンセル可能です。\nキャンセル後は当月末まで利用でき、当月分の返金は行いません。\nシングルレポートはデジタルコンテンツの性質上、購入後の返金はお断りしています。"],
  ["動作環境",          "最新版のGoogle Chrome / Safari / Firefox / Edge を推奨"],
  ["特別条件",          "なし"],
];

export default function TokushohoPage() {
  return (
    <div style={{ backgroundColor: "#f4fbfc", minHeight: "100vh" }}>
      <div style={S.wrap}>
        <h1 style={S.h1}>特定商取引法に基づく表記</h1>
        <table style={S.table}>
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <th style={S.th}>{label}</th>
                <td style={S.td}>{value.split("\n").map((line, i) => (
                  <span key={i}>{line}{i < value.split("\n").length - 1 && <br />}</span>
                ))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={S.note}>
          ※ 本表記は特定商取引に関する法律第11条に基づき表示しています。<br />
          ※ 価格・内容は予告なく変更される場合があります。<br />
          最終更新：2026年6月
        </p>
      </div>
    </div>
  );
}