import { NextResponse } from "next/server";
import { postToX } from "@/lib/post-to-x";

// 2026/9/19追加: 管理画面の「🐦 Xテスト投稿」ボタンから呼ばれる。
// 目的は、X APIが280文字を超える投稿(500〜800文字の答え合わせ用フォーマット)を
// 受け付けるかどうかを、実際のアカウントに投稿して確認すること。
// 受け取った文章をそのままpostToX()に渡すだけで、内容の生成・整形はここでは行わない。
export async function POST(req: Request) {
  let text = "";
  try {
    const body = await req.json();
    text = typeof body?.text === "string" ? body.text : "";
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }

  if (!text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  try {
    const result = await postToX(text);
    return NextResponse.json({ ...result, textLength: text.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message, textLength: text.length }, { status: 500 });
  }
}
