import { NextResponse, type NextRequest } from "next/server";
import { hasAdminSession, isCronRequest } from "@/lib/admin-auth";

// 2026/9/26新設: 管理用APIの門番(Next.js 16 の proxy。旧名 middleware)。
// 下の matcher に書いたURLへのアクセスは、すべてここを通ってから各APIに届く。
//  ・管理画面にログイン済み(署名付きクッキーあり)、または定期実行・内部呼び出し
//    (Authorization: Bearer CRON_SECRET)なら通す。
//  ・どちらでもなければ、APIを動かさずに 401(認証が必要)を返す。
// 詳しい仕組みは src/lib/admin-auth.ts を参照。

// ログイン前でも呼べる必要があるもの(ログイン・ログアウト・ログイン状態の確認)
const PUBLIC_PATHS = new Set(["/api/admin/login", "/api/admin/logout", "/api/admin/session"]);

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname.replace(/\/+$/, "");

  if (PUBLIC_PATHS.has(path)) return NextResponse.next();

  // 定期実行・内部呼び出しは、合言葉が合っていればそのまま通す
  if (isCronRequest(request)) return NextResponse.next();

  if (hasAdminSession(request)) {
    // 定期実行用API(/api/cron/...)を管理画面から手動で動かす場合は、各APIが見ている
    // 合言葉をサーバー内でだけ付け足す(合言葉そのものはブラウザに渡さない)。
    if (path.startsWith("/api/cron/") && process.env.CRON_SECRET) {
      const headers = new Headers(request.headers);
      headers.set("authorization", `Bearer ${process.env.CRON_SECRET}`);
      return NextResponse.next({ request: { headers } });
    }
    return NextResponse.next();
  }

  return NextResponse.json(
    { error: "Unauthorized", message: "管理画面へのログインが必要です(ログインの有効期限が切れた場合は、ページを再読み込みしてログインし直してください)" },
    { status: 401 }
  );
}

// 対象のURL(ここに無いURLには一切影響しない)
//  ・/api/admin/...   管理画面の各機能
//  ・/api/cron/...    定期実行(Xへの自動投稿・会員へのメール送信なども含む)
//  ・AIで分析を作成・上書きするAPI(STEP1〜8)と、デバッグ用API
export const config = {
  matcher: [
    "/api/admin/:path*",
    "/api/cron/:path*",
    "/api/analyze/:path*",
    "/api/axes/:path*",
    "/api/axes-beginner/:path*",
    "/api/deep-dive/:path*",
    "/api/visualize/:path*",
    "/api/structure/:path*",
    "/api/market/:path*",
    "/api/competitor/:path*",
    "/api/edinet/:path*",
    "/api/edinet-codes/:path*",
    "/api/debug-stripe/:path*",
  ],
};
