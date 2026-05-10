import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

// プランIDと環境変数のマッピング
const PRICE_MAP: Record<string, string | undefined> = {
  notify:   process.env.STRIPE_PRICE_NOTIFY,    // ¥890/月
  report:   process.env.STRIPE_PRICE_REPORT,    // ¥1,890/月
  complete: process.env.STRIPE_PRICE_COMPLETE,  // ¥2,490/月
  single:   process.env.STRIPE_PRICE_SINGLE,    // ¥500/件
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      plan?: string;
      stockId?: string | null;
    };

    const plan    = body.plan ?? "complete";
    const stockId = body.stockId ?? "";
    const priceId = PRICE_MAP[plan];

    // 環境変数が未設定の場合のガード
    if (!priceId) {
      return NextResponse.json(
        {
          error: `プラン「${plan}」の料金IDが設定されていません。.env.local の STRIPE_PRICE_${plan.toUpperCase()} を確認してください。`,
        },
        { status: 500 }
      );
    }

    const origin =
      req.headers.get("origin") ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "http://localhost:3000";

    // single は一括払い、それ以外はサブスク
    const mode: Stripe.Checkout.SessionCreateParams["mode"] =
      plan === "single" ? "payment" : "subscription";

    const session = await stripe.checkout.sessions.create({
      mode,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/?checkout=success`,
      cancel_url:  `${origin}/?checkout=cancel`,
      locale: "ja",
      metadata: {
        plan,
        stock_id: stockId,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[Stripe] checkout error:", err);
    const message =
      err instanceof Error ? err.message : "予期しないエラーが発生しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}