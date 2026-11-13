import { NextResponse } from "next/server";
import { getReferralStatus } from "@/lib/referral";

// 2026/11/13新設: 紹介特典が受付中かどうか(先着の上限に達していないか)を返す公開API。
// 登録画面・マイページ・キャンペーンページが「受付終了」の表示に切り替えるために使う。件数そのものは返さず、残り枠だけ返す。
export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getReferralStatus();
  return NextResponse.json(
    { open: s.open, remaining: s.remaining, cap: s.cap },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } }
  );
}
