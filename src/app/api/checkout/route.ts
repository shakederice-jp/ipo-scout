import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { OWN_APP, isPaidPlan, syncPlanForUser } from "@/lib/plan-sync";

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

    // 購入はログイン必須（未ログインで決済すると、誰にもプランが付かないため）
    if (!user) {
      return NextResponse.json({ error: "購入するにはログインが必要です。先に会員登録（無料）またはログインをしてください。" }, { status: 401 });
    }

    const body    = await req.json() as { plan?: string; stockId?: string | null };
    const plan    = body.plan    ?? "complete";
    const stockId = body.stockId ?? "";
    const priceId = PRICE_MAP[plan];
    if (!priceId) {
      return NextResponse.json({ error: `プラン「${plan}」の料金IDが未設定です` }, { status: 500 });
    }

    // 日本版・米国版は共通のプラン。他方のサイトで加入済みなら、ここで二重加入を止める
    if (plan !== "single") {
      const current = await syncPlanForUser(user, { force: true });
      if (isPaidPlan(current)) {
        return NextResponse.json({
          error: "すでに有料プランにご加入中です（日本版・米国版共通のプランです）。プランの変更・解約はマイページの「契約の確認・変更」から行えます。",
        }, { status: 409 });
      }
    }

    // 既存のStripe顧客があればそれを使う（日米で同じ顧客にまとめる）
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: prof } = await admin.from("user_profiles").select("stripe_customer_id").eq("id", user.id).maybeSingle();
    const customerId = (prof as any)?.stripe_customer_id as string | undefined;

    const origin     = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const mode       = plan === "single" ? "payment" : "subscription";
    const successUrl = plan === "single" && stockId
      ? `${origin}/analysis/${stockId}?checkout=success`
      : `${origin}/?checkout=success`;

    const metadata = { plan, stock_id: stockId, user_id: user.id, user_email: user.email ?? "", app: OWN_APP };
    const build = (withCustomer: boolean): Stripe.Checkout.SessionCreateParams => {
      const p: Stripe.Checkout.SessionCreateParams = {
        mode,
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url:  `${origin}/?checkout=cancel`,
        locale:      "ja",
        metadata,
      };
      if (mode === "subscription") p.subscription_data = { metadata };
      if (withCustomer && customerId) p.customer = customerId;
      else if (user.email) p.customer_email = user.email;
      return p;
    };

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create(build(true));
    } catch (e) {
      // 保存されていた顧客IDがStripe側に無い場合は、顧客IDなし（メールアドレス指定）でやり直す
      if (customerId && e instanceof Error && /No such customer/i.test(e.message)) {
        session = await stripe.checkout.sessions.create(build(false));
      } else {
        throw e;
      }
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "エラーが発生しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
