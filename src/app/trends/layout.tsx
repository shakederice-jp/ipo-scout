import type { Metadata } from "next";

// 2026/9/5追加: trends/page.tsxはクライアントコンポーネント("use client")のため
// metadataを直接持てず、これまでルートlayout.tsxの汎用タイトル・説明文が
// そのまま使われてしまっていた(サイト全体のSEO対応⑤の一部)。
// トレンドページ専用のタイトル・説明文を、このlayout.tsxで設定する。
export const metadata: Metadata = {
  title: "大手町発マーケットトレンド｜IPO最新ニュース",
  description:
    "IPO・スタートアップ・資金調達の最新動向を1日3回チェック。超短期・短期・長期といった投資スタイル別の視点も交えてお届けする、今までにない画期的なマーケットトレンド情報です。",
  openGraph: {
    title: "大手町発マーケットトレンド｜IPO最新ニュース",
    description: "IPO・スタートアップ・資金調達の最新動向を1日3回チェック。投資スタイル別の視点も交えてお届けします。",
    url: "https://ipo.finance-tower.com/trends",
    siteName: "大手町調査室九課",
    locale: "ja_JP",
    type: "website",
  },
  alternates: { canonical: "https://ipo.finance-tower.com/trends" },
};

export default function TrendsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
