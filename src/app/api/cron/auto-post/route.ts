import { NextResponse } from "next/server";
import { runAutoPost, type AutoPostSlot } from "@/lib/x-auto-post";

// 要約(Gemini)+X投稿(twitter-api-v2)を1回のリクエストで行うため、他のcronと同様に余裕を持たせる。
export const maxDuration = 60;

const VALID_SLOTS: AutoPostSlot[] = ["morning", "evening1", "evening2"];

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const slotParam = searchParams.get("slot");
  if (!slotParam || !VALID_SLOTS.includes(slotParam as AutoPostSlot)) {
    return NextResponse.json(
      { error: "slotパラメータが不正です(morning / evening1 / evening2 のいずれかを指定してください)" },
      { status: 400 }
    );
  }

  try {
    const result = await runAutoPost(slotParam as AutoPostSlot);
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("X自動投稿cronでエラー:", e);
    return NextResponse.json({ error: e?.message ?? "unknown error" }, { status: 500 });
  }
}
