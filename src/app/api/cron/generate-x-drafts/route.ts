import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  generateIpoCalendarPost,
  generateEconomicCalendarPost,
  generateScoreTrendPost,
  generateLockupCalendarPost,
  generateShareholderMovementPosts,
} from "@/lib/x-post-themes";
import { notifyAdmin } from "@/lib/notify-admin";

// テーマ生成のたびにGemini呼び出しが走るため、Vercelの関数タイムアウトに余裕を持たせる
export const maxDuration = 90;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TRENDS_URL = "https://ipo.finance-tower.com/trends";

// 各特集記事の末尾に固定で付けるリンク。Xはマークダウン記法([text](url))を解釈せず
// 記号がそのまま文字として表示されてしまうため、あえてマークダウンにはせず、
// 裸のURL(https://...)をそのまま書く形にする。Xは裸のURLを自動でリンク化してくれる。
const X_SHARE_FOOTER = `\n\n${"─".repeat(20)}\n📊 IPO Scout｜AI駆動のIPO分析・投資判断支援サービス\n${TRENDS_URL}`;

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

type SaveOutcome = "saved" | "skipped_duplicate" | "no_content";

async function saveThemeArticle(
  themeLabel: string,
  sector: string,
  result: { content: string; sourceLinks: { title: string; url: string; source: string }[] } | null,
  externalId: string
): Promise<SaveOutcome> {
  if (!result) return "no_content";
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
    content: extractCleanContent(result.content) + X_SHARE_FOOTER,
    source_links: result.sourceLinks,
    fetched_at: new Date().toISOString(),
    external_id: externalId,
  });
  // 以前はここでinsertのエラーを確認しておらず、DB保存に失敗していても
  // 常にtrue(=成功)を返してしまっていた。エラー時は例外を投げ、
  // 呼び出し元のtry/catchで「failed」として記録・通知させる。
  // ただし external_id の重複(ユニーク制約違反・code 23505)は
  // 「同じ内容を本日すでに生成済み」という正常なケースなので、失敗扱いにしない。
  if (error) {
    if (error.code === "23505") {
      return "skipped_duplicate";
    }
    console.error(`market_trends insert失敗 (${themeLabel}):`, error);
    throw new Error(`[${themeLabel}] Supabase insert失敗: ${error.message} (code: ${error.code ?? "unknown"})`);
  }
  return "saved";
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: { theme: number; status: string }[] = [];
  let trendsUpdated = false;

  // 「新規IPO承認」ドラフト(画像URL付き)のうち、まだメールに載せていないものを先に処理して送信する。
  // 時間のかかるテーマ記事生成より前に、独立した短い処理として先に済ませておく。
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
    async function runTheme(
      themeNumber: number,
      label: string,
      sector: string,
      skipReason: string,
      externalId: string,
      generate: () => Promise<{ content: string; sourceLinks: { title: string; url: string; source: string }[] } | null>
    ): Promise<{ theme: number; status: string }> {
      try {
        const result = await generate();
        const outcome = await saveThemeArticle(label, sector, result, externalId);
        if (outcome === "saved") return { theme: themeNumber, status: "success" };
        if (outcome === "skipped_duplicate") return { theme: themeNumber, status: "skipped(本日分は生成済み)" };
        return { theme: themeNumber, status: `skipped(${skipReason})` };
      } catch (err) {
        console.error(`テーマ${themeNumber}の生成に失敗:`, err);
        return { theme: themeNumber, status: "failed" };
      }
    }

    // JSTの日付文字列(YYYY-MM-DD)。1日1回だけ生成すればよいテーマの重複防止に使う。
    // 以前UTC基準の日付境界でズレが起きたことがあるため、必ずAsia/Tokyoで計算する。
    const jstDay = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

    // 1日1回でよいテーマは並行実行し、待機時間の合計より一番遅い1テーマ分の時間に近づける
    const themeTasks: Promise<{ theme: number; status: string }>[] = [
      runTheme(2, "IPOカレンダー", "IPOカレンダー", "該当銘柄なし", `ipo-calendar-${jstDay}`, generateIpoCalendarPost),
      runTheme(3, "週内の重要経済指標カレンダー", "マクロ経済", "該当イベントなし", `econ-calendar-${jstDay}`, generateEconomicCalendarPost),
      runTheme(9, "直近承認銘柄のスコア傾向", "IPOスコア分析", "対象銘柄なし", `score-trend-${jstDay}`, generateScoreTrendPost),
      runTheme(10, "ロックアップ解除カレンダー", "IPO需給", "該当銘柄なし", `lockup-calendar-${jstDay}`, generateLockupCalendarPost),
    ];

    const themeResults = await Promise.all(themeTasks);
    for (const r of themeResults) {
      results.push(r);
      if (r.status === "success") trendsUpdated = true;
    }

    // テーマ①: 大株主・VC/PEの異動ウォッチ(EDINET由来)
    // 1回の提出書類ごとに1本の記事になるため、複数件生成されることがある。
    // docID単位で重複防止しているため、1日に何度cronが走っても同じ提出を2回記事化しない。
    try {
      const shareholderPosts = await generateShareholderMovementPosts();
      if (shareholderPosts.length === 0) {
        results.push({ theme: 1, status: "skipped(該当書類なし)" });
      }
      for (const post of shareholderPosts) {
        const outcome = await saveThemeArticle(
          `大株主・VC/PEの異動ウォッチ(${post.companyName})`,
          post.sector,
          post.result,
          post.externalId
        );
        if (outcome === "saved") trendsUpdated = true;
        results.push({
          theme: 1,
          status: outcome === "saved" ? "success" : outcome === "skipped_duplicate" ? "skipped(既出)" : "skipped",
        });
      }
    } catch (err) {
      console.error("大株主・VC/PEの異動ウォッチの生成に失敗:", err);
      results.push({ theme: 1, status: "failed" });
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
