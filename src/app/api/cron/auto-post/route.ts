import { NextResponse } from "next/server";
import { runAutoPost, type AutoPostSlot } from "@/lib/x-auto-post";

// 2026/10/18改修: X API投稿をやめ、メール送信方式に変更した(src/lib/x-auto-post.ts参照)。
// 1回の実行で、新情報の原稿を1件ずつ要約(Gemini)してメール送信するため、余裕を持たせる。
export const maxDuration = 120;

// 朝7時の便(morning)・夕17時の便(evening)の2枠。旧「noon(昼枠)」は廃止した。
// (時間帯ガードも廃止したため、force パラメータは受け付けるが動作は変わらない)
const VALID_SLOTS: AutoPostSlot[] = ["morning", "evening"];

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const slotParam = searchParams.get("slot");
  if (!slotParam || !VALID_SLOTS.includes(slotParam as AutoPostSlot)) {
    return NextResponse.json(
      { error: "slotパラメータが不正です(morning / evening のいずれかを指定してください)" },
      { status: 400 }
    );
  }
  const forceParam = searchParams.get("force");
  const force = forceParam === "1" || forceParam === "true";

  try {
    const result = await runAutoPost(slotParam as AutoPostSlot, { force });
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("X投稿メールcronでエラー:", e);
    return NextResponse.json({ error: e?.message ?? "unknown error" }, { status: 500 });
  }
}
