import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createSupabaseServerClient();
  if (!supabase) return NextResponse.json([]);
  const { data } = await supabase
    .from("ipo_companies")
    .select("id, name, sector, listing_date, analysis_detail")
    .order("listing_date", { ascending: true });
  return NextResponse.json(data ?? []);
}
