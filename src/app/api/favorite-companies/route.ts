import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseRouteClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// 2026/9/12新設: 「この銘柄をマイページにお気に入り登録する」機能(お気に入り銘柄)。
// お気に入り記事(favorite_articles)と同じ考え方だが、対象が「記事」ではなく「銘柄」。
// 無料ユーザーを増やす導線見直しの一環として、最初から有料プラン限定にはせず、
// ログインさえしていれば無料会員でも使えるようにしている(favorite_articlesの
// 2026/9/12変更と同じ方針)。virtual_investments(100万円シミュレーション、公募価格
// 確定が必要)とは別の、上場前でも使える軽量な「気になる銘柄をブックマークする」機能。

const getServiceSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function requireLoggedInUser(): Promise<
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

  return { userId: session.user.id, service: getServiceSupabase() };
}

export async function GET(req: NextRequest) {
  const result = await requireLoggedInUser();
  if ("error" in result) return result.error;

  const companyId = req.nextUrl.searchParams.get("companyId");

  // companyId指定時: 個別銘柄ページの★ボタン用に、登録済みかどうかだけを返す
  if (companyId) {
    const { data, error } = await result.service
      .from("favorite_companies")
      .select("id")
      .eq("user_id", result.userId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (error) {
      console.error("お気に入り銘柄チェック失敗:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ favorited: !!data });
  }

  // companyId未指定時: マイページ一覧表示用に、銘柄情報つきで全件返す
  const { data, error } = await result.service
    .from("favorite_companies")
    .select("id, company_id, created_at, ipo_companies(id, name, listing_date, sector, exchange)")
    .eq("user_id", result.userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("お気に入り銘柄一覧取得失敗:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ favorites: data ?? [] });
}

export async function POST(req: NextRequest) {
  const result = await requireLoggedInUser();
  if ("error" in result) return result.error;

  const body = await req.json().catch(() => null);
  const companyId = body?.companyId ? String(body.companyId) : "";
  if (!companyId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { error } = await result.service.from("favorite_companies").upsert(
    { user_id: result.userId, company_id: companyId },
    { onConflict: "user_id,company_id" }
  );

  if (error) {
    console.error("お気に入り銘柄登録失敗:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const result = await requireLoggedInUser();
  if ("error" in result) return result.error;

  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { error } = await result.service
    .from("favorite_companies")
    .delete()
    .eq("user_id", result.userId)
    .eq("company_id", companyId);

  if (error) {
    console.error("お気に入り銘柄削除失敗:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
