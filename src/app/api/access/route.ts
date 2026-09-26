import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { canReadPaidAnalysis, PAID_ANALYSIS_PLANS } from "@/lib/member-auth";

export async function GET(req: NextRequest) {
  const stockId  = req.nextUrl.searchParams.get("stock_id") ?? "";
  const isFreeQ  = req.nextUrl.searchParams.get("is_free") === "true";
  const freeRank = parseInt(req.nextUrl.searchParams.get("free_rank") ?? "99");

  // 無料枠（上位3社）は誰でも閲覧可
  if (isFreeQ || freeRank < 3) {
    return NextResponse.json({ access: true, reason: "free" });
  }

  // セッションからユーザーを取得
  const cookieStore = await cookies();
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value } }
  );
  const { data: { user } } = await supabaseUser.auth.getUser();

  if (!user) {
    return NextResponse.json({ access: false, reason: "not_logged_in" });
  }

  // サービスロールで権限チェック
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // サブスクプランを確認
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("plan, free_until")
    .eq("id", user.id)
    .single();

  // 2026/9/26修正: 分析ページ本体(src/app/analysis/[id]/page.tsx)と判定をそろえた。以前は「free以外の
  // プランなら閲覧可」としていたため、分析レポートを含まない通知プラン(notify)でも閲覧可と判定していた。
  // あわせて紹介特典の無料期間中も閲覧可とする(src/lib/member-auth.ts 参照)。
  if (canReadPaidAnalysis(profile)) {
    return NextResponse.json({ access: true, reason: profile?.plan && PAID_ANALYSIS_PLANS.includes(profile.plan) ? "subscription" : "referral_free" });
  }

  // 単品購入を確認
  const { data: purchased } = await supabase
    .from("purchased_stocks")
    .select("id")
    .eq("user_id", user.id)
    .eq("stock_id", stockId)
    .single();

  if (purchased) {
    return NextResponse.json({ access: true, reason: "purchased" });
  }

  return NextResponse.json({ access: false, reason: "paywall" });
}