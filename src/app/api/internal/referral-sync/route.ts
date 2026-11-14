import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/member-auth";
import { OFFICIAL_REFERRAL_CODE, grantToReferrer, normalizeReferralCode } from "@/lib/referral";
import { findUserByEmail, setFreeUntilMax, verifyCrossAppSecret } from "@/lib/cross-app";

// 2026/11/14新設: 日本版・米国版の「紹介特典の共通化」のための内部API(サイト同士の連絡用。会員のブラウザからは使わない)。
// 呼べるのは、合言葉(x-cross-app-secret = 環境変数 CROSS_APP_SECRET)が合っている相手のサイトだけ。合言葉が未設定なら常に拒否する。
// 詳しい考え方は src/lib/cross-app.ts を参照。
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!verifyCrossAppSecret(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }
  const admin = getServiceSupabase();
  const action = String(body?.action ?? "");

  try {
    // 紹介コードの持ち主(このサイトの会員)を探す
    if (action === "find_code") {
      const code = normalizeReferralCode(body.code);
      if (!code) return NextResponse.json({ found: false });
      const { data: p } = await admin.from("user_profiles").select("id").eq("referral_code", code).maybeSingle();
      if (!p) return NextResponse.json({ found: false });
      const { data: u } = await admin.auth.admin.getUserById(p.id);
      return NextResponse.json({ found: true, email: u?.user?.email ?? null });
    }

    // このメールの会員が、このサイトですでに「紹介された側」として特典を受けているか(二重に特典を受けるのを防ぐ)
    if (action === "already_referred") {
      const u = await findUserByEmail(body.email);
      if (!u) return NextResponse.json({ referred: false });
      const { data } = await admin.from("referral_logs").select("id").eq("referee_user_id", u.id).limit(1);
      return NextResponse.json({ referred: !!(data && data.length > 0) });
    }

    // 紹介コードの持ち主に「無料期間+2ヶ月・紹介人数+1」を付ける(運営の公式コードでは付けない)
    if (action === "grant_referrer") {
      const code = normalizeReferralCode(body.code);
      if (!code) return NextResponse.json({ ok: false });
      const { data: p } = await admin.from("user_profiles").select("id").eq("referral_code", code).maybeSingle();
      if (!p) return NextResponse.json({ ok: false });
      const { data: u } = await admin.auth.admin.getUserById(p.id);
      if (code !== OFFICIAL_REFERRAL_CODE) {
        const granted = await grantToReferrer(p.id);
        if (!granted) return NextResponse.json({ ok: false });
      }
      const { data: after } = await admin.from("user_profiles").select("free_until").eq("id", p.id).maybeSingle();
      return NextResponse.json({ ok: true, email: u?.user?.email ?? null, free_until: after?.free_until ?? null });
    }

    // 相手のサイトで付いた無料期間を、このサイトの同じメールの会員(メール確認済み)にも反映する
    if (action === "mirror") {
      const u = await findUserByEmail(body.email);
      if (!u || !u.email_confirmed_at) return NextResponse.json({ ok: true, applied: false });
      const applied = await setFreeUntilMax(u.id, String(body.free_until ?? ""));
      return NextResponse.json({ ok: true, applied });
    }

    // このメールの会員の無料期間を返す(相手のサイトに新しく登録した人が引き継ぐため)
    if (action === "get_free_until") {
      const u = await findUserByEmail(body.email);
      if (!u || !u.email_confirmed_at) return NextResponse.json({ free_until: null });
      const { data } = await admin.from("user_profiles").select("free_until").eq("id", u.id).maybeSingle();
      return NextResponse.json({ free_until: data?.free_until ?? null });
    }
  } catch (e) {
    console.error("referral-sync error", action, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
