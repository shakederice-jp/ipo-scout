import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, canUseCalendarFeed } from "@/lib/member-auth";
import { buildCalendarIcs } from "@/lib/calendar-feed";

// 2026/10/24新設(束A・①): カレンダー購読リンクの本体。
// カレンダーアプリが定期的にこのアドレスを読みに来る(ログインはできないため、リンクに含まれる鍵で会員を確認する)。
// 鍵が無効・Cプランでなくなった場合は読み込みを拒否する(カレンダー側では「更新できません」となる)。
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token: raw } = await ctx.params;
  const token = String(raw ?? "").replace(/\.ics$/i, "");
  if (!/^[a-f0-9]{48}$/.test(token)) return new NextResponse("Not found", { status: 404 });

  const supabase = getServiceSupabase();
  const { data: row } = await supabase.from("calendar_feed_tokens").select("user_id").eq("token", token).maybeSingle();
  if (!row) return new NextResponse("Not found", { status: 404 });

  const { data: profile } = await supabase.from("user_profiles").select("plan").eq("id", row.user_id).maybeSingle();
  if (!canUseCalendarFeed(profile)) {
    return new NextResponse("この購読リンクは、C フルパックプランの会員向けです。", { status: 403 });
  }

  const ics = await buildCalendarIcs(supabase);
  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="ipo-schedule.ics"',
      "Cache-Control": "private, max-age=900",
    },
  });
}
