import type { Metadata } from "next";
import "./globals.css";
import Script from "next/script";
import AppHeader from "@/components/AppHeader";
import LevelIntroBanner from "@/components/LevelIntroBanner";
import Footer from "@/components/Footer";
import InstallPwaButton from "@/components/InstallPwaButton";
import ReferralCapture from "@/components/ReferralCapture";
import { AppProvider } from "@/contexts/AppContext";

export const metadata: Metadata = {
  title: {
    // 2026/10/18修正(SEO対応): 以前は template が "%s | IPO Scout" で、各ページが自分で
    // 「｜大手町調査室九課」まで付けたタイトルの後ろに、さらに「| IPO Scout」が付いて
    // 二重になっていた(検索結果で長すぎて途中が切れる原因)。各ページのタイトルをそのまま使う。
    default: "IPOスケジュール・新規上場企業のAI分析｜大手町調査室九課",
    template: "%s",
  },
  description: "IPOスケジュール（新規上場一覧）と、目論見書をAIが解析した分析レポートを掲載。上場日・仮条件・申込日程・ロックアップ解除日、総合スコアと9軸の詳細分析が分かります。",
  keywords: ["IPO", "IPOスケジュール", "新規上場", "初値", "ロックアップ", "目論見書", "日本株"],
  verification: {
    google: "zxV54LwwUEhL4EUHpiVivnO2KykbnhJ3CGS6w01bYH4",
  },
};

// 2026/9/10追記: 従来設定されていたG-27Z6CDZXB1は、ユーザーが運営する別サイトの
// Googleアナリティクス測定IDが誤って設定されていたことが判明(本来このサイト専用の
// GA4プロパティが未作成のまま、他サイト用のIDが流用されていた)。このサイト専用に
// 新規作成したGA4プロパティの測定IDに置き換える。
const GA_ID = "G-XJ7BW6EJQE";

// 2026/9/10追加: Microsoft Clarity(ヒートマップ・セッション録画)の計測タグ。
const CLARITY_PROJECT_ID = "yg57k63pgd";

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
        <link rel="manifest" href="/manifest.json?v=3" />
        <meta name="theme-color" content="#0d4f52" />
        {/* 2026/10/29追加: ホーム画面に追加したときのアイコン名(iPhone用)と、新アイコン(?v=3は古いアイコンの記憶を避けるための印) */}
        <meta name="apple-mobile-web-app-title" content="AI×IPO" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=3" />
        <link rel="icon" href="/icon-192.png?v=3" type="image/png" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
        <Script id="ga4-init" strategy="afterInteractive">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}');
        `}</Script>
        <Script id="clarity-init" strategy="afterInteractive">{`
          (function(c,l,a,r,i,t,y){
            c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
            t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
            y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
          })(window, document, "clarity", "script", "${CLARITY_PROJECT_ID}");
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
          <ReferralCapture />
          <AppHeader />
          <LevelIntroBanner />
          <div className="app-content">{children}</div>
          <Footer />
          {/* 2026/10/29: ホーム画面に追加の案内(スマホで2ページ目以降を見たときだけ、下に小さく出る) */}
          <InstallPwaButton />
        </AppProvider>
      </body>
    </html>
  );
}