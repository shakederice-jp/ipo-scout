// 2026/9/26新設: 紹介特典(紹介した人・された人の両方に2ヶ月無料)の適用処理。
//
// 以前の問題: /api/referral がブラウザから送られてきた user_id をそのまま信じていたため、
// 自分の紹介コードと架空のIDを何度も送るだけで、紹介実績と無料期間をいくらでも増やせた
// (「先着300名」の枠も架空の紹介で埋められた)。
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
//  4. 無料期間(user_profiles.free_until)中は、プラン未加入でも有料の分析ページと週刊スライドを読める
//     (src/lib/member-auth.ts の canReadPaidAnalysis・canReadWeeklySlides)。通知・予定の自動登録は対象外。
import type { User } from "@supabase/supabase-js";
import { randomInt } from "crypto";
import { getServiceSupabase } from "@/lib/member-auth";

export const REFERRAL_FREE_MONTHS = 2;

// 2026/11/13改修: 「先着300名」は表記だけでなく、実際に上限で自動停止する。
// 上限に達したあとは、新しい紹介には特典を付けない(すでに付けた特典は取り消さない)。
// 紹介した人の特典に上限は設けない(紹介された人が登録するたびに、2ヶ月ずつ延びる)。
export const REFERRAL_CAP = 300;

export type ReferralStatus = { completed: number; cap: number; remaining: number; open: boolean };

// 特典が成立した件数(referral_logs の completed)と、残り枠。読み取りに失敗したときは「受付中」として扱い、登録を止めない。
export async function getReferralStatus(): Promise<ReferralStatus> {
  try {
    const { count, error } = await getServiceSupabase()
      .from("referral_logs")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed");
    if (error) throw error;
    const completed = count ?? 0;
    return { completed, cap: REFERRAL_CAP, remaining: Math.max(0, REFERRAL_CAP - completed), open: completed < REFERRAL_CAP };
  } catch (e) {
    console.error("referral status failed", e);
    return { completed: 0, cap: REFERRAL_CAP, remaining: REFERRAL_CAP, open: true };
  }
}

// 紹介コード(8文字・紛らわしい文字は除く)
function genCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[randomInt(chars.length)];
  return s;
}

export type ReferralProfile = { id: string; referral_code: string | null; free_until: string | null; referral_count: number | null };

// 2026/11/13新設: 会員情報(user_profiles)の行と紹介コードが無い会員に、その場で作る。
// 以前は「会員登録時にデータベース側で自動作成される」前提で、アプリ側には作る処理が無かった。
// 作られていない(または古い会員に紹介コードが無い)と、マイページの招待リンクが「?ref=」と空になり、紹介が一切成立しない。
export async function ensureReferralProfile(user: { id: string; email?: string | null }): Promise<ReferralProfile | null> {
  const admin = getServiceSupabase();
  const read = async () => {
    const { data, error } = await admin
      .from("user_profiles")
      .select("id, referral_code, free_until, referral_count")
      .eq("id", user.id)
      .maybeSingle();
    if (error) console.error("referral profile read failed", error.message);
    return (data as ReferralProfile | null) ?? null;
  };
  let profile = await read();
  if (profile?.referral_code) return profile;

  for (let i = 0; i < 6; i++) {
    const code = genCode();
    if (profile) {
      // 行はあるがコードが無い: コードが空のときだけ入れる(同時アクセスで上書きしないため)
      const { error } = await admin.from("user_profiles").update({ referral_code: code }).eq("id", user.id).is("referral_code", null);
      if (error && error.code !== "23505") { console.error("referral code update failed", error.message); break; }
    } else {
      // 行が無い: 作る。必須の列が足りずに失敗したときは、メールアドレスも付けてもう一度試す
      let { error } = await admin.from("user_profiles").insert({ id: user.id, referral_code: code });
      if (error && error.code !== "23505" && error.code !== "23503") {
        const retry = await admin.from("user_profiles").insert({ id: user.id, email: user.email ?? null, referral_code: code });
        error = retry.error;
      }
      if (error && error.code !== "23505") { console.error("referral profile insert failed", error.message); }
    }
    profile = await read();
    if (profile?.referral_code) return profile;
  }
  return profile;
}

// 紹介した人に「無料期間+2ヶ月・紹介人数+1」を付ける。紹介が同時に何件も入っても取りこぼさないよう、
// 読み取った値が変わっていたら読み直してやり直す。
async function grantToReferrer(referrerId: string): Promise<boolean> {
  const admin = getServiceSupabase();
  for (let i = 0; i < 8; i++) {
    const { data: cur } = await admin.from("user_profiles").select("free_until, referral_count").eq("id", referrerId).maybeSingle();
    if (!cur) return false;
    let q = admin.from("user_profiles")
      .update({ free_until: addMonthsFrom(cur.free_until, REFERRAL_FREE_MONTHS), referral_count: (cur.referral_count ?? 0) + 1 })
      .eq("id", referrerId);
    q = cur.free_until == null ? q.is("free_until", null) : q.eq("free_until", cur.free_until);
    q = cur.referral_count == null ? q.is("referral_count", null) : q.eq("referral_count", cur.referral_count);
    const { data: done, error } = await q.select("id");
    if (error) { console.error("referral grant (referrer) failed", error.message); return false; }
    if (done && done.length > 0) return true;
    // 他の紹介と同時に処理されて値が変わっていた: もう一度
  }
  return false;
}

// 2026/10/24(束A・⑤): 運営(大手町調査室九課)の公式の紹介コード。キャンペーンの申込みページ(/campaign)経由の登録に自動で使う。
// ・このコードで登録した人は、通常の紹介と同じく2ヶ月の特典(有料分析＋週刊スライド)を受ける。
// ・運営側のアカウントには特典(無料期間・紹介人数)を付けない(運営は元から全部読めるため)。紹介の記録(referral_logs)は残す。
// ・このコードは、マイケルさんのアカウント(user_profiles.referral_code)に設定しておく(SQLは束Aの案内を参照)。
export const OFFICIAL_REFERRAL_CODE = "OTEMACHI9";
const NEW_ACCOUNT_DAYS = 14;

export type ReferralResult =
  | { ok: true }
  | { ok: false; reason: "no_code" | "invalid_code" | "self_referral" | "already_referred" | "not_confirmed" | "not_new_account" | "cap_reached" | "save_failed" };

export function normalizeReferralCode(code: unknown): string | null {
  if (typeof code !== "string") return null;
  const c = code.trim().toUpperCase();
  // 2026/11/14: ハイフン・アンダースコアを含むコード(例: -7532)も有効にする。以前は英数字だけを許可していたため、記号入りのコードの紹介が「無効なコード」になっていた。
  return /^[A-Z0-9_-]{4,20}$/.test(c) ? c : null;
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

  // 先着の上限(300名)に達していたら、特典は付けない
  if (!(await getReferralStatus()).open) return { ok: false, reason: "cap_reached" };

  // 紹介の記録を先に保存する。保存できなかった場合は特典を付けない(二重付与・記録漏れの防止)。
  const { error: logError } = await admin.from("referral_logs").insert({
    referrer_user_id: referrer.id,
    referee_user_id: user.id,
    referrer_code: code,
    status: "completed",
  });
  if (logError) return { ok: false, reason: "save_failed" };

  // 紹介された人(本人)。会員情報の行がまだ無い場合に備えて、先に作ってから無料期間を付ける。
  // 付けられなかったときは、紹介の記録を取り消して「もう一度試せる」状態に戻す(記録だけ残って特典が付かない、を防ぐ)。
  const meProfile = await ensureReferralProfile(user);
  const { data: meDone, error: meErr } = await admin
    .from("user_profiles")
    .update({ free_until: addMonthsFrom(meProfile?.free_until, REFERRAL_FREE_MONTHS) })
    .eq("id", user.id)
    .select("id");
  if (meErr || !meDone || meDone.length === 0) {
    console.error("referral grant (referee) failed", meErr?.message ?? "no profile row");
    await admin.from("referral_logs").delete().eq("referee_user_id", user.id).eq("referrer_user_id", referrer.id);
    return { ok: false, reason: "save_failed" };
  }

  // 紹介した人(運営の公式コードの場合は、運営側に特典を付けない)。人数の上限は設けない。
  if (!(code === OFFICIAL_REFERRAL_CODE)) {
    const granted = await grantToReferrer(referrer.id);
    if (!granted) console.error("referral: referrer grant did not apply", referrer.id);
  }

  return { ok: true };
}

// アカウント情報に預けておいた紹介コードがあれば適用し、成否にかかわらず預かりを消す(再適用の防止)
export async function applyPendingReferral(user: User): Promise<ReferralResult | null> {
  const pending = (user.user_metadata as any)?.pending_referral_code;
  if (!pending) return null;
  const result = await applyReferral(user, pending);
  // メール未確認の間、または一時的に保存に失敗したときは預かりを残し、次のログイン時にもう一度試せるようにする
  if (result.ok || (result.reason !== "not_confirmed" && result.reason !== "save_failed")) {
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
