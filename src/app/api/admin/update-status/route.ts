import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST() {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  const { data: companies, error } = await supabase
    .from("ipo_companies")
    .select("id, status, listing_date, bb_start_date, apply_start_date");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let updated = 0;

  for (const c of companies ?? []) {
    let newStatus = c.status;

    if (c.listing_date && today >= c.listing_date) {
      newStatus = "上場済";
    } else if (c.apply_start_date && today >= c.apply_start_date) {
      newStatus = "申込中";
    } else if (c.bb_start_date && today >= c.bb_start_date) {
      newStatus = "BB中";
    } else {
      newStatus = "仮条件決定前";
    }

    if (newStatus !== c.status) {
      await supabase
        .from("ipo_companies")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", c.id);
      updated++;
    }
  }

  return NextResponse.json({ success: true, updated });
}