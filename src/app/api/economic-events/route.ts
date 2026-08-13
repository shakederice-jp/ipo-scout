import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const month = req.nextUrl.searchParams.get("month");
  if (!month) return NextResponse.json([]);

  // 月の最終日を正しく計算(30日・31日・2月の28/29日に対応)
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`;

  const { data, error } = await supabase
    .from("economic_events")
    .select("id, event_date, event_type, label")
    .gte("event_date", `${month}-01`)
    .lte("event_date", monthEnd)
    .order("event_date", { ascending: true });

  if (error) return NextResponse.json([]);
  return NextResponse.json(data ?? []);
}