import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseRouteClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const getServiceSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// お気に入り保存は「有料プラン会員」限定の機能。記事の単体購入(purchased_stocks)のみの
// ユーザーは対象外とするため、user_profiles.plan が free 以外かどうかだけを見る
// (/api/access のサブスク判定と同じロジック)。
async function requirePremiumUser(): Promise<
  | { userId: string; service: ReturnType<typeof getServiceSupabase> }
  | { error: NextResponse }
> {
  const supabase = await createSupabaseRouteClient();
  if (!supabase) {
    return { error: NextResponse.json({ error: "auth_unavailable" }, { status: 401 }) };
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "not_logged_in" }, { status: 401 }) };
  }

  const service = getServiceSupabase();
  const { data: profile } = await service
    .from("user_profiles")
    .select("plan")
    .eq("id", session.user.id)
    .single();

  const isPremium = !!profile?.plan && profile.plan !== "free";
  if (!isPremium) {
    return { error: NextResponse.json({ error: "not_premium" }, { status: 403 }) };
  }

  return { userId: session.user.id, service };
}

export async function GET() {
  const result = await requirePremiumUser();
  if ("error" in result) return result.error;

  const { data, error } = await result.service
    .from("favorite_articles")
    .select("*")
    .eq("user_id", result.userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("お気に入り一覧取得失敗:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ favorites: data ?? [] });
}

export async function POST(req: NextRequest) {
  const result = await requirePremiumUser();
  if ("error" in result) return result.error;

  const body = await req.json().catch(() => null);
  const marketTrendsId = body?.marketTrendsId ? String(body.marketTrendsId) : "";
  const title = typeof body?.title === "string" ? body.title : "";
  if (!marketTrendsId || !title) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // 保存時点の記事内容をそのままスナップショットとして保持する。
  // market_trends側の記事が将来整理されても、お気に入りは「永久保存」として読み続けられるようにするため。
  const { error } = await result.service.from("favorite_articles").upsert(
    {
      user_id: result.userId,
      market_trends_id: marketTrendsId,
      title,
      content: typeof body?.content === "string" ? body.content : null,
      sector: typeof body?.sector === "string" ? body.sector : null,
      source_links: body?.sourceLinks ?? null,
      fetched_at: body?.fetchedAt ?? null,
    },
    { onConflict: "user_id,market_trends_id" }
  );

  if (error) {
    console.error("お気に入り保存失敗:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const result = await requirePremiumUser();
  if ("error" in result) return result.error;

  const marketTrendsId = req.nextUrl.searchParams.get("marketTrendsId");
  if (!marketTrendsId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { error } = await result.service
    .from("favorite_articles")
    .delete()
    .eq("user_id", result.userId)
    .eq("market_trends_id", marketTrendsId);

  if (error) {
    console.error("お気に入り削除失敗:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
