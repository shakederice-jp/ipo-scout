import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 2026/10/20追加(週刊PDFスライド): PDF作成ライブラリは、まとめ直さずそのまま読み込む(動作が安定する)
  serverExternalPackages: ["@react-pdf/renderer"],
  // 2026/11/11(サブディレクトリ化): このアプリは https://finance-tower.com/ipo-jp 以下で公開する。
  // 親サイト(finance-tower)が /ipo-jp/… をこのアプリへ中継する(rewrites)。
  basePath: "/ipo-jp",
  // 旧アドレス(ipo.finance-tower.com)へのアクセスは、新しい場所へ恒久的に転送する(検索順位・既存のリンクを引き継ぐ)。
  // 親サイト経由のアクセスはHostが別になるため、転送が繰り返されることはない。
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "ipo.finance-tower.com" }],
        destination: "https://finance-tower.com/ipo-jp/:path*",
        permanent: true,
        basePath: false,
      },
    ];
  },
};

export default nextConfig;
