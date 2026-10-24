import type { Metadata } from "next";
import { OFFICIAL_REFERRAL_CODE } from "@/lib/referral";
import { PLAN_CATALOG } from "@/lib/plan-catalog";

// 2026/10/24新設(束A・⑤): 友達紹介キャンペーンの申込みページ(誰でも見られる公開ページ)。
// Xなどからのリンク先。ここから登録すると、運営の公式コードが自動で適用され、2ヶ月の特典が付く。
// 登録後は、マイページで自分専用の招待リンクを取得して、友達に共有できる(友達が登録すると、さらに2ヶ月延びる)。
export const metadata: Metadata = {
  title: "友達紹介キャンペーン｜大手町調査室九課",
  description: "無料会員登録で、有料のIPO分析ページと週刊スライド(PDF)が2ヶ月間読み放題。友達を紹介すると、さらに2ヶ月延びます。",
  alternates: { canonical: "https://ipo.finance-tower.com/campaign" },
};

const C = { teal: "#66c3c6", nav: "#0d4f52", dark: "#082b2e", light: "#f0fafa", border: "#b3e8ea", mid: "#2a7a7e" };

export default function CampaignPage() {
  const c = PLAN_CATALOG.plan_c;
  // 登録画面へ。公式コードを付けて渡す(ReferralCapture が預かり、友達の招待コードがあればそちらを優先する)
  const joinHref = `/auth?ref=${OFFICIAL_REFERRAL_CODE}&utm_source=campaign&utm_medium=page&utm_campaign=referral`;

  return (
    <div style={{ backgroundColor: C.light, minHeight: "100vh", fontFamily: "'Noto Sans JP',sans-serif" }}>
      <div style={{ background: `linear-gradient(135deg, ${C.dark} 0%, ${C.nav} 100%)`, padding: "52px 24px 60px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.teal, letterSpacing: "0.1em", marginBottom: 14 }}>CAMPAIGN</div>
          <h1 style={{ fontSize: "clamp(22px,4vw,34px)", fontWeight: 900, color: "white", lineHeight: 1.5, margin: "0 0 14px" }}>
            友達紹介キャンペーン<br />有料分析＋週刊スライドが2ヶ月読み放題
          </h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.78)", lineHeight: 1.9, margin: "0 0 24px" }}>
            無料会員に登録するだけで、特典がつきます。クレジットカードの入力は要りません。
          </p>
          <a href={joinHref} style={{ display: "inline-block", padding: "14px 34px", backgroundColor: C.teal, color: C.dark, borderRadius: 12, fontWeight: 900, fontSize: 15, textDecoration: "none" }}>
            無料で登録して特典を受け取る →
          </a>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", margin: "12px 0 0" }}>先着100名限定・予告なく終了する場合があります</p>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 16px 72px" }}>
        {/* 特典の中身 */}
        <section style={{ backgroundColor: "white", border: `1.5px solid ${C.teal}`, borderRadius: 16, padding: "22px 24px", marginBottom: 20 }}>
          <h2 style={{ fontSize: 17, fontWeight: 900, color: C.dark, margin: "0 0 12px" }}>特典の内容（2ヶ月間）</h2>
          <ul style={{ margin: 0, padding: "0 0 0 18px", fontSize: 13, color: "#475569", lineHeight: 2 }}>
            <li><strong style={{ color: C.dark }}>有料の分析ページ</strong>が、全銘柄読み放題（投資スタイル別9軸のスコア・シナリオ分析・詳細インサイト）</li>
            <li><strong style={{ color: C.dark }}>週刊スライド（PDF）</strong>が読み放題（毎週金曜に公開。来週の予定・初値の結果・AI評価の答え合わせなどを、横向きのスライドにまとめています）</li>
          </ul>
          <p style={{ fontSize: 11, color: "#64748b", lineHeight: 1.8, margin: "12px 0 0" }}>
            ※通知（BB・申込・上場日・ロックアップ解除）と、予定の自動登録（カレンダー購読）は、特典の対象外です。
          </p>
        </section>

        {/* 参加の流れ */}
        <section style={{ backgroundColor: "white", border: `1px solid ${C.border}`, borderRadius: 16, padding: "22px 24px", marginBottom: 20 }}>
          <h2 style={{ fontSize: 17, fontWeight: 900, color: C.dark, margin: "0 0 14px" }}>参加の流れ</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { n: "①", t: "上のボタンから、メールアドレスで無料会員登録", d: "届いた確認メールのリンクを押すと、登録が完了して特典が始まります。" },
              { n: "②", t: "マイページで、自分専用の招待リンクを取得", d: "「友達招待プログラム」に、X・LINE・メールで送れる招待文も用意してあります。" },
              { n: "③", t: "友達が登録すると、あなたの特典がさらに2ヶ月延びる", d: "友達にも、同じ2ヶ月の特典がつきます。" },
            ].map((s) => (
              <div key={s.n} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ fontWeight: 900, color: C.nav, fontSize: 15 }}>{s.n}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: C.dark }}>{s.t}</div>
                  <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.8, marginTop: 2 }}>{s.d}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 期間のあと */}
        <section style={{ backgroundColor: "white", border: `1px solid ${C.border}`, borderRadius: 16, padding: "22px 24px", marginBottom: 20 }}>
          <h2 style={{ fontSize: 17, fontWeight: 900, color: C.dark, margin: "0 0 10px" }}>2ヶ月のあとは？</h2>
          <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.9, margin: 0 }}>
            特典の期間が終わっても、自動で課金されることはありません。続けて読みたい場合だけ、プランをお選びください。
            分析・通知・週刊スライド・予定の自動登録がそろった{c.letter} {c.name}は、{c.price}{c.period}です。
            <a href="/plans" style={{ color: C.nav, fontWeight: 700, marginLeft: 6 }}>料金プランを見る →</a>
          </p>
        </section>

        <div style={{ textAlign: "center", marginTop: 28 }}>
          <a href={joinHref} style={{ display: "inline-block", padding: "13px 30px", backgroundColor: C.nav, color: "white", borderRadius: 12, fontWeight: 900, fontSize: 14, textDecoration: "none" }}>
            無料で登録して特典を受け取る →
          </a>
          <p style={{ fontSize: 11, color: "#64748b", lineHeight: 1.8, margin: "14px 0 0" }}>
            すでに会員の方は、<a href="/mypage" style={{ color: C.nav, fontWeight: 700 }}>マイページ</a>から招待リンクを取得できます。<br />
            本サービスは情報提供を目的としたもので、投資の勧誘ではありません。
          </p>
        </div>
      </div>
    </div>
  );
}
