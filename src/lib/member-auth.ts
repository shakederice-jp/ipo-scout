// 2026/9/26新設: 会員(ログインユーザー)の本人確認と、有料分析ページの閲覧権限の判定をまとめた共通処理。
//
// ・本人確認は supabase.auth.getUser() で行う。以前使っていた getSession() は、ブラウザのクッキーに
//   入っている情報を検証せずにそのまま返すため、サーバー側の権限判定に使うと、細工したクッキーで
//   他人になりすませるおそれがある(Supabase公式も、サーバー側では getUser() を使うよう案内している)。
// ・有料分析ページを読めるのは次のいずれか:
//     1. 分析レポートを読めるプラン(report / complete)に加入中
//     2. 紹介特典の無料期間中(user_profiles.free_until が未来の日時)
//        マイケルさんの方針(2026/9/26): 「2ヶ月無料」は、どのプランに加入していなくても
//        有料の分析ページが見られる特典。
//     3. その銘柄を単品購入済み(各ページ側で判定)
import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { createSupabaseRouteClient } from "@/lib/supabase/server";

export const PAID_ANALYSIS_PLANS = ["report", "complete"];

export const getServiceSupabase = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// ログイン中の会員を、Supabaseの認証サーバーに問い合わせて確認する(未ログイン・無効なら null)
export async function getVerifiedUser(): Promise<User | null> {
  const routeClient = await createSupabaseRouteClient();
  if (!routeClient) return null;
  try {
    const { data, error } = await routeClient.auth.getUser();
    if (error || !data?.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

export function isFreeUntilActive(freeUntil: string | null | undefined, now: Date = new Date()): boolean {
  if (!freeUntil) return false;
  const t = Date.parse(freeUntil);
  return Number.isFinite(t) && t > now.getTime();
}

// プラン加入または紹介特典の無料期間中なら、有料分析ページを(銘柄を問わず)読める
export function canReadPaidAnalysis(profile: { plan?: string | null; free_until?: string | null } | null | undefined): boolean {
  if (!profile) return false;
  if (profile.plan && PAID_ANALYSIS_PLANS.includes(profile.plan)) return true;
  return isFreeUntilActive(profile.free_until);
}
