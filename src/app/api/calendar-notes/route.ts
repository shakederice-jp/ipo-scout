import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = (await createSupabaseServerClient())!;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json([]);

  const month = req.nextUrl.searchParams.get("month");
  if (!month) return NextResponse.json([]);

  const { data, error } = await supabase
    .from("calendar_notes")
    .select("id, note_date, memo, pnl")
    .eq("user_id", user.id)
    .gte("note_date", `${month}-01`)
    .lte("note_date", `${month}-31`);

  if (error) return NextResponse.json([]);
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const supabase = (await createSupabaseServerClient())!;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const { note_date, memo, pnl } = await req.json();
  if (!note_date) return NextResponse.json({ error: "note_date required" }, { status: 400 });

  const { error } = await supabase
    .from("calendar_notes")
    .upsert(
      { user_id: user.id, note_date, memo, pnl, updated_at: new Date().toISOString() },
      { onConflict: "user_id,note_date" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}