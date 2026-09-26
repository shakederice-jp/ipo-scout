// 2026/9/26新設: 紹介特典(紹介した人・された人の両方に2ヶ月無料)の適用処理。
//
// 以前の問題: /api/referral がブラウザから送られてきた user_id をそのまま信じていたため、
// 自分の紹介コードと架空のIDを何度も送るだけで、紹介実績と無料期間をいくらでも増やせた
// (「先着100名」の枠も架空の紹介で埋められた)。
//
// 新しい仕組み:
//  1. 登録画面では、入力された紹介コードをその人のアカウント情報(user_metadata.pending_referral_code)に
//     預けておくだけにする。
//  2. 確認メールのリンクを押してログインが完了した時点(/auth/callback)で、サーバーが本人を確認したうえで
//     この applyPendingReferral() を呼び、1アカウント1回だけ特典を付ける。
//     (メール確認が不要な設定でその場でログインできた場合は、登録画面から /api/referral を呼び、
//      同じく本人確認済みの状態でこの処理を行う)
//  3. 条件: メール確認済み・登録から14日以内の新しいアカウント・自分のコードではない・まだ紹介特典を
//     使っていない。紹介の記録(referral_logs)を先に保存でき、その後で無料期間を付与する。
//  4. 無料期間(user_profiles.free_until)中は、プラン未加入でも有料の分析ページを読める
//     (src/lib/member-auth.ts の canReadPaidAnalysis)。
import type { User } from "@supabase/supabase-js";
import { getServiceSupabase } from "@/lib/member-auth";

export const REFERRAL_FREE_MONTHS = 2;
const NEW_ACCOUNT_DAYS = 14;

export type ReferralResult =
  | { ok: true }
  | { ok: false; reason: "no_code" | "invalid_code" | "self_referral" | "already_referred" | "not_confirmed" | "not_new_account" | "save_failed" };

export function normalizeReferralCode(code: unknown): string | null {
  if (typeof code !== "string") return null;
  const c = code.trim().toUpperCase();
  return /^[A-Z0-9]{4,20}$/.test(c) ? c : null;
}

function addMonthsFrom(base: string | null | undefined, months: number): string {
  const now = new Date();
  const b = base ? new Date(base) : now;
  const start = Number.isFinite(b.getTime()) && b > now ? b : now; // 無料期間が残っていれば、その続きから延長
  const d = new Date(start);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

export async function applyReferral(user: User, rawCode: unknown): Promise<ReferralResult> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return { ok: false, reason: rawCode ? "invalid_code" : "no_code" };
  if (!user.email_confirmed_at) return { ok: false, reason: "not_confirmed" };
  const created = Date.parse(user.created_at ?? "");
  if (!Number.isFinite(created) || Date.now() - created > NEW_ACCOUNT_DAYS * 86400000) {
    return { ok: false, reason: "not_new_account" };
  }

  const admin = getServiceSupabase();

  const { data: referrer } = await admin
    .from("user_profiles")
    .select("id, free_until, referral_count")
    .eq("referral_code", code)
    .maybeSingle();
  if (!referrer) return { ok: false, reason: "invalid_code" };
  if (referrer.id === user.id) return { ok: false, reason: "self_referral" };

  const { data: existing } = await admin
    .from("referral_logs")
    .select("id")
    .eq("referee_user_id", user.id)
    .limit(1);
  if (existing && existing.length > 0) return { ok: false, reason: "already_referred" };

  // 紹介の記録を先に保存する。保存できなかった場合は特典を付けない(二重付与・記録漏れの防止)。
  const { error: logError } = await admin.from("referral_logs").insert({
    referrer_user_id: referrer.id,
    referee_user_id: user.id,
    referrer_code: code,
    status: "completed",
  });
  if (logError) return { ok: false, reason: "save_failed" };

  // 紹介された人(本人)
  const { data: me } = await admin.from("user_profiles").select("free_until").eq("id", user.id).maybeSingle();
  await admin
    .from("user_profiles")
    .upsert({ id: user.id, free_until: addMonthsFrom(me?.free_until, REFERRAL_FREE_MONTHS) }, { onConflict: "id" });

  // 紹介した人
  await admin
    .from("user_profiles")
    .update({
      free_until: addMonthsFrom(referrer.free_until, REFERRAL_FREE_MONTHS),
      referral_count: (referrer.referral_count ?? 0) + 1,
    })
    .eq("id", referrer.id);

  return { ok: true };
}

// アカウント情報に預けておいた紹介コードがあれば適用し、成否にかかわらず預かりを消す(再適用の防止)
export async function applyPendingReferral(user: User): Promise<ReferralResult | null> {
  const pending = (user.user_metadata as any)?.pending_referral_code;
  if (!pending) return null;
  const result = await applyReferral(user, pending);
  // メール未確認の間は預かりを残しておき、確認後にもう一度試せるようにする
  if (result.ok || result.reason !== "not_confirmed") {
    try {
      await getServiceSupabase().auth.admin.updateUserById(user.id, {
        user_metadata: { ...(user.user_metadata ?? {}), pending_referral_code: null, referral_result: result.ok ? "applied" : result.reason },
      });
    } catch {
      // 消せなくても、referral_logs の重複チェックで二重付与はされない
    }
  }
  return result;
}
