import type { Metadata } from "next";
import "./globals.css";
import Script from "next/script";
import AppHeader from "@/components/AppHeader";
import { AppProvider } from "@/contexts/AppContext";

export const metadata: Metadata = {
  title: {
    default: "IPO Scout | AI駆動のIPO分析・投資判断支援サービス",
    template: "%s | IPO Scout",
  },
  description: "AI分析で日本のIPO投資判断をサポート。初値予測・スコアリング・需給分析・財務分析を提供します。",
  keywords: ["IPO", "新規上場", "投資", "分析", "初値予測", "日本株"],
  verification: {
    google: "zxV54LwwUEhL4EUHpiVivnO2KykbnhJ3CGS6w01bYH4",
  },
};

const GA_ID = "G-27Z6CDZXB1";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&display=swap" rel="stylesheet" />
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
        <Script id="ga4-init" strategy="afterInteractive">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}');
        `}</Script>
      </head>
      <body>
        <AppProvider>
          <AppHeader />
          <div className="app-content">{children}</div>
        </AppProvider>
      </body>
    </html>
  );
}