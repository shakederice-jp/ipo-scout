import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { NEXT_COOKIE, safeNext } from "@/lib/post-login";
import { applyPendingReferral } from "@/lib/referral";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  let dest = "/";

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );
    const { data } = await supabase.auth.exchangeCodeForSession(code);

    // 購入ボタンから会員登録した人は、確認メールのリンクを押したあと元の画面（料金ページなど）へ戻す
    try {
      const raw = cookieStore.get(NEXT_COOKIE)?.value;
      let decoded = raw ?? null;
      try { decoded = raw ? decodeURIComponent(raw) : null; } catch {}
      const n = safeNext(decoded);
      if (n) dest = n;
    } catch {}

    // 2026/9/26追加: 確認メールのリンクからの初回ログイン時に、登録画面で預かった紹介コードを適用する。
    // 本人確認済みのユーザーに対してだけサーバー側で行う(条件チェックは src/lib/referral.ts)。
    // 失敗してもログイン自体は続行する。
    if (data?.user) {
      try {
        await applyPendingReferral(data.user);
      } catch (e) {
        console.error("referral apply failed", e);
      }
    }
  }

  const res = NextResponse.redirect(`${origin}${dest}`);
  res.cookies.set(NEXT_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}