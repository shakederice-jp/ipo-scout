import type { Metadata } from "next";
import "./globals.css";
import Script from "next/script";

export const metadata: Metadata = {
  title: {
    default: "IPO企業情報AI分析レポート｜大手町調査室九課",
    template: "%s｜大手町調査室九課",
  },
  description: "AIが目論見書を解析。超短期・短期・長期の投資時間軸で整理した深掘り分析レポートで、IPO投資の勝率を高めます。",
  keywords: ["IPO", "新規上場", "株", "投資分析", "初値", "目論見書"],
};

const GA_ID = "G-27Z6CDZXB1";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&display=swap"
          rel="stylesheet"
        />
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga4-init" strategy="afterInteractive">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}');
        `}</Script>
      </head>
      <body>{children}</body>
    </html>
  );
}