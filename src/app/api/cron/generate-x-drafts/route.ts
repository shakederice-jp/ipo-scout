import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchAllHeadlines } from "@/lib/rss-feeds";
import { RSS_THEMES, generateThemedPost } from "@/lib/x-post-themes";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  // cronシークレットによる認証チェック(既存のedinet-scan等と同じ方式)
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: { theme: number; status: string }[] = [];

  try {
    // 1. RSSフィードを一度だけ取得(全テーマで使い回す)
    const headlines = await fetchAllHeadlines();

    if (headlines.length === 0) {
      return NextResponse.json(
        { error: "RSSフィードの取得に失敗しました(0件)" },
        { status: 500 }
      );
    }

    // 2. テーマ④〜⑧を順番に生成(Gemini無料枠のレート制限を考慮し、間隔を空ける)
    for (const theme of RSS_THEMES) {
      try {
        const content = await generateThemedPost(theme, headlines);

        const { error } = await supabase.from("x_post_drafts").insert({
          theme_number: theme.number,
          theme_label: theme.label,
          content,
          source_note: `RSS由来(${headlines.length}件の見出しから生成)`,
        });

        if (error) throw error;

        results.push({ theme: theme.number, status: "success" });
      } catch (err) {
        console.error(`テーマ${theme.number}の生成に失敗:`, err);
        results.push({ theme: theme.number, status: "failed" });
      }

      // Gemini無料枠のレート制限対策として1秒待機
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return NextResponse.json({
      success: true,
      headlinesFetched: headlines.length,
      results,
    });
  } catch (err) {
    console.error("X投稿ドラフト生成エラー:", err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}