import type { Metadata } from "next";
import "./globals.css";
import Script from "next/script";
import AppHeader from "@/components/AppHeader";
import LevelIntroBanner from "@/components/LevelIntroBanner";
import Footer from "@/components/Footer";
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

// 2026/9/5追加: サイト全体のSEO強化(⑤の一部)。運営組織の情報をGoogleに機械的に
// 伝えるOrganizationの構造化データ(JSON-LD)。全ページ共通でheadに埋め込む。
// これ自体は検索順位に直接効くものではないが、Googleニュース掲載やナレッジパネル等、
// 他のSEO施策の土台になる(順位を上げる魔法ではない点は運用メモにも記載)。
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "大手町調査室九課",
  url: "https://ipo.finance-tower.com",
  logo: "https://ipo.finance-tower.com/ogp.png",
  description: "目論見書等の公開情報をAIが解析し、IPO投資判断に役立つ分析レポートを提供するサービス。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&display=swap" rel="stylesheet" />
        {/* 2026/9/6追加: 「ホーム画面に追加(PWA化)」対応。manifest・アイコン・テーマカラーを設定し、
            Service Workerを登録する(オフラインキャッシュ等は行わず、インストール可能にするための最低限の対応)。 */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0d4f52" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" href="/icon-192.png" type="image/png" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
        <Script id="ga4-init" strategy="afterInteractive">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}');
        `}</Script>
        <Script id="sw-register" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function () {
              navigator.serviceWorker.register('/sw.js').catch(function () {});
            });
          }
        `}</Script>
      </head>
      <body>
        <AppProvider>
          <AppHeader />
          <LevelIntroBanner />
          <div className="app-content">{children}</div>
          <Footer />
        </AppProvider>
      </body>
    </html>
  );
}