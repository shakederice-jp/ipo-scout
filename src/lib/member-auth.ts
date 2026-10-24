// 2026/9/26新設: 会員(ログインユーザー)の本人確認と、有料分析ページの閲覧権限の判定をまとめた共通処理。
//
// ・本人確認は supabase.auth.getUser() で行う。以前使っていた getSession() は、ブラウザのクッキーに
//   入っている情報を検証せずにそのまま返すため、サーバー側の権限判定に使うと、細工したクッキーで
//   他人になりすませるおそれがある(Supabase公式も、サーバー側では getUser() を使うよう案内している)。
// ・有料分析ページを読めるのは次のいずれか:
//     1. 分析レポートを読めるプラン(plan_a / plan_b / plan_c)に加入中
//     2. 紹介特典の無料期間中(user_profiles.free_until が未来の日時)
//        マイケルさんの方針(2026/9/26): 「2ヶ月無料」は、どのプランに加入していなくても
//        有料の分析ページが見られる特典。
//     3. その銘柄を単品購入済み(各ページ側で判定)
import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { createSupabaseRouteClient } from "@/lib/supabase/server";

// 2026/10/24(束A・④): 3プラン化。内部名は plan_a(A 分析) / plan_b(B 分析＋通知) / plan_c(C 総合)。
// 旧名 report / complete は、管理者が手で付けたものが残っていても読めるよう許可しておく(契約者は0人)。
export const PAID_ANALYSIS_PLANS = ["plan_a", "plan_b", "plan_c", "report", "complete"];
// 通知(週次メール・BB/申込/上場日・ロックアップ解除)を使えるプラン: B・C
export const NOTIFY_PLANS = ["plan_b", "plan_c", "complete"];
// 週刊スライド(PDF)・予定の自動登録を使えるプラン: Cだけ
export const SLIDES_PLANS = ["plan_c"];
export const CALENDAR_PLANS = ["plan_c"];

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

// 2026/10/20追加(案2)・2026/10/24変更(束A): 週刊PDFスライドを読めるか。
// Cプラン、または紹介特典の無料期間中(友達紹介の特典は「Aの内容＋週刊スライド」)。A・Bだけの人は読めない。
export function canReadWeeklySlides(profile: { plan?: string | null; free_until?: string | null } | null | undefined): boolean {
  if (!profile) return false;
  if (profile.plan && SLIDES_PLANS.includes(profile.plan)) return true;
  return isFreeUntilActive(profile.free_until);
}

// 通知機能(銘柄ごとの通知設定など)を使えるか: B・Cプラン。紹介特典の期間中は対象外。
export function canUseNotifications(profile: { plan?: string | null } | null | undefined): boolean {
  return !!profile?.plan && NOTIFY_PLANS.includes(profile.plan);
}

// 予定の自動登録(カレンダー購読)を使えるか: Cプランのみ。紹介特典の期間中は対象外。
export function canUseCalendarFeed(profile: { plan?: string | null } | null | undefined): boolean {
  return !!profile?.plan && CALENDAR_PLANS.includes(profile.plan);
}
