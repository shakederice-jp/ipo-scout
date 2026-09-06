import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 2026/9/6新設: 紹介プログラムの実績を管理画面で見えるようにするための集計API。
// これまで「何人がリンクを踏んで、何人が登録し、何人に特典が付いたか」を確認する
// 手段が一切無かったため、まずは「特典が実際に成立した件数」だけでも可視化する。
export const dynamic = "force-dynamic";

const CAP = 100; // Xのプロフィールで案内している「先着100名限定」の人数

export async function GET(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  if (pw !== "otemachi9") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { count: completedCount, error } = await supabase
    .from("referral_logs")
    .select("id", { count: "exact", head: true })
    .eq("status", "completed");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const completed = completedCount ?? 0;

  return NextResponse.json({
    completed,
    cap: CAP,
    remaining: Math.max(0, CAP - completed),
  });
}
