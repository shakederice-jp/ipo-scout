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

// テーマ生成のたびにGemini呼び出し(再試行込みで最大2回/テーマ)が走るため、
// Vercelの関数タイムアウトに余裕を持たせる(axes/analyzeルートと同じ考え方)
export const maxDuration = 90;

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
  const { error } = await supabase.from("market_trends").insert({
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
  // 以前はここでinsertのエラーを確認しておらず、DB保存に失敗していても
  // 常にtrue(=成功)を返してしまっていた。そのため上位のcronログには
  // success:trueと表示されるのに、実際にはmarket_trendsに1件も
  // 保存されない、という不整合が起きていた。エラー時は例外を投げ、
  // 呼び出し元のtry/catchで「failed」として記録・通知させる。
  if (error) {
    console.error(`market_trends insert失敗 (${themeLabel}):`, error);
    throw new Error(`[${themeLabel}] Supabase insert失敗: ${error.message} (code: ${error.code ?? "unknown"})`);
  }
  return true;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: { theme: number; status: string }[] = [];
  let trendsUpdated = false;

  // 「新規IPO承認」ドラフト(画像URL付き)のうち、まだメールに載せていないものを先に処理して送信する。
  // 以前はこの後に続く8テーマ分のAI記事生成が終わってから最後にまとめて送る作りだったが、
  // AI生成に時間がかかりすぎるとVercelの関数タイムアウトで強制終了され、この部分まで
  // 辿り着けないことがあった(GitHub Actions側はエラーに気づかず「成功」と表示してしまう)。
  // そのため、時間のかかる処理より前に、独立した短い処理として先に済ませておく。
  try {
    const { data: ipoDrafts } = await supabase
      .from("x_post_drafts")
      .select("id, content, image_url, created_at")
      .eq("theme_number", 0)
      .eq("theme_label", "新規IPO承認")
      .eq("included_in_digest", false)
      .order("created_at", { ascending: false });

    if (ipoDrafts && ipoDrafts.length > 0) {
      const ipoBody = ipoDrafts.map(d =>
        d.content + (d.image_url ? `\n\n🖼 画像: ${d.image_url}` : "")
      ).join("\n\n" + "─".repeat(20) + "\n\n");

      await notifyAdmin(
        `🆕 新規IPO承認ドラフト(${ipoDrafts.length}件)`,
        ipoBody,
        "info"
      );

      // メール送信が成功した後で「送信済み」に更新する。
      // (先に更新してしまうと、メール送信自体が失敗した場合に
      //  ドラフトが送られないまま「送信済み」扱いになってしまうため)
      const { error: markError } = await supabase
        .from("x_post_drafts")
        .update({ included_in_digest: true })
        .in("id", ipoDrafts.map(d => d.id));
      if (markError) {
        console.error("新規IPOドラフトの送信済みフラグ更新に失敗:", markError.message);
      }
    }
  } catch (err) {
    console.error("新規IPOドラフトのメール送信に失敗:", err);
  }

  try {
    const headlines = await fetchAllHeadlines();

    if (headlines.length === 0) {
      return NextResponse.json(
        { error: "RSSフィードの取得に失敗しました(0件)" },
        { status: 500 }
      );
    }

    // テーマ①〜⑧の生成を1件ずつ順番に(間に1秒待機を挟んで)実行していたが、
    // 8テーマ分×最大2回のGemini呼び出しを直列で積み上げると簡単に1分半〜を超えてしまい、
    // Vercelの関数タイムアウトで強制終了されることがあった(この場合、途中結果は保存されるが
    // 最後まで到達できず、失敗テーマの記録やメール送信が行われないまま終わってしまう)。
    // そのため、互いに依存しないテーマ生成は並行実行し、待機時間の合計より
    // 一番遅い1テーマ分の時間に近づくようにする。1テーマの結果を関数化して共通化する。
    async function runTheme(
      themeNumber: number,
      label: string,
      skipReason: string,
      generate: () => Promise<{ content: string; sourceLinks: { title: string; url: string; source: string }[] } | null>
    ): Promise<{ theme: number; status: string }> {
      try {
        const result = await generate();
        if (await saveThemeArticle(label, "その他", result)) {
          return { theme: themeNumber, status: "success" };
        }
        return { theme: themeNumber, status: `skipped(${skipReason})` };
      } catch (err) {
        console.error(`テーマ${themeNumber}の生成に失敗:`, err);
        return { theme: themeNumber, status: "failed" };
      }
    }

    const themeTasks: Promise<{ theme: number; status: string }>[] = [
      runTheme(1, "大量保有報告書ウォッチ", "該当書類なし", generateLargeHoldingsPost),
      runTheme(2, "IPOカレンダー", "該当銘柄なし", generateIpoCalendarPost),
      runTheme(3, "週内の重要経済指標カレンダー", "該当イベントなし", generateEconomicCalendarPost),
      ...RSS_THEMES.map((theme) =>
        runTheme(theme.number, theme.label, "該当なし", () => generateThemedPost(theme, headlines))
      ),
    ];

    const themeResults = await Promise.all(themeTasks);
    for (const r of themeResults) {
      results.push(r);
      if (r.status === "success") trendsUpdated = true;
    }

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

    // 失敗したテーマがあれば、メールで気づけるようにまとめておく
    const failedThemes = results.filter((r) => r.status === "failed");

    // メール通知: マーケットトレンド更新の短い通知 + IPO再掲があればその文面
    try {
      let emailBody = trendsUpdated
        ? `大手町発マーケットトレンドが更新されました。\n\n▼ 記事を見る\n${TRENDS_URL}`
        : "本日はマーケットトレンドの更新対象がありませんでした。";

      if (failedThemes.length > 0) {
        emailBody += `\n\n${"=".repeat(30)}\n🚨 保存に失敗したテーマ(${failedThemes.length}件)\n${"=".repeat(30)}\n\nテーマ番号: ${failedThemes.map((f) => f.theme).join(", ")}\n詳細はVercelのFunction Logsを確認してください。`;
      }

      // 「新規IPO承認」ドラフトは、この関数の冒頭(時間のかかるAI生成より前)で
      // 独立した専用メールとしてすでに送信済みのため、ここでは扱わない。

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
        failedThemes.length > 0 ? (trendsUpdated ? "warn" : "error") : "info"
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