import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const PRICE_MAP: Record<string, string | undefined> = {
  notify:   process.env.STRIPE_PRICE_NOTIFY,
  report:   process.env.STRIPE_PRICE_REPORT,
  complete: process.env.STRIPE_PRICE_COMPLETE,
  single:   process.env.STRIPE_PRICE_SINGLE,
};

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );
    const { data: { user } } = await supabase.auth.getUser();

    const body    = await req.json() as { plan?: string; stockId?: string | null };
    const plan    = body.plan    ?? "complete";
    const stockId = body.stockId ?? "";
    const priceId = PRICE_MAP[plan];

    if (!priceId) {
      return NextResponse.json({ error: `プラン「${plan}」の料金IDが未設定です` }, { status: 500 });
    }

    const origin     = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const mode       = plan === "single" ? "payment" : "subscription";
    const successUrl = plan === "single" && stockId
      ? `${origin}/analysis/${stockId}?checkout=success`
      : `${origin}/calendar?checkout=success`;

    const session = await stripe.checkout.sessions.create({
      mode,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url:  `${origin}/?checkout=cancel`,
      locale:      "ja",
      metadata:    { plan, stock_id: stockId, user_id: user?.id ?? "" },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "エラーが発生しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}