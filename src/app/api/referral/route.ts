import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// 紹介コード検証 & 適用
export async function POST(req: NextRequest) {
  try {
    const { referral_code, user_id } = await req.json();
    const supabase = createSupabaseServerClient();
    if (!supabase) return NextResponse.json({ error: "db" }, { status: 500 });

    // 紹介コードからreferrerを検索
    const { data: referrer } = await supabase
      .from("user_profiles")
      .select("id, referral_code")
      .eq("referral_code", referral_code.toUpperCase())
      .single();

    if (!referrer) return NextResponse.json({ error: "invalid code" }, { status: 404 });
    if (referrer.id === user_id) return NextResponse.json({ error: "self referral" }, { status: 400 });

    // 既に紹介済みか確認
    const { data: existing } = await supabase
      .from("referral_logs")
      .select("id")
      .eq("referee_id", user_id)
      .single();

    if (existing) return NextResponse.json({ error: "already referred" }, { status: 400 });

    // 紹介ログ作成
    await supabase.from("referral_logs").insert({
      referrer_id: referrer.id,
      referee_id: user_id,
      status: "completed",
    });

    // 紹介された人に2ヶ月無料を付与
    const freeUntil = new Date();
    freeUntil.setMonth(freeUntil.getMonth() + 2);
    await supabase.from("user_profiles").update({
      free_until: freeUntil.toISOString(),
      plan: "premium",
    }).eq("id", user_id);

    // 紹介した人に2ヶ月無料を付与
    const { data: referrerProfile } = await supabase
      .from("user_profiles")
      .select("free_until, referral_count")
      .eq("id", referrer.id)
      .single();

    const referrerFreeUntil = referrerProfile?.free_until
      ? new Date(referrerProfile.free_until)
      : new Date();
    if (referrerFreeUntil < new Date()) referrerFreeUntil.setTime(new Date().getTime());
    referrerFreeUntil.setMonth(referrerFreeUntil.getMonth() + 2);

    await supabase.from("user_profiles").update({
      free_until: referrerFreeUntil.toISOString(),
      plan: "premium",
      referral_count: (referrerProfile?.referral_count ?? 0) + 1,
    }).eq("id", referrer.id);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// 自分の紹介コード取得
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const user_id = searchParams.get("user_id");
    if (!user_id) return NextResponse.json({ error: "no user_id" }, { status: 400 });

    const supabase = createSupabaseServerClient();
    if (!supabase) return NextResponse.json({ error: "db" }, { status: 500 });

    const { data } = await supabase
      .from("user_profiles")
      .select("referral_code, referral_count, free_until")
      .eq("id", user_id)
      .single();

    return NextResponse.json(data ?? {});
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}