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
import { notifyAdmin } from "@/lib/notify-admin";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TRENDS_URL = "https://ipo.finance-tower.com/trends";

// contentが二重にJSON化されてしまっている場合(AIの出力揺れ対策)に、正しい本文だけを取り出す
function extractCleanContent(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.includes('"content"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed.content === "string") return parsed.content;
    } catch {
      // JSON解析に失敗した場合はそのまま元の文字列を使う
    }
  }
  return raw;
}

async function saveThemeArticle(themeLabel: string, sector: string, result: { content: string; sourceLinks: { title: string; url: string; source: string }[] } | null) {
  if (!result) return false;
  await supabase.from("market_trends").insert({
    source: "大手町調査室九課",
    title: themeLabel,
    url: TRENDS_URL,
    summary: null,
    sector,
    sector_score: 8,
    ai_comment: null,
    is_featured: true,
    is_theme_article: true,
    content: extractCleanContent(result.content),
    source_links: result.sourceLinks,
    fetched_at: new Date().toISOString(),
  });
  return true;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: { theme: number; status: string }[] = [];
  let trendsUpdated = false;

  try {
    const headlines = await fetchAllHeadlines();

    if (headlines.length === 0) {
      return NextResponse.json(
        { error: "RSSフィードの取得に失敗しました(0件)" },
        { status: 500 }
      );
    }

    // テーマ①: 大量保有報告書ウォッチ → マーケットトレンドに掲載
    try {
      const holdingsResult = await generateLargeHoldingsPost();
      if (await saveThemeArticle("大量保有報告書ウォッチ", "その他", holdingsResult)) {
        trendsUpdated = true;
        results.push({ theme: 1, status: "success" });
      } else {
        results.push({ theme: 1, status: "skipped(該当書類なし)" });
      }
    } catch (err) {
      console.error("テーマ1の生成に失敗:", err);
      results.push({ theme: 1, status: "failed" });
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // テーマ②: IPOカレンダー → マーケットトレンドに掲載
    try {
      const ipoResult = await generateIpoCalendarPost();
      if (await saveThemeArticle("IPOカレンダー", "その他", ipoResult)) {
        trendsUpdated = true;
        results.push({ theme: 2, status: "success" });
      } else {
        results.push({ theme: 2, status: "skipped(該当銘柄なし)" });
      }
    } catch (err) {
      console.error("テーマ2の生成に失敗:", err);
      results.push({ theme: 2, status: "failed" });
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // テーマ③: 週内の重要経済指標カレンダー → マーケットトレンドに掲載
    try {
      const econResult = await generateEconomicCalendarPost();
      if (await saveThemeArticle("週内の重要経済指標カレンダー", "その他", econResult)) {
        trendsUpdated = true;
        results.push({ theme: 3, status: "success" });
      } else {
        results.push({ theme: 3, status: "skipped(該当イベントなし)" });
      }
    } catch (err) {
      console.error("テーマ3の生成に失敗:", err);
      results.push({ theme: 3, status: "failed" });
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // テーマ⓪: 予約されているIPO再掲(2営業日後・4営業日後)をチェックして追加(こちらはX手動投稿用のまま)
    let ipoRepostCount = 0;
    try {
      const todayStr = new Date().toISOString().split("T")[0];
      const { data: duePosts } = await supabase
        .from("scheduled_posts")
        .select("id, tweet_text")
        .eq("scheduled_date", todayStr)
        .eq("posted", false);

      for (const p of duePosts ?? []) {
        const { error } = await supabase.from("x_post_drafts").insert({
          theme_number: 0,
          theme_label: "IPO再掲",
          content: p.tweet_text,
          source_note: "予約投稿(2営業日後/4営業日後の自動再掲)",
        });
        if (!error) {
          await supabase.from("scheduled_posts").update({ posted: true }).eq("id", p.id);
          ipoRepostCount++;
        }
      }
    } catch (err) {
      console.error("IPO再掲ドラフトの生成に失敗:", err);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // テーマ④〜⑧: RSS由来 → マーケットトレンドに掲載
    for (const theme of RSS_THEMES) {
      try {
        const themeResult = await generateThemedPost(theme, headlines);
        if (await saveThemeArticle(theme.label, "その他", themeResult)) {
          trendsUpdated = true;
          results.push({ theme: theme.number, status: "success" });
        } else {
          results.push({ theme: theme.number, status: "skipped" });
        }
      } catch (err) {
        console.error(`テーマ${theme.number}の生成に失敗:`, err);
        results.push({ theme: theme.number, status: "failed" });
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // メール通知: マーケットトレンド更新の短い通知 + IPO再掲があればその文面
    try {
      let emailBody = trendsUpdated
        ? `大手町発マーケットトレンドが更新されました。\n\n▼ 記事を見る\n${TRENDS_URL}`
        : "本日はマーケットトレンドの更新対象がありませんでした。";

      if (ipoRepostCount > 0) {
        const { data: repostDrafts } = await supabase
          .from("x_post_drafts")
          .select("content")
          .eq("theme_number", 0)
          .eq("theme_label", "IPO再掲")
          .order("created_at", { ascending: false })
          .limit(ipoRepostCount);

        if (repostDrafts && repostDrafts.length > 0) {
          const repostBody = repostDrafts.map(d => d.content).join("\n\n" + "─".repeat(20) + "\n\n");
          emailBody += `\n\n${"=".repeat(30)}\n📌 IPO再掲ドラフト(${ipoRepostCount}件・そのままXにコピペ可)\n${"=".repeat(30)}\n\n${repostBody}`;
        }
      }

      await notifyAdmin(
        `大手町発マーケットトレンド 更新通知`,
        emailBody,
        "info"
      );
    } catch (e) {
      console.error("更新通知メール送信失敗:", e);
    }

    return NextResponse.json({
      success: true,
      headlinesFetched: headlines.length,
      trendsUpdated,
      ipoRepostCount,
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