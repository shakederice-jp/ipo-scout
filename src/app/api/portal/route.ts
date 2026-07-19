import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseRouteClient } from "@/lib/supabase/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  try {
    const routeClient = await createSupabaseRouteClient();
    if (!routeClient) {
      return NextResponse.json({ error: "認証クライアントの初期化に失敗しました" }, { status: 500 });
    }
    const { data: { session } } = await routeClient.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: profile } = await serviceSupabase
      .from("user_profiles")
      .select("stripe_customer_id")
      .eq("id", session.user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      return NextResponse.json(
        { error: "契約情報が見つかりません。まだプランにご加入されていない可能性があります。" },
        { status: 400 }
      );
    }

    const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/mypage`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "エラーが発生しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}