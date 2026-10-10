import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { OWN_APP, applyPlan, bestPlanForCustomer } from "@/lib/plan-sync";

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

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // 日本版・米国版で同じStripeアカウントを使うため、両方のWebhookに同じ通知が届く。
    // 他方のサイトでの購入は user_id がこちらの会員名簿に存在しないので、ここでは処理しない。
    // （プランは、購入者がこちらのサイトを開いたときに plan-sync が自動で反映する）
    // 古い決済（app の記録なし）は日本版のものとして扱う。
    const origin = session.metadata?.app ?? "jp";
    if (origin !== OWN_APP) {
      return NextResponse.json({ received: true, skipped: "other-app" });
    }

    const plan     = session.metadata?.plan ?? "";
    const stockId  = session.metadata?.stock_id ?? "";
    const custId   = (session.customer as string) ?? "";
    const userId   = session.metadata?.user_id ?? "";
    if (!userId) {
      console.error("Webhook: user_id not found in metadata");
      return NextResponse.json({ received: true });
    }

    if (plan === "single" && stockId) {
      // 単品購入 → purchased_stocks に記録（購入した銘柄だけ見られる。日米では共有しない）
      await supabase.from("purchased_stocks").upsert(
        {
          user_id:                  userId,
          company_id:               stockId,
          stripe_payment_intent_id: (session.payment_intent as string) ?? "",
          amount:                   session.amount_total ?? 500,
        },
        { onConflict: "user_id,company_id" }
      );
    } else if (plan === "notify" || plan === "report" || plan === "complete") {
      // サブスク購入 → user_profiles のプランを更新
      await applyPlan(userId, {
        plan,
        customerId: custId || null,
        subscriptionId: (session.subscription as string) ?? null,
      });
    } else {
      console.error(`Webhook: 不明なplan値のためスキップ: "${plan}"`);
    }
  }

  // 契約の変更（プラン変更・解約・支払い失敗による停止）をこちらの会員名簿に反映する。
  // 日米どちらで加入した契約でも、この会員（stripe_customer_id が同じ人）に反映される。
  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const { data: profiles } = await supabase.from("user_profiles").select("id").eq("stripe_customer_id", customerId);
    if (profiles && profiles.length > 0) {
      const info = await bestPlanForCustomer(stripe, customerId);
      for (const p of profiles) {
        if (info) {
          await applyPlan(p.id, { plan: info.plan, customerId, subscriptionId: info.subscriptionId });
        } else {
          await applyPlan(p.id, { plan: "free", customerId, subscriptionId: null });
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
