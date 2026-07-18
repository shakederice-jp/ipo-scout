import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function GET(req: NextRequest) {
  try {
    const account = await stripe.accounts.retrieve();
    const price = await stripe.prices.retrieve("price_1ThgBsGhKlnLxDh4pAo0s3L3");
    return NextResponse.json({
      success: true,
      accountId: account.id,
      accountName: (account as any).business_profile?.name ?? null,
      priceFound: price.id,
      priceActive: price.active,
      priceLiveMode: price.livemode,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}