import type { Metadata } from "next";

// 2026/9/12追加: ipo-guide/page.tsxはクライアントコンポーネント("use client")のため
// metadataを直接持てず、これまでルートlayout.tsxの汎用タイトル・説明文がそのまま
// 使われてしまっていた(9/5のtrends/contact/mypage対応時に、このページだけ対応が漏れていた)。
// IPO投資ガイド専用のタイトル・説明文を、このlayout.tsxで設定する。
export const metadata: Metadata = {
  title: "IPO投資で資産を増やす実践的法則｜超短期・短期・長期戦略｜大手町調査室九課",
  description:
    "IPO投資で勝率を上げる実践的法則を解説。超短期(初値狙い)・短期・長期、投資スタイル別の戦略とリスク管理を、目論見書をAIが分析した一次情報をもとに紹介します。",
  openGraph: {
    title: "IPO投資で資産を増やす実践的法則｜超短期・短期・長期戦略",
    description: "超短期・短期・長期、投資スタイル別のIPO投資戦略を解説します。",
    url: "https://ipo.finance-tower.com/ipo-guide",
    siteName: "大手町調査室九課",
    locale: "ja_JP",
    type: "website",
  },
  alternates: { canonical: "https://ipo.finance-tower.com/ipo-guide" },
};

export default function IpoGuideLayout({ children }: { children: React.ReactNode }) {
  return children;
}
