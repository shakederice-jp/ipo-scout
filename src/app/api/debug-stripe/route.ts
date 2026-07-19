import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const value = process.env.STRIPE_PRICE_NOTIFY ?? "";
  return NextResponse.json({
    value: value,
    length: value.length,
    charCodes: Array.from(value).map((c) => c.charCodeAt(0)),
  });
}