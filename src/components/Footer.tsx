// サイト共通のフッター。
// 以前はトップページ(src/app/page.tsx)にだけ直書きされており、他のページには
// 表示されていなかった。2026/8/29、「フッターは全ページに置いてほしい」との要望を
// 受け、共通コンポーネントとして切り出し、ルートレイアウト(src/app/layout.tsx)に
// 配置することで全ページ共通で表示されるようにした。
//
// あわせて、スマホ幅で見たときにリンクの日本語が1文字ずつ縦に折り返されてしまう
// 不具合があった(display:flexの子要素であるリンクが、横並びを維持しようとして
// 極端に狭い幅まで縮み、スペースの無いCJKテキストが文字単位で改行されてしまう、
// という典型的なflexboxの罠)。対応として、表示するリンクを主要な3つ
// (特定商取引法に基づく表記・プライバシーポリシー・お問い合わせ)に絞り、
// 各リンクにwhiteSpace:"nowrap"を指定して文字単位の折り返しを防いだ。
export default function Footer() {
  return (
    <footer style={{ borderTop: "1px solid #b3e8ea", backgroundColor: "white", padding: "24px 16px", textAlign: "center" as const }}>
      {/* 2026/9/12新設: サイト内の主要ページへの内部リンク行。以前は法的表記3リンクのみ
          だったが、ユーザー要望「今後も内部的なリンクを張り巡らせたい」を受けて追加。
          全ページ共通フッターに置くことで、どのページからでも主要ページへ1クリックで
          移動できるようにした。折り返し対策は既存の3リンク行と同じ方針
          (flexWrap+各リンクにwhiteSpace:nowrap)を踏襲。 */}
      <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap" as const, gap: 16, marginBottom: 14 }}>
        <a href="/" style={{ fontSize: 12, fontWeight: 700, color: "#0d4f52", textDecoration: "none", whiteSpace: "nowrap" as const }}>ホーム</a>
        <a href="/plans" style={{ fontSize: 12, fontWeight: 700, color: "#0d4f52", textDecoration: "none", whiteSpace: "nowrap" as const }}>料金プラン</a>
        <a href="/trends" style={{ fontSize: 12, fontWeight: 700, color: "#0d4f52", textDecoration: "none", whiteSpace: "nowrap" as const }}>トレンド記事</a>
        <a href="/ipo-guide" style={{ fontSize: 12, fontWeight: 700, color: "#0d4f52", textDecoration: "none", whiteSpace: "nowrap" as const }}>実践的法則ガイド</a>
        {/* 2026/9/12改修: 「マイページ」だけだと、押した先で急に「ログインが必要」と
            出るまで無料か有料か分からなかったため、無料で登録できることを明示
            (サイト全体のフリー/有料導線見直しの一環)。 */}
        <a href="/mypage" style={{ fontSize: 12, fontWeight: 700, color: "#0d4f52", textDecoration: "none", whiteSpace: "nowrap" as const }}>マイページ（無料登録）</a>
      </div>
      <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap" as const, gap: 16, marginBottom: 10 }}>
        <a href="/tokushoho" style={{ fontSize: 11, color: "#66c3c6", textDecoration: "none", whiteSpace: "nowrap" as const }}>特定商取引法に基づく表記</a>
        <span style={{ color: "#e2e8f0" }}>|</span>
        <a href="/privacy" style={{ fontSize: 11, color: "#66c3c6", textDecoration: "none", whiteSpace: "nowrap" as const }}>プライバシーポリシー</a>
        <span style={{ color: "#e2e8f0" }}>|</span>
        <a href="/contact" style={{ fontSize: 11, color: "#66c3c6", textDecoration: "none", whiteSpace: "nowrap" as const }}>お問い合わせ</a>
      </div>
      <p style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.7, margin: 0 }}>
        本サービスの分析・スコアはAIによる試算値であり、投資勧誘ではありません。<br />
        最終的な投資判断はご自身の責任のもとで行ってください。<br />
        © 2026 大手町調査室九課｜本サービスのコンテンツ・AI分析結果の無断転載・複製を禁じます。
      </p>
    </footer>
  );
}
