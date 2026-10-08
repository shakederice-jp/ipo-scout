import { NextResponse } from "next/server";
import { runAutoPost, type AutoPostSlot } from "@/lib/x-auto-post";

// 要約(Gemini)+X投稿(twitter-api-v2)を1回のリクエストで行うため、他のcronと同様に余裕を持たせる。
export const maxDuration = 60;

// 2026/10/8改修: 投稿時刻の変更(朝7:30/昼11:30/夜21:00)にあわせてスロット名を
// morning/evening1/evening2 → morning/noon/evening に変更。あわせて、管理画面からの
// 手動実行時に時間帯ガードを無視する force パラメータを追加した。
const VALID_SLOTS: AutoPostSlot[] = ["morning", "noon", "evening"];

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const slotParam = searchParams.get("slot");
  if (!slotParam || !VALID_SLOTS.includes(slotParam as AutoPostSlot)) {
    return NextResponse.json(
      { error: "slotパラメータが不正です(morning / noon / evening のいずれかを指定してください)" },
      { status: 400 }
    );
  }
  const forceParam = searchParams.get("force");
  const force = forceParam === "1" || forceParam === "true";

  try {
    const result = await runAutoPost(slotParam as AutoPostSlot, { force });
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("X自動投稿cronでエラー:", e);
    return NextResponse.json({ error: e?.message ?? "unknown error" }, { status: 500 });
  }
}
