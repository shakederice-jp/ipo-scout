import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { company_id, ipo_price } = await req.json();
    if (!company_id) return NextResponse.json({ error: "company_id is required" }, { status: 400 });

    const supabase = getSupabase();
    const { error } = await supabase
      .from("ipo_companies")
      .update({ ipo_price: ipo_price === "" || ipo_price === null ? null : Number(ipo_price) })
      .eq("id", company_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}