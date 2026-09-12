import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseRouteClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const getServiceSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const supabase = await createSupabaseRouteClient();
  if (!supabase) return NextResponse.json({ error: "認証エラー" }, { status: 401 });

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const userId = session.user.id;
  const email = session.user.email;
  const serviceSupabase = getServiceSupabase();

  const { data: profile } = await serviceSupabase
    .from("user_profiles").select("*").eq("id", userId).single();

  const { data: referralLogs } = await serviceSupabase
    .from("referral_logs").select("*").eq("referrer_user_id", userId);

  const { data: purchases } = await serviceSupabase
    .from("purchased_stocks")
    .select("*, ipo_companies(id, name, listing_date, sector)")
    .eq("user_id", userId).order("purchased_at", { ascending: false });

  const { data: notifySettings } = await serviceSupabase
    .from("notification_settings").select("*")
    .eq("user_id", userId).is("company_id", null).single();

  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const { data: calendarNotes } = await serviceSupabase
    .from("calendar_notes").select("*").eq("user_id", userId)
    .gte("note_date", threeMonthsAgo.toISOString().slice(0, 10))
    .order("note_date", { ascending: false });

  // 2026/9/6新設: 「100万円投資シミュレーション」機能。ユーザーが追跡中の仮想投資一覧。
  const { data: virtualInvestments } = await serviceSupabase
    .from("virtual_investments")
    .select("*, ipo_companies(id, name, ticker, ipo_price, listing_date)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  // 2026/9/12新設: 「この銘柄をマイページにお気に入り登録する」機能(お気に入り銘柄)。
  // virtual_investments(公募価格確定後のみ)と違い、上場前の「気になる」段階から
  // 登録できる軽量なブックマーク一覧。無料会員でも利用可(api/favorite-companies参照)。
  // 2026/9/12追記: マイポートフォリオ表示と統合したため、上場後は「公募→現在」の
  // シミュレーション表示に切り替えられるよう ipo_price も取得するようにした。
  const { data: favoriteCompanies } = await serviceSupabase
    .from("favorite_companies")
    .select("id, company_id, created_at, ipo_companies(id, name, listing_date, sector, exchange, ipo_price)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  // 2026/9/12改修: マイポートフォリオとお気に入り銘柄を1つの表示に統合したため、
  // 株価取得の対象もこの2つのcompany_idの和集合にする(以前はvirtual_investments分のみ)。
  const priceTargetCompanyIds = Array.from(new Set([
    ...(virtualInvestments ?? []).map((v) => v.company_id),
    ...(favoriteCompanies ?? []).map((f) => f.company_id),
  ]));

  let latestPrices: Record<string, { price: number; price_date: string }> = {};
  if (priceTargetCompanyIds.length > 0) {
    const { data: historyRows } = await serviceSupabase
      .from("stock_price_history")
      .select("company_id, price, price_date")
      .in("company_id", priceTargetCompanyIds)
      .order("price_date", { ascending: false });

    // company_idごとに最新(price_date降順の先頭)の1件だけを残す
    for (const row of historyRows ?? []) {
      if (!latestPrices[row.company_id]) {
        latestPrices[row.company_id] = { price: row.price, price_date: row.price_date };
      }
    }
  }

  return NextResponse.json({
    email, profile,
    referralLogs: referralLogs ?? [],
    purchases: purchases ?? [],
    notifySettings,
    calendarNotes: calendarNotes ?? [],
    virtualInvestments: virtualInvestments ?? [],
    latestPrices,
    favoriteCompanies: favoriteCompanies ?? [],
  });
}