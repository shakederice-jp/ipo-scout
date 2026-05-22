import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const headersList = await headers();
  const sig = headersList.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Webhook error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const plan     = session.metadata?.plan ?? "";
    const stockId  = session.metadata?.stock_id ?? "";
    const email    = session.customer_details?.email ?? "";
    const custId   = session.customer as string ?? "";

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // メールからユーザーIDを取得
    const { data: authData } = await supabase.auth.admin.listUsers();
    const user = authData?.users?.find((u) => u.email === email);
    if (!user) {
      console.error("Webhook: user not found for email", email);
      return NextResponse.json({ received: true });
    }
    const userId = user.id;

    if (plan === "single" && stockId) {
      // 単品購入 → purchased_stocks に記録
      await supabase.from("purchased_stocks").upsert(
        {
          user_id:                  userId,
          company_id:               stockId,
          stripe_payment_intent_id: session.payment_intent as string ?? "",
          amount:                   500,
        },
        { onConflict: "user_id,company_id" }
      );
    } else if (plan) {
      // サブスク購入 → user_profiles のプランを更新
      await supabase.from("user_profiles").upsert(
        {
          user_id:            userId,
          plan:               plan,
          stripe_customer_id: custId,
          updated_at:         new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    }
  }

  return NextResponse.json({ received: true });
}