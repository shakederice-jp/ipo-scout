import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 2026/10/20追加(週刊PDFスライド): PDF作成ライブラリは、まとめ直さずそのまま読み込む(動作が安定する)
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;