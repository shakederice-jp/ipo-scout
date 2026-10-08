import { NextResponse } from "next/server";
import { getCompanies } from "@/lib/get-companies";

const requestCounts = new Map<string, { count: number; resetAt: number }>();

export async function GET(req: Request) {
  // レート制限：同一IPから1分間に30回まで
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const now = Date.now();
  const limit = requestCounts.get(ip);
  if (limit && now < limit.resetAt) {
    if (limit.count >= 30) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    limit.count++;
  } else {
    requestCounts.set(ip, { count: 1, resetAt: now + 60000 });
  }

  // 2026/10/7改修: データ取得処理は src/lib/get-companies.ts に一本化した
  // (トップページのサーバー側でも同じデータを使うため。GEO対応メモ参照)。
  try {
    const data = await getCompanies();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "不明なエラー" }, { status: 500 });
  }
}