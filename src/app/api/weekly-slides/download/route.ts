import { NextRequest, NextResponse } from "next/server";
import { getVerifiedUser, getServiceSupabase, canReadWeeklySlides } from "@/lib/member-auth";
import { SLIDES_BUCKET } from "@/lib/weekly-slides-store";

// 2026/10/20新設(案2): 会員向け。週刊スライドのPDFを開く。
// 確認するのは「ログイン中」「スライドを読める会員」「公開中の号」の3つ。満たさなければ開けない。
// PDFそのものはURLを知っても開けないよう、120秒だけ有効な署名つきURLに切り替えて渡す。
export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  const origin = new URL(req.url).origin;
  if (!id) return NextResponse.json({ error: "id が必要です" }, { status: 400 });

  const user = await getVerifiedUser();
  if (!user) return NextResponse.redirect(`${origin}/auth`);

  const supabase = getServiceSupabase();
  const { data: profile } = await supabase.from("user_profiles").select("plan, free_until").eq("id", user.id).maybeSingle();
  if (!canReadWeeklySlides(profile)) return NextResponse.redirect(`${origin}/plans`);

  const { data: row } = await supabase.from("weekly_slides").select("file_path,status").eq("id", id).maybeSingle();
  if (!row || row.status !== "published") return NextResponse.json({ error: "この号は公開されていません" }, { status: 404 });

  const { data: signed, error } = await supabase.storage.from(SLIDES_BUCKET).createSignedUrl(row.file_path, 120);
  if (error || !signed) return NextResponse.json({ error: "PDFを開けませんでした" }, { status: 500 });
  return NextResponse.redirect(signed.signedUrl);
}
