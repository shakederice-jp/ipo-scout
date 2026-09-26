import { NextRequest, NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/admin-auth";

// 2026/9/26新設: 管理画面を開いたときに「すでにログイン済みか」を確認するためのAPI。
// ログイン状態のクッキーはJavaScriptから読めない(httpOnly)ため、サーバーに問い合わせる。
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return NextResponse.json({ authed: hasAdminSession(req) }, { headers: { "Cache-Control": "no-store" } });
}
