import type { Metadata } from "next";

// 2026/9/5追加: contact/page.tsxはクライアントコンポーネントのためmetadataを
// 直接持てず、ルートlayout.tsxの汎用タイトルのままだった不足を補う(サイト全体のSEO対応⑤の一部)。
export const metadata: Metadata = {
  title: "お問い合わせ",
  description: "IPO企業情報AI分析レポートに関するお問い合わせ・不具合報告はこちらから。",
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
