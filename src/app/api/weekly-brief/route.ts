import { NextRequest, NextResponse } from "next/server";
import { getVerifiedUser, getServiceSupabase } from "@/lib/member-auth";

// 2026/10/20新設(案2): IPO週報の配信を「希望する／やめる」を、本人が切り替えるAPI。
// 本人確認はログイン情報からサーバー側で行う(画面から送られたuser_idは信じない)。
// GET  … { loggedIn, subscribed }
// POST … { subscribe: true | false }

export async function GET() {
  const user = await getVerifiedUser();
  if (!user) return NextResponse.json({ loggedIn: false, subscribed: false });
  const supabase = getServiceSupabase();
  const { data } = await supabase.from("weekly_brief_subscribers").select("user_id").eq("user_id", user.id).maybeSingle();
  return NextResponse.json({ loggedIn: true, subscribed: !!data });
}

export async function POST(req: NextRequest) {
  const user = await getVerifiedUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.subscribe !== "boolean") {
    return NextResponse.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }
  const supabase = getServiceSupabase();
  const { error } = body.subscribe
    ? await supabase.from("weekly_brief_subscribers").upsert({ user_id: user.id }, { onConflict: "user_id" })
    : await supabase.from("weekly_brief_subscribers").delete().eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, subscribed: body.subscribe });
}
