import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "料金プラン｜大手町調査室九課",
  description: "IPO企業情報AI分析レポートの料金プラン一覧。無料・通知プラン・レポート無制限・コンプリートパックの4プランをご用意。",
};

const C = {
  teal: "#66c3c6", nav: "#0d4f52", dark: "#082b2e",
  light: "#f0fafa", border: "#b3e8ea", mid: "#2a7a7e",
};

const plans = [
  {
    id: "free",
    name: "無料",
    price: "¥0",
    period: "",
    color: "#64748b",
    bg: "#f8fafc",
    border: "#e2e8f0",
    badge: null,
    target: "まずIPO投資を始めてみたい方・月2銘柄で十分な方",
    features: [
      { label: "AI分析レポート", value: "月2銘柄", ok: true },
      { label: "週次メール通知", value: "なし", ok: false },
      { label: "BB・申込・上場日通知", value: "なし", ok: false },
      { label: "ロックアップ解除通知", value: "なし", ok: false },
      { label: "カレンダー・メモ機能", value: "あり", ok: true },
      { label: "シングル購入", value: "¥500/件", ok: true },
    ],
  },
  {
    id: "notify",
    name: "通知プラン",
    price: "¥890",
    period: "/月",
    color: "#0369a1",
    bg: "#eff6ff",
    border: "#bfdbfe",
    badge: null,
    target: "BB開始を絶対に見逃したくない方・通知重視の方",
    features: [
      { label: "AI分析レポート", value: "月2銘柄", ok: true },
      { label: "週次メール通知", value: "あり", ok: true },
      { label: "BB・申込・上場日通知", value: "あり", ok: true },
      { label: "ロックアップ解除通知", value: "あり", ok: true },
      { label: "カレンダー・メモ機能", value: "あり", ok: true },
      { label: "シングル購入", value: "¥500/件", ok: true },
    ],
  },
  {
    id: "unlimited",
    name: "レポート無制限",
    price: "¥1,890",
    period: "/月",
    color: "#7c3aed",
    bg: "#f5f3ff",
    border: "#ddd6fe",
    badge: null,
    target: "毎月すべての銘柄を研究したい方・情報量重視の方",
    features: [
      { label: "AI分析レポート", value: "無制限", ok: true },
      { label: "週次メール通知", value: "なし", ok: false },
      { label: "BB・申込・上場日通知", value: "なし", ok: false },
      { label: "ロックアップ解除通知", value: "なし", ok: false },
      { label: "カレンダー・メモ機能", value: "あり", ok: true },
      { label: "シングル購入", value: "不要", ok: true },
    ],
  },
  {
    id: "complete",
    name: "コンプリートパック",
    price: "¥2,490",
    period: "/月",
    color: C.nav,
    bg: "#e8f9f9",
    border: C.teal,
    badge: null,
    target: "通知も情報も両方欲しい方・IPO投資に本気で取り組む方",
    features: [
      { label: "AI分析レポート", value: "無制限", ok: true },
      { label: "週次メール通知", value: "あり", ok: true },
      { label: "BB・申込・上場日通知", value: "あり", ok: true },
      { label: "ロックアップ解除通知", value: "あり", ok: true },
      { label: "カレンダー・メモ機能", value: "あり", ok: true },
      { label: "シングル購入", value: "不要", ok: true },
    ],
  },
];

const faqs = [
  { q: "いつでも解約できますか？", a: "はい。マイページからいつでもキャンセル可能です。解約後は当月末まで引き続きご利用いただけます。" },
  { q: "無料プランに期限はありますか？", a: "ありません。登録不要でずっと無料でご利用いただけます。" },
  { q: "決済は安全ですか？", a: "はい。世界標準の決済サービス「Stripe」を使用しています。カード情報は当サービスでは保持しません。" },
  { q: "プランの変更はできますか？", a: "はい。マイページからいつでもプランの変更・アップグレードが可能です。" },
  { q: "シングルレポートとは何ですか？", a: "サブスク不要で、気になる1銘柄だけを¥500で購入できるプランです。無料枠の2銘柄以外を読みたい場合にご利用ください。" },
];

export default function PlansPage() {
  return (
    <div style={{ backgroundColor: C.light, minHeight: "100vh", fontFamily: "'Noto Sans JP',sans-serif" }}>

      {/* ヒーロー */}
      <div style={{ background: `linear-gradient(135deg, ${C.dark} 0%, ${C.nav} 100%)`, padding: "56px 24px 64px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.teal, letterSpacing: "0.1em", marginBottom: 16 }}>PRICING</div>
          <h1 style={{ fontSize: "clamp(24px,4vw,36px)", fontWeight: 900, color: "white", lineHeight: 1.4, marginBottom: 12 }}>
            あなたのIPO投資スタイルに合わせて<br/>選べる4つのプラン
          </h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.9 }}>
            まずは無料からお試しいただけます。いつでもアップグレード・解約が可能です。
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 16px 80px" }}>

        {/* プランカード */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginTop: "-32px" }}>
          {plans.map(plan => (
            <div key={plan.id} style={{ backgroundColor: "white", borderRadius: 20, border: `2px solid ${plan.border}`, overflow: "hidden", boxShadow: plan.badge ? "0 4px 24px rgba(102,195,198,0.2)" : "0 2px 8px rgba(0,0,0,0.06)", position: "relative" }}>
              {plan.badge && (
                <div style={{ backgroundColor: C.teal, color: C.dark, fontSize: 11, fontWeight: 900, textAlign: "center", padding: "6px 0" }}>
                  {plan.badge}
                </div>
              )}
              <div style={{ backgroundColor: plan.bg, padding: "20px 20px 16px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: plan.color, marginBottom: 6 }}>{plan.name}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                  <span style={{ fontSize: 32, fontWeight: 900, color: plan.color }}>{plan.price}</span>
                  <span style={{ fontSize: 13, color: plan.color, opacity: 0.7 }}>{plan.period}</span>
                </div>
                <p style={{ fontSize: 11, color: "#64748b", lineHeight: 1.7, marginTop: 8, minHeight: 44 }}>{plan.target}</p>
              </div>
              <div style={{ padding: "16px 20px 20px" }}>
                {plan.features.map((f, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: i < plan.features.length - 1 ? `1px solid ${C.border}` : "none" }}>
                    <span style={{ fontSize: 11, color: "#475569" }}>{f.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: f.ok ? plan.color : "#cbd5e1" }}>{f.ok ? "✅" : "❌"} {f.value}</span>
                  </div>
                ))}
                <a href="/" style={{ display: "block", marginTop: 16, padding: "10px", backgroundColor: plan.badge ? C.teal : plan.bg, color: plan.badge ? C.dark : plan.color, borderRadius: 10, fontWeight: 900, fontSize: 13, textDecoration: "none", textAlign: "center", border: `1px solid ${plan.border}` }}>
                  {plan.id === "free" ? "無料で始める →" : "このプランを選ぶ →"}
                </a>
              </div>
            </div>
          ))}
        </div>

        {/* 比較表 */}
        <div style={{ marginTop: 56 }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: C.dark, textAlign: "center", marginBottom: 24 }}>プラン比較表</h2>
          <div style={{ backgroundColor: "white", borderRadius: 16, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
                <thead>
                  <tr style={{ backgroundColor: C.nav }}>
                    <th style={{ padding: "14px 16px", textAlign: "left", color: "white", fontWeight: 700, width: "30%" }}>機能</th>
                    {plans.map(p => (
                      <th key={p.id} style={{ padding: "14px 12px", textAlign: "center", color: p.badge ? C.teal : "rgba(255,255,255,0.8)", fontWeight: p.badge ? 900 : 700, fontSize: 12 }}>
                        {p.name}<br/>
                        <span style={{ fontSize: 14, fontWeight: 900 }}>{p.price}</span>
                        <span style={{ fontSize: 10 }}>{p.period}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "AI分析レポート",      values: ["月2銘柄", "月2銘柄", "無制限", "無制限"] },
                    { label: "週次メール通知",       values: ["❌", "✅", "❌", "✅"] },
                    { label: "BB・申込・上場日通知", values: ["❌", "✅", "❌", "✅"] },
                    { label: "ロックアップ解除通知", values: ["❌", "✅", "❌", "✅"] },
                    { label: "カレンダー・メモ",     values: ["✅", "✅", "✅", "✅"] },
                    { label: "シングル購入",         values: ["¥500/件", "¥500/件", "不要", "不要"] },
                  ].map((row, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, backgroundColor: i % 2 === 0 ? "white" : C.light }}>
                      <td style={{ padding: "12px 16px", fontWeight: 600, color: C.dark, fontSize: 12 }}>{row.label}</td>
                      {row.values.map((v, j) => (
                        <td key={j} style={{ padding: "12px 12px", textAlign: "center", fontSize: 12, color: v === "❌" ? "#cbd5e1" : plans[j].color, fontWeight: 700 }}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* シングルレポート */}
        <div style={{ marginTop: 40, backgroundColor: "white", borderRadius: 16, border: `1px solid #fde68a`, padding: "24px 28px", display: "flex", alignItems: "flex-start", gap: 16 }}>
          <div style={{ fontSize: 36, flexShrink: 0 }}>🎯</div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <h3 style={{ fontSize: 16, fontWeight: 900, color: C.dark, margin: 0 }}>シングルレポート</h3>
              <span style={{ fontSize: 20, fontWeight: 900, color: "#d97706" }}>¥500/件</span>
            </div>
            <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.9, margin: 0 }}>
              「この銘柄だけ読みたい」という方向け。サブスク不要で、気になる1銘柄だけを購入できます。<br/>
              無料枠（月2銘柄）を使い切った後でも、特定の銘柄だけピックアップしてお読みいただけます。
            </p>
          </div>
        </div>

        {/* FAQ */}
        <div style={{ marginTop: 56 }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: C.dark, textAlign: "center", marginBottom: 24 }}>よくある質問</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {faqs.map((faq, i) => (
              <div key={i} style={{ backgroundColor: "white", borderRadius: 14, border: `1px solid ${C.border}`, padding: "18px 20px" }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: C.nav, marginBottom: 8 }}>Q. {faq.q}</div>
                <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.8 }}>A. {faq.a}</div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div style={{ marginTop: 56, background: `linear-gradient(135deg, ${C.dark} 0%, ${C.nav} 100%)`, borderRadius: 20, padding: "40px 32px", textAlign: "center" }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: "white", marginBottom: 12 }}>まずは無料でお試しください</h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.9, marginBottom: 24 }}>
            毎月最初の2銘柄は完全無料。登録不要ですぐ読めます。
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <a href="/" style={{ padding: "12px 28px", backgroundColor: C.teal, color: C.dark, borderRadius: 10, fontWeight: 900, fontSize: 14, textDecoration: "none" }}>
              無料で始める →
            </a>
            <a href="/auth" style={{ padding: "12px 28px", backgroundColor: "rgba(255,255,255,0.1)", color: "white", borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: "none", border: "1px solid rgba(255,255,255,0.3)" }}>
              アカウント登録
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}