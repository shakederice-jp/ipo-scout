import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return NextResponse.json({ error: 'Webhook verification failed' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.user_id;
    const companyId = session.metadata?.company_id;
    const type = session.metadata?.type;

    // 単品購入（¥500）
    if (type === 'single' && userId && companyId) {
      const { error } = await supabase.from('purchased_stocks').insert({
        user_id: userId,
        company_id: companyId,
        stripe_payment_intent_id: session.payment_intent as string ?? '',
        amount: session.amount_total ?? 500,
      });
      if (error) console.error('DB insert error:', error);
    }

    // サブスクリプション購入
    if (type === 'subscription' && userId) {
      const { error } = await supabase.from('user_profiles').upsert(
        { user_id: userId, plan: 'premium', stripe_customer_id: session.customer as string },
        { onConflict: 'user_id' }
      );
      if (error) console.error('user_profiles update error:', error);
    }
  }

  return NextResponse.json({ received: true });
}