import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const month = req.nextUrl.searchParams.get("month");
  if (!month) return NextResponse.json([]);

  const { data, error } = await supabase
    .from("economic_events")
    .select("id, event_date, event_type, label")
    .gte("event_date", `${month}-01`)
    .lte("event_date", `${month}-31`)
    .order("event_date", { ascending: true });

  if (error) return NextResponse.json([]);
  return NextResponse.json(data ?? []);
}