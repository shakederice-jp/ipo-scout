import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const requestCounts = new Map<string, { count: number; resetAt: number }>();

export async function GET(req: Request) {
  // レート制限：同一IPから1分間に30回まで
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const now = Date.now();
  const limit = requestCounts.get(ip);
  if (limit && now < limit.resetAt) {
    if (limit.count >= 30) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    limit.count++;
  } else {
    requestCounts.set(ip, { count: 1, resetAt: now + 60000 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from("ipo_companies")
    .select("*")
    .order("listing_date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}