import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "IPO企業情報AI分析レポート | 大手町調査室九課",
    template: "%s | 大手町調査室九課",
  },
  description:
    "AIが目論見書を解析。超短期・短期・長期の投資時間軸で整理した深掘り分析レポートで、IPO投資の勝率を高めます。",
  keywords: ["IPO", "新規上場", "株", "投資分析", "初値", "目論見書"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}