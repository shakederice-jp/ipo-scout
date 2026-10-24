import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getVerifiedUser, getServiceSupabase, canUseCalendarFeed } from "@/lib/member-auth";
import { syncPlanForUser } from "@/lib/plan-sync";

// 2026/10/24新設(束A・①): マイページ用。自分の「カレンダー購読リンク」の取得・作り直し。Cプランの会員だけ。
// GET  … { loggedIn, eligible, url? }   Cなら、鍵が無ければ作って、購読リンクを返す
// POST … { regenerate: true }          鍵を作り直す(リンクが人に知られた場合など。古いリンクは使えなくなる)
export const dynamic = "force-dynamic";

const HOST = "ipo.finance-tower.com";
const makeUrls = (token: string) => ({
  webcal: `webcal://${HOST}/api/calendar/ics/${token}`,
  https: `https://${HOST}/api/calendar/ics/${token}`,
});

async function load(regenerate: boolean) {
  const user = await getVerifiedUser();
  if (!user) return { status: 401 as const, body: { loggedIn: false, eligible: false } };
  const supabase = getServiceSupabase();
  const synced = await syncPlanForUser(user);
  const { data: profile } = await supabase.from("user_profiles").select("plan").eq("id", user.id).maybeSingle();
  const eff = synced ? { ...(profile ?? {}), plan: synced } : profile;
  if (!canUseCalendarFeed(eff)) return { status: 200 as const, body: { loggedIn: true, eligible: false } };

  let token: string | null = null;
  if (!regenerate) {
    const { data } = await supabase.from("calendar_feed_tokens").select("token").eq("user_id", user.id).maybeSingle();
    token = data?.token ?? null;
  }
  if (!token) {
    token = randomBytes(24).toString("hex");
    const { error } = await supabase.from("calendar_feed_tokens").upsert({ user_id: user.id, token, created_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) return { status: 500 as const, body: { loggedIn: true, eligible: true, error: "購読リンクを作れませんでした。時間をおいてもう一度お試しください。" } };
  }
  return { status: 200 as const, body: { loggedIn: true, eligible: true, ...makeUrls(token) } };
}

export async function GET() {
  const r = await load(false);
  return NextResponse.json(r.body, { status: r.status });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const r = await load(!!body?.regenerate);
  return NextResponse.json(r.body, { status: r.status });
}
