import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminRequest } from "@/lib/admin-auth";
import { REFERRAL_CAP, OFFICIAL_REFERRAL_CODE } from "@/lib/referral";

// 2026/11/13新設: 紹介機能が「どこで止まっているか」を調べる診断API(管理画面の「紹介機能を診断する」ボタンから呼ぶ)。
// 会員のメールアドレスなど個人情報は返さず、件数だけを返す。
//  1. 会員(認証)の人数 と 会員情報(user_profiles)の行数・紹介コードの有無
//  2. 紹介の成立記録(referral_logs)
//  3. 紹介コードで登録したのに特典が未適用の会員(確認メールを押していない/適用に失敗した理由の内訳)
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const notes: string[] = [];
  const problems: string[] = [];

  // 1. 会員(認証)
  let authTotal = 0, authConfirmed = 0, pendingUnapplied = 0, pendingUnconfirmed = 0;
  const results: Record<string, number> = {};
  try {
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      const users = data?.users ?? [];
      for (const u of users) {
        authTotal++;
        if (u.email_confirmed_at) authConfirmed++;
        const md: any = u.user_metadata ?? {};
        if (md.pending_referral_code) { if (u.email_confirmed_at) pendingUnapplied++; else pendingUnconfirmed++; }
        if (md.referral_result) results[String(md.referral_result)] = (results[String(md.referral_result)] ?? 0) + 1;
      }
      if (users.length < 200) break;
    }
  } catch (e: any) {
    notes.push("会員の一覧を読み取れませんでした: " + (e?.message ?? "error"));
  }

  // 2. 会員情報(user_profiles)
  let profTotal = 0, profNoCode = 0, freeActive = 0;
  const prof = await admin.from("user_profiles").select("id, referral_code, free_until").limit(20000);
  if (prof.error) {
    problems.push("会員情報(user_profiles)を読み取れませんでした: " + prof.error.message);
  } else {
    const now = Date.now();
    for (const r of prof.data ?? []) {
      profTotal++;
      if (!r.referral_code) profNoCode++;
      if (r.free_until && Date.parse(r.free_until) > now) freeActive++;
    }
  }

  // 運営の公式コード(キャンペーンページ経由の登録に使う)が、会員情報に設定されているか
  const { data: officialRow } = await admin.from("user_profiles").select("id").eq("referral_code", OFFICIAL_REFERRAL_CODE).maybeSingle();
  const officialOk = !!officialRow;

  // 3. 紹介の成立記録
  const logs = await admin.from("referral_logs").select("status, created_at").order("created_at", { ascending: false }).limit(2000);
  let logTotal = 0, logCompleted = 0, lastLogAt: string | null = null;
  if (logs.error) {
    problems.push("紹介の記録(referral_logs)を読み取れませんでした: " + logs.error.message + "(テーブルが無い、または権限(GRANT)が足りない可能性があります)");
  } else {
    for (const r of logs.data ?? []) { logTotal++; if (r.status === "completed") logCompleted++; }
    lastLogAt = (logs.data ?? [])[0]?.created_at ?? null;
  }

  // 見立て(原因の候補)
  if (authTotal > 0 && profTotal < authTotal) problems.push(`会員 ${authTotal}人のうち、会員情報(user_profiles)の行があるのは ${profTotal}人です。行が無い会員は招待コードを持てません。(2026/11/13の修正で、マイページを開いた時に自動で作るようにしました)`);
  if (profNoCode > 0) problems.push(`紹介コードが空の会員が ${profNoCode}人います。(マイページを開くと自動で付きます)`);
  if (!officialOk) problems.push("運営の公式コードが、どの会員にも設定されていません。キャンペーンページ経由の登録は、特典が付きません。(SQLでご自身のアカウントに設定が必要です)");
  if (pendingUnapplied > 0) problems.push(`紹介コードで登録したのに、特典が未適用の会員(メール確認済み)が ${pendingUnapplied}人います。ログインし直すと再適用されます。内訳は下の「適用結果」をご覧ください。`);
  if (pendingUnconfirmed > 0) notes.push(`確認メールのリンクをまだ押していない会員が ${pendingUnconfirmed}人います(押すと特典が付きます)。`);
  if (logCompleted === 0 && authTotal > 0) problems.push("紹介の成立記録が0件です。登録時の紹介コードの預かり、確認メール後の適用(/auth/callback)のどこかで止まっている可能性があります。");
  if (logCompleted >= REFERRAL_CAP) notes.push("先着の上限に達しているため、新しい紹介には特典が付きません。");

  return NextResponse.json({
    members: { total: authTotal, confirmed: authConfirmed },
    profiles: { total: profTotal, withoutCode: profNoCode, freeUntilActive: freeActive },
    officialCodeOk: officialOk,
    referral: { logsTotal: logTotal, completed: logCompleted, cap: REFERRAL_CAP, lastAt: lastLogAt, pendingUnapplied, pendingUnconfirmed, results },
    problems, notes,
  });
}
