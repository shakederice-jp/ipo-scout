import { NextRequest, NextResponse } from "next/server";
import { getVerifiedUser, getServiceSupabase } from "@/lib/member-auth";
import { applyReferral, applyPendingReferral } from "@/lib/referral";

// 紹介コードの適用 & 自分の紹介コードの取得。
// 2026/9/26修正: 以前はブラウザから送られてきた user_id をそのまま信じていたため、架空のIDで何度でも
// 紹介特典を発生させられた。現在はログイン情報からサーバー側で本人を確認し(src/lib/member-auth.ts)、
// 適用の条件チェックは src/lib/referral.ts にまとめている。
// 通常の流れでは、紹介特典は確認メールのリンクを押した時点(/auth/callback)で自動的に適用される。
// このAPIは、メール確認なしでその場でログインできた場合に登録画面から呼ばれる。

// 画面側が理解できる従来のエラー名に合わせる
const LEGACY_ERROR: Record<string, string> = {
  invalid_code: "invalid code",
  self_referral: "self referral",
  already_referred: "already referred",
};

export async function POST(req: NextRequest) {
  const user = await getVerifiedUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  let code: unknown = null;
  try {
    code = (await req.json())?.referral_code ?? null;
  } catch {
    // 本文なし: 預けてある紹介コードで試す
  }

  const result = code ? await applyReferral(user, code) : await applyPendingReferral(user);
  if (!result) return NextResponse.json({ error: "no code" }, { status: 400 });
  if (result.ok) return NextResponse.json({ success: true });
  return NextResponse.json({ error: LEGACY_ERROR[result.reason] ?? result.reason }, { status: 400 });
}

// 自分の紹介コード・紹介人数・無料期間の取得(本人の分だけ)
export async function GET() {
  const user = await getVerifiedUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const { data } = await getServiceSupabase()
    .from("user_profiles")
    .select("referral_code, referral_count, free_until")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json(data ?? {});
}
