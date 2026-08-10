import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchAllHeadlines } from "@/lib/rss-feeds";
import {
  RSS_THEMES,
  generateThemedPost,
  generateIpoCalendarPost,
  generateLargeHoldingsPost,
  generateEconomicCalendarPost,
} from "@/lib/x-post-themes";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: { theme: number; status: string }[] = [];

  try {
    const headlines = await fetchAllHeadlines();

    if (headlines.length === 0) {
      return NextResponse.json(
        { error: "RSSフィードの取得に失敗しました(0件)" },
        { status: 500 }
      );
    }

    // テーマ①: 大量保有報告書ウォッチ
    try {
      const holdingsContent = await generateLargeHoldingsPost();
      if (holdingsContent) {
        const { error } = await supabase.from("x_post_drafts").insert({
          theme_number: 1,
          theme_label: "大量保有報告書ウォッチ",
          content: holdingsContent,
          source_note: "EDINET由来(docTypeCode=350)",
        });
        if (error) throw error;
        results.push({ theme: 1, status: "success" });
      } else {
        results.push({ theme: 1, status: "skipped(該当書類なし)" });
      }
    } catch (err) {
      console.error("テーマ1の生成に失敗:", err);
      results.push({ theme: 1, status: "failed" });
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // テーマ②: IPOカレンダー
    try {
      const ipoContent = await generateIpoCalendarPost();
      if (ipoContent) {
        const { error } = await supabase.from("x_post_drafts").insert({
          theme_number: 2,
          theme_label: "IPOカレンダー",
          content: ipoContent,
          source_note: "自社DB(ipo_companies)由来",
        });
        if (error) throw error;
        results.push({ theme: 2, status: "success" });
      } else {
        results.push({ theme: 2, status: "skipped(該当銘柄なし)" });
      }
    } catch (err) {
      console.error("テーマ2の生成に失敗:", err);
      results.push({ theme: 2, status: "failed" });
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // テーマ③: 週内の重要経済指標カレンダー
    try {
      const econContent = await generateEconomicCalendarPost();
      if (econContent) {
        const { error } = await supabase.from("x_post_drafts").insert({
          theme_number: 3,
          theme_label: "週内の重要経済指標カレンダー",
          content: econContent,
          source_note: "自社DB(economic_events)由来",
        });
        if (error) throw error;
        results.push({ theme: 3, status: "success" });
      } else {
        results.push({ theme: 3, status: "skipped(該当イベントなし)" });
      }
    } catch (err) {
      console.error("テーマ3の生成に失敗:", err);
      results.push({ theme: 3, status: "failed" });
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // テーマ④〜⑧: RSS由来
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