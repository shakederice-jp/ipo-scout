import { NextResponse } from "next/server";
import { ADMIN_COOKIE, adminCookieOptions } from "@/lib/admin-auth";

// 2026/9/26新設: 管理画面のログイン状態を消す(クッキーを削除する)。
export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(ADMIN_COOKIE, "", adminCookieOptions(0));
  return res;
}
