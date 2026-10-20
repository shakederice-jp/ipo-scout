import { NextResponse } from "next/server";
import { getVerifiedUser, getServiceSupabase, canReadWeeklySlides } from "@/lib/member-auth";
import { listPublishedSlides } from "@/lib/weekly-slides-store";

// 2026/10/20新設(案2): 会員向け。公開中の週刊スライドの一覧。
// 一覧を見られるのは、スライドを読める会員だけ(ログイン情報からサーバー側で確認する)。
// GET … { loggedIn, canRead, slides: [{ id, issue_date, issue_label, page_count }] }
export async function GET() {
  const user = await getVerifiedUser();
  if (!user) return NextResponse.json({ loggedIn: false, canRead: false, slides: [] });
  const supabase = getServiceSupabase();
  const { data: profile } = await supabase.from("user_profiles").select("plan, free_until").eq("id", user.id).maybeSingle();
  const canRead = canReadWeeklySlides(profile);
  const slides = await listPublishedSlides(supabase, 12);
  // 読めない会員にも「最新号の見出し」までは見せる(中身は渡さない)
  return NextResponse.json({ loggedIn: true, canRead, slides: slides.map((s) => ({ id: s.id, issue_date: s.issue_date, issue_label: s.issue_label, page_count: s.page_count })) });
}
