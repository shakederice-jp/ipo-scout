import type { Metadata } from "next";

// 2026/9/5追加: mypage/page.tsxはクライアントコンポーネントのためmetadataを
// 直接持てず、ルートlayout.tsxの汎用タイトルのままだった不足を補う(サイト全体のSEO対応⑤の一部)。
// マイページはログイン後の個人設定画面であり検索結果に出す意味が無い(robots.txtでも
// 既にDisallow: /mypage 済み)ため、念のためnoindexも明示しておく。
export const metadata: Metadata = {
  title: "マイページ",
  description: "プラン・通知設定・購入履歴の確認ページです。",
  robots: { index: false, follow: false },
};

export default function MypageLayout({ children }: { children: React.ReactNode }) {
  return children;
}
