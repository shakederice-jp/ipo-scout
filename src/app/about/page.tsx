import type { Metadata } from "next";

// 2026/9/14新設(追記⑪-2、E-E-A-T対策): 投資(YMYL領域)はGoogleが特に信頼性を
// 厳しく評価するため、「なぜAI分析を信頼できるか」「9軸分析の根拠・データ源」
// 「AIの限界・免責」を1ページにまとめて説明するページを新設した。
// 既存のterms/page.tsx・privacy/page.tsx・tokushoho/page.tsxと同じ表記スタイル(S定数)を
// 踏襲しているが、あの2ページと違いこのページはSEO上の目的(信頼性シグナル)を持つため、
// robots:{index:false}は付けず、通常ページとして検索エンジンにインデックスさせる。
export const metadata: Metadata = {
  title: "運営者について・分析手法について｜大手町調査室九課",
  description: "大手町調査室九課の運営者情報、IPO分析AIが目論見書・EDINETをどう分析しているか、AI分析の限界と注意点について説明します。",
  alternates: { canonical: "https://ipo.finance-tower.com/about" },
};

const S = {
  wrap: { maxWidth: 720, margin: "0 auto", padding: "32px 16px 64px", fontFamily: "'Noto Sans JP',sans-serif" } as React.CSSProperties,
  h1:   { fontSize: 22, fontWeight: 900, color: "#082b2e", marginBottom: 24, paddingBottom: 12, borderBottom: "2px solid #b3e8ea" } as React.CSSProperties,
  h2:   { fontSize: 15, fontWeight: 900, color: "#0d4f52", marginTop: 28, marginBottom: 8 } as React.CSSProperties,
  p:    { fontSize: 13, color: "#374151", lineHeight: 1.9, marginBottom: 12 } as React.CSSProperties,
  ul:   { fontSize: 13, color: "#374151", lineHeight: 1.9, paddingLeft: 20, marginBottom: 12 } as React.CSSProperties,
  box:  { backgroundColor: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "14px 16px", marginBottom: 16 } as React.CSSProperties,
  note: { marginTop: 32, fontSize: 11, color: "#94a3b8", lineHeight: 1.8 } as React.CSSProperties,
};

export default function AboutPage() {
  return (
    <div style={{ backgroundColor: "#f4fbfc", minHeight: "100vh" }}>
      <div style={S.wrap}>
        <h1 style={S.h1}>運営者について・分析手法について</h1>

        <p style={S.p}>
          「IPO企業情報AI分析レポート」（大手町調査室九課）は、新規上場（IPO）企業の目論見書等の公開情報をAIが解析し、
          個人投資家の方が銘柄を検討する際の一次情報の整理をお手伝いするサービスです。このページでは、運営者情報・分析の仕組み・
          AIによる分析の限界について、できるだけ具体的にご説明します。
        </p>

        <h2 style={S.h2}>運営者について</h2>
        <p style={S.p}>
          本サービスは、個人事業主が「大手町調査室九課」の屋号で運営しています。詳しい運営者名・所在地等は
          <a href="/tokushoho" style={{ color: "#0d4f52", fontWeight: 700 }}>特定商取引法に基づく表記</a>をご覧ください。
          運営者自身も個人投資家としてIPO情報を日々追っており、「目論見書という一次情報を、忙しい個人投資家でも短時間で把握できる形にしたい」という
          動機から本サービスを開発・運営しています。
        </p>

        <h2 style={S.h2}>データソース</h2>
        <p style={S.p}>
          分析のベースとなる情報は、金融庁の開示システム「EDINET」に提出される有価証券届出書（目論見書）です。EDINETで新規のIPO関連書類を
          検知すると、その内容をAIが読み取り、事業内容・財務データ・株主構成・資金使途などを構造化したうえで分析を行います。
          市場動向・主幹事証券・類似IPOの実績等、目論見書だけでは分からない周辺情報についてはWeb検索を用いて補完しています。
        </p>

        <h2 style={S.h2}>9軸分析・スコアの根拠</h2>
        <p style={S.p}>
          各銘柄には、投資家の時間軸（超短期・短期・長期）ごとに、以下のような観点でAIがスコアリングを行っています。
        </p>
        <ul style={S.ul}>
          <li>需給の軽さ・流通株式比率（上場直後に売り圧力がどの程度かかりやすいか）</li>
          <li>ロックアップ（大株主がいつまで株式を売却できないか、解除タイミング）</li>
          <li>VC売却懸念（ベンチャーキャピタル等の保有比率と、解除後の売り圧力リスク）</li>
          <li>バリュエーション（類似企業・業界水準と比較した価格の妥当性）</li>
          <li>成長性・ユニットエコノミクス・経営陣・競合環境など、事業そのものの評価</li>
        </ul>
        <p style={S.p}>
          これらはすべて目論見書に記載された数値・事実と、公開されている市場情報にもとづくAIの試算・評価であり、
          運営者独自の非公開情報や内部情報を用いたものではありません。なぜ投資期間ごとに評価軸を分けているのか、各軸が何を見ているのかは、
          <a href="/methodology" style={{ color: "#0d4f52", fontWeight: 700 }}>9軸分析メソッドのページ</a>で詳しく解説しています。
        </p>

        <h2 style={S.h2}>AIによる分析の限界について</h2>
        <div style={S.box}>
          <p style={{ ...S.p, marginBottom: 0 }}>
            本サービスの分析・スコア・株価シナリオ等はAIによる試算値であり、将来の株価・初値等の結果を保証するものではありません。
            AIが目論見書の内容を誤って解釈したり、公開情報の更新に分析が追いついていない可能性もあります。運営者は内容を定期的に確認していますが、
            すべての記述を人力で逐一ファクトチェックしているわけではありません。本サービスの情報は投資勧誘や投資助言を目的としたものではなく、
            最終的な投資判断は、目論見書等の原本情報もあわせてご確認のうえ、利用者ご自身の責任において行っていただきますようお願いいたします。
          </p>
        </div>
        <p style={S.p}>
          また、本サービスでは「買うべき」「見送るべき」といった断定的な投資助言は行わず、見つかった事実・懸念点をできるだけ誠実にお伝えする方針で
          分析文を作成しています（強気一辺倒の煽り文句を避け、公募割れ等のリスクについても正直に記載する方針です）。詳しくは
          <a href="/terms" style={{ color: "#0d4f52", fontWeight: 700 }}>利用規約</a>・
          <a href="/privacy" style={{ color: "#0d4f52", fontWeight: 700 }}>プライバシーポリシー</a>もあわせてご確認ください。
        </p>

        <h2 style={S.h2}>更新頻度</h2>
        <p style={S.p}>
          EDINETへの新規開示は毎日自動で確認しており、新しいIPO情報を検知次第、分析を順次公開しています。上場日・初値等の実績が判明した銘柄については、
          該当ページに追記・更新を行っています。
        </p>

        <h2 style={S.h2}>お問い合わせ</h2>
        <p style={S.p}>
          分析内容に誤りと思われる点を見つけた場合や、ご意見・ご要望がございましたら、<a href="/contact" style={{ color: "#0d4f52", fontWeight: 700 }}>お問い合わせページ</a>より
          お気軽にご連絡ください。
        </p>

        <p style={S.note}>最終更新：2026年9月</p>
      </div>
    </div>
  );
}
