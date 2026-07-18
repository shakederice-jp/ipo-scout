import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function GET(req: NextRequest) {
  try {
    const prices = await stripe.prices.list({ limit: 20 });
    return NextResponse.json({
      success: true,
      count: prices.data.length,
      prices: prices.data.map((p) => ({
        id: p.id,
        active: p.active,
        livemode: p.livemode,
        unit_amount: p.unit_amount,
        product: p.product,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}