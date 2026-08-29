import { NextRequest, NextResponse } from "next/server";

// インフォグラフィック画像を、確実に「ダウンロード」として保存できる形で中継配信する。
// (Supabase Storageの画像を直接<a>で開くだけだと、ブラウザによっては新しいタブで
//  表示されるだけでダウンロードにならないことがあるため、このルートを経由させる)
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  const name = searchParams.get("name") || "infographic.png";

  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  // 任意のURLを中継してしまわないよう、このサイトのSupabase Storageから始まるURLのみ許可する
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!supabaseUrl || !url.startsWith(`${supabaseUrl}/storage/`)) {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ error: `fetch failed (${res.status})` }, { status: 502 });
    }
    const buf = await res.arrayBuffer();
    const safeName = encodeURIComponent(name);

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="infographic.png"; filename*=UTF-8''${safeName}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "unknown error" }, { status: 500 });
  }
}
