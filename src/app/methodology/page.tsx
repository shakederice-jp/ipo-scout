import type { Metadata } from "next";
import Link from "next/link";

// 2026/9/14新設(追記⑮、AI生成コンテンツのSEO対策): Googleの公式見解は
// 「AI生成そのものはマイナス評価の対象ではなく、価値を生まない大量生成
// (scaled content abuse)が問題」というもの。このサイトの最大の差別化要素は、
// 投資期間(超短期・短期・長期)ごとに評価軸を分ける「9軸分析」という独自の
// フレームワークであり、これを深く解説する専用ページを新設することで、
// 「他にはない独自の視点」をGoogle・読者の双方に伝える狙い。
// 内容はsrc/app/api/axes/route.tsのAXIS_CONFIG・AXIS_NAMES・gradeFromScoreを
// そのまま根拠にしており、実際の分析ロジックと食い違う説明は書いていない。
export const metadata: Metadata = {
  title: "9軸分析メソッドとは｜投資期間別スコアリングの仕組み｜大手町調査室九課",
  description: "大手町調査室九課のIPO分析は、超短期・短期・長期の3つの投資期間ごとに3つずつ、計9つの評価軸でスコアリングします。9軸分析メソッドの考え方と各軸の意味を解説します。",
  alternates: { canonical: "https://ipo.finance-tower.com/methodology" },
};

const S = {
  wrap: { maxWidth: 760, margin: "0 auto", padding: "32px 16px 64px", fontFamily: "'Noto Sans JP',sans-serif" } as React.CSSProperties,
  h1:   { fontSize: 22, fontWeight: 900, color: "#082b2e", marginBottom: 12, paddingBottom: 12, borderBottom: "2px solid #b3e8ea" } as React.CSSProperties,
  lead: { fontSize: 13, color: "#374151", lineHeight: 1.9, marginBottom: 28 } as React.CSSProperties,
  h2:   { fontSize: 15, fontWeight: 900, color: "#0d4f52", marginTop: 32, marginBottom: 8 } as React.CSSProperties,
  p:    { fontSize: 13, color: "#374151", lineHeight: 1.9, marginBottom: 12 } as React.CSSProperties,
  note: { marginTop: 32, fontSize: 11, color: "#94a3b8", lineHeight: 1.8 } as React.CSSProperties,
};

const GROUPS = [
  {
    key: "ultra_short",
    icon: "⚡",
    label: "超短期（初値〜当日）",
    color: "#ef4444",
    bg: "#fee2e2",
    why: "上場直後は業績よりも「需給」が株価を左右しやすい期間です。どれだけ株式が市場に出回るか、いつ売却制限が外れるか、どのタイミングで上場するかが、初値・当日の値動きに直結します。",
    axes: [
      { name: "需給の軽さ（Float）", desc: "発行済株式のうち、実際に市場で売買できる株式(流通株式比率)がどれくらいあるか。比率が低いほど需給がタイトになり、値動きが大きくなりやすい傾向があります。" },
      { name: "ロックアップ", desc: "創業者・VC等の大株主に対する売却制限の有無・期間。制限が強いほど上場直後の需給は安定しやすくなります。" },
      { name: "上場タイミング", desc: "上場する時期の市況・地合いや、直近の類似IPOの初値実績など、需給に影響しうる外部環境。" },
    ],
  },
  {
    key: "short",
    icon: "📈",
    label: "短期（1〜3ヶ月）",
    color: "#d97706",
    bg: "#fef3c7",
    why: "数週間〜数ヶ月のスパンでは、需給の偏りが落ち着く一方で、公募価格が妥当だったか、大株主の売却懸念が残っていないか、事業の成長性といった要素が徐々に効いてきます。",
    axes: [
      { name: "バリュエーション", desc: "類似企業・業界水準と比較して、公募価格・時価総額が割高か割安か。" },
      { name: "VC・大株主売り圧力", desc: "ベンチャーキャピタル等の保有比率と、ロックアップ解除後に売却が出やすいかどうかの懸念。" },
      { name: "成長性", desc: "目論見書に記載された成長ドライバー・事業拡大の見通し。" },
    ],
  },
  {
    key: "long",
    icon: "🏛",
    label: "長期（数年〜）",
    color: "#7c3aed",
    bg: "#ede9fe",
    why: "数年単位で保有するなら、短期的な需給よりも「事業として続けて成長できるか」が重要になります。経営陣の体制、収益構造の健全性、競合との位置関係を重視します。",
    axes: [
      { name: "経営陣", desc: "目論見書に記載された経営陣の経歴・体制。" },
      { name: "ユニットエコノミクス", desc: "売上・利益率・キャッシュフローなど、事業の収益構造が健全か。" },
      { name: "競合環境", desc: "同業他社との比較における立ち位置・差別化要素。" },
    ],
  },
];

export default function MethodologyPage() {
  return (
    <div style={{ backgroundColor: "#f4fbfc", minHeight: "100vh" }}>
      <div style={S.wrap}>
        <h1 style={S.h1}>9軸分析メソッドとは</h1>
        <p style={S.lead}>
          IPO投資は、初値だけを狙う人もいれば、数年単位でじっくり保有する人もいます。同じ銘柄でも「いつまで持つか」によって注目すべきポイントはまったく異なるため、大手町調査室九課では、投資期間を<strong>超短期・短期・長期</strong>の3つに分け、それぞれに3つずつ、合計<strong>9つの評価軸</strong>でスコアリングする「9軸分析」という独自のフレームワークを採用しています。
        </p>

        {GROUPS.map((g) => (
          <div key={g.key} style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 20 }}>{g.icon}</span>
              <h2 style={{ ...S.h2, margin: 0, color: g.color }}>{g.label}</h2>
            </div>
            <p style={S.p}>{g.why}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {g.axes.map((a) => (
                <div key={a.name} style={{ backgroundColor: g.bg, borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: "#082b2e", marginBottom: 4 }}>{a.name}</div>
                  <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.8 }}>{a.desc}</div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <h2 style={S.h2}>スコアとランクの見方</h2>
        <p style={S.p}>
          各軸は0〜100点でスコアリングし、80点以上をAランク、65点以上をBランク、50点以上をCランク、35点以上をDランク、それ未満をEランクとして表示しています。総合スコアも同じ基準です。数値はあくまでAIによる目論見書等の公開情報の分析結果であり、将来の株価を保証するものではありません。
        </p>

        <h2 style={S.h2}>データソースと執筆方針</h2>
        <p style={S.p}>
          分析のベースは、金融庁の開示システム「EDINET」に提出される目論見書です。財務データ・株主構成・ロックアップ条件などはこの一次情報から構造化して抽出し、主幹事・類似IPOの実績など目論見書だけでは分からない周辺情報はWeb検索で補完しています。「買うべき」「見送るべき」といった断定的な結論は書かず、見つかった事実・懸念点を根拠とともに提示し、最終的な判断は読者に委ねる方針で執筆しています。データソース・AIの限界についての詳しい説明は、<Link href="/about" style={{ color: "#0d4f52", fontWeight: 700 }}>運営者について・分析手法についてのページ</Link>をご覧ください。
        </p>

        <div style={{ marginTop: 28, display: "flex", gap: 10, flexWrap: "wrap" as const }}>
          <Link href="/" style={{ display: "inline-block", padding: "10px 22px", backgroundColor: "#66c3c6", color: "#082b2e", borderRadius: 8, fontWeight: 800, fontSize: 13, textDecoration: "none" }}>
            実際の分析レポートを見る →
          </Link>
          <Link href="/ipo-guide" style={{ display: "inline-block", padding: "10px 22px", backgroundColor: "white", color: "#0d4f52", border: "1px solid #66c3c6", borderRadius: 8, fontWeight: 800, fontSize: 13, textDecoration: "none" }}>
            投資期間別の実践的法則ガイドを読む →
          </Link>
        </div>

        <p style={S.note}>最終更新：2026年9月</p>
      </div>
    </div>
  );
}
