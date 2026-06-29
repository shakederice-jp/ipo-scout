import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "このサイトの効果的な使い方｜大手町調査室九課",
  description: "IPO企業情報AI分析レポートの特徴・使い方を解説。目論見書をAIが分析し、9軸スコア・株価シナリオ・詳細レポートを提供します。",
};

const C = {
  teal: "#66c3c6", nav: "#0d4f52", dark: "#082b2e",
  light: "#f0fafa", border: "#b3e8ea", mid: "#2a7a7e",
};

export default function GuidePage() {
  return (
    <div style={{ backgroundColor: C.light, minHeight: "100vh", fontFamily: "'Noto Sans JP',sans-serif" }}>

      {/* ① ヒーローセクション */}
      <div style={{ background: `linear-gradient(135deg, ${C.dark} 0%, ${C.nav} 100%)`, padding: "72px 24px 80px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
          <div style={{ display: "inline-block", fontSize: 11, fontWeight: 700, color: C.teal, backgroundColor: "rgba(102,195,198,0.15)", border: "1px solid rgba(102,195,198,0.3)", borderRadius: 20, padding: "4px 14px", marginBottom: 24, letterSpacing: "0.08em" }}>
            大手町調査室九課 | IPO企業情報AI分析レポート
          </div>
          <h1 style={{ fontSize: "clamp(28px, 5vw, 44px)", fontWeight: 900, color: "white", lineHeight: 1.4, marginBottom: 20 }}>
            目論見書を、<br/>読む必要はありません。
          </h1>
          <p style={{ fontSize: "clamp(14px, 2.5vw, 18px)", color: C.teal, fontWeight: 700, lineHeight: 1.7, marginBottom: 16 }}>
            AIが何百ページを読んで、あなたに届けます。
          </p>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 2, maxWidth: 560, margin: "0 auto 36px" }}>
            IPO投資に必要な情報は、すべて目論見書に書かれています。<br/>
            でも、それを読み解くのは専門家でも時間がかかる作業です。<br/>
            大手町調査室九課のAI分析レポートは、その作業を自動化しました。
          </p>
          <a href="/" style={{ display: "inline-block", padding: "14px 36px", backgroundColor: C.teal, color: C.dark, borderRadius: 12, fontWeight: 900, fontSize: 15, textDecoration: "none" }}>
            まず無料で試してみる →
          </a>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "0 16px 80px" }}>

        {/* ② できること */}
        <div style={{ marginTop: 64 }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.teal, letterSpacing: "0.1em" }}>FEATURES</span>
            <h2 style={{ fontSize: 26, fontWeight: 900, color: C.dark, marginTop: 8 }}>このサイトでできること</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            {[
              { icon: "📊", title: "AIスコアリング（A〜E評価）", body: "目論見書の財務データ・需給構造・成長性などを9軸で分析。初値狙い・短期・長期の3つの時間軸でそれぞれ評価します。" },
              { icon: "📈", title: "株価シナリオ（3パターン）", body: "「公募価格の1.8倍」「±10%」など、具体的な価格目標と確率・根拠をセットで提示。「なぜその評価なのか」が分かります。" },
              { icon: "📋", title: "目論見書の要点を自動抽出", body: "ロックアップ期間・流通比率・主要株主・資金使途など、IPO投資判断に直結する情報をまとめて確認できます。" },
            ].map((item, i) => (
              <div key={i} style={{ backgroundColor: "white", borderRadius: 16, border: `1px solid ${C.border}`, padding: "24px 20px" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>{item.icon}</div>
                <h3 style={{ fontSize: 14, fontWeight: 900, color: C.dark, marginBottom: 10, lineHeight: 1.5 }}>{item.title}</h3>
                <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.9 }}>{item.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ③ 他サイトとの違い */}
        <div style={{ marginTop: 72 }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.teal, letterSpacing: "0.1em" }}>DIFFERENCE</span>
            <h2 style={{ fontSize: 26, fontWeight: 900, color: C.dark, marginTop: 8 }}>他のIPOサイトとの違い</h2>
            <p style={{ fontSize: 13, color: "#64748b", marginTop: 12, lineHeight: 1.9 }}>
              「なんとなく人気がありそう」から<br/>
              <strong style={{ color: C.nav }}>「なぜ強気なのか、どのリスクに注意すべきか」</strong>へ。
            </p>
          </div>
          <div style={{ backgroundColor: "white", borderRadius: 16, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ backgroundColor: C.nav }}>
                  <th style={{ padding: "14px 20px", textAlign: "left", color: "white", fontWeight: 700 }}>比較項目</th>
                  <th style={{ padding: "14px 16px", textAlign: "center", color: "rgba(255,255,255,0.6)", fontWeight: 700 }}>一般IPOサイト</th>
                  <th style={{ padding: "14px 16px", textAlign: "center", color: C.teal, fontWeight: 900 }}>本サービス</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["上場日・公募価格・主幹事", true, true],
                  ["AIスコア・A〜E評価", false, true],
                  ["9軸詳細分析レポート", false, true],
                  ["株価シナリオ（3パターン）", false, true],
                  ["目論見書データ自動抽出", false, true],
                  ["競合他社との財務比較", false, true],
                  ["週次イベント通知メール", false, true],
                ].map(([label, general, ours], i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, backgroundColor: i % 2 === 0 ? "white" : C.light }}>
                    <td style={{ padding: "12px 20px", color: C.dark, fontWeight: i === 0 ? 400 : 600 }}>{label as string}</td>
                    <td style={{ padding: "12px 16px", textAlign: "center", fontSize: 18 }}>{general ? "✅" : "❌"}</td>
                    <td style={{ padding: "12px 16px", textAlign: "center", fontSize: 18 }}>{ours ? "✅" : "❌"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ④ 効果的な使い方 */}
        <div style={{ marginTop: 72 }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.teal, letterSpacing: "0.1em" }}>HOW TO USE</span>
            <h2 style={{ fontSize: 26, fontWeight: 900, color: C.dark, marginTop: 8 }}>効果的な使い方</h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[
              { step: "01", icon: "🗓️", title: "カレンダーで上場スケジュールを確認", body: "毎月のIPO銘柄をカレンダー形式で一覧表示。BB開始日・申込開始日・上場日が一目でわかります。気になる銘柄の番号をタップするとそのまま詳細へジャンプできます。" },
              { step: "02", icon: "⚡", title: "AI要約で気になる銘柄をスクリーニング", body: "トップページのAI分析要約を読んで、興味を持った銘柄だけを深掘り。すべての銘柄を調べる必要はありません。時間をかけずに投資候補を絞り込めます。" },
              { step: "03", icon: "🔬", title: "9軸レポートで投資判断を深める", body: "「需給の軽さ」「ロックアップ」「バリュエーション」「成長性」など9つの視点から詳細レポートを確認。判断の根拠が数値と文章でセットになっているので、自分なりの結論を出しやすくなります。" },
              { step: "04", icon: "🔔", title: "通知設定でBB開始を見逃さない", body: "BB（ブックビルディング）開始日を前週金曜日にメールでお知らせします。通知プランまたはコンプリートパックに登録することで、申込機会を逃さず投資行動に移れます。" },
            ].map((item, i) => (
              <div key={i} style={{ backgroundColor: "white", borderRadius: 16, border: `1px solid ${C.border}`, padding: "24px 24px", display: "flex", gap: 20, alignItems: "flex-start" }}>
                <div style={{ flexShrink: 0, width: 52, height: 52, borderRadius: 14, backgroundColor: C.light, border: `2px solid ${C.teal}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 9, fontWeight: 900, color: C.teal, letterSpacing: "0.05em" }}>STEP</span>
                  <span style={{ fontSize: 16, fontWeight: 900, color: C.nav, lineHeight: 1 }}>{item.step}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 20 }}>{item.icon}</span>
                    <h3 style={{ fontSize: 14, fontWeight: 900, color: C.dark, margin: 0 }}>{item.title}</h3>
                  </div>
                  <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.9, margin: 0 }}>{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ⑤ 注意事項 */}
        <div style={{ marginTop: 56, backgroundColor: "#fffbeb", border: "1px solid #fde68a", borderRadius: 14, padding: "20px 24px" }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#92400e", marginBottom: 8 }}>⚠️ ご利用にあたって</div>
          <p style={{ fontSize: 12, color: "#78350f", lineHeight: 1.9, margin: 0 }}>
            本サービスの分析はAIによる試算であり、<strong>投資勧誘ではありません。</strong>
            目論見書に記載のない情報は「不明」と表示されます。
            スコア・価格目標はAIの推計値であり、将来の結果を保証するものではありません。
            最終的な投資判断はご自身の責任のもとで行ってください。
          </p>
        </div>

        {/* ⑥ CTA */}
        <div style={{ marginTop: 64, background: `linear-gradient(135deg, ${C.dark} 0%, ${C.nav} 100%)`, borderRadius: 20, padding: "48px 32px", textAlign: "center" }}>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: "white", marginBottom: 12 }}>
            まず無料で試してみてください
          </h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.9, marginBottom: 28 }}>
            毎月、日付順で最初の2銘柄の分析レポートは完全無料。<br/>
            登録不要で、今すぐお読みいただけます。
          </p>
          <a href="/" style={{ display: "inline-block", padding: "14px 40px", backgroundColor: C.teal, color: C.dark, borderRadius: 12, fontWeight: 900, fontSize: 15, textDecoration: "none" }}>
            IPO銘柄一覧を見る →
          </a>
        </div>

      </div>
    </div>
  );
}