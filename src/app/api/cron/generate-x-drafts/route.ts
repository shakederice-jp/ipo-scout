import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  generateIpoCalendarPost,
  generateEconomicCalendarPost,
  generateScoreTrendPost,
  generateLockupCalendarPost,
  generatePriceCheckpointPost,
  generateInvestingTipPost,
  generateLockupCountdownPost,
  generateEconEventResultPost,
  generateCompetitorComparisonPost,
  generateDeepDiveTrendPost,
  generateLockupPreRecapPost,
} from "@/lib/x-post-themes";
import { notifyAdmin } from "@/lib/notify-admin";

// テーマ生成のたびにGemini呼び出しが走るため、Vercelの関数タイムアウトに余裕を持たせる。
// 2026/9/8: テーマ数が増えるにつれ直列実行の合計時間が伸び、この上限に達して
// 関数が強制終了し、最後の管理者通知メールまで到達できない(=メールが来ない)
// 事象が起きていたと判明。テーマをできる限り並列実行に変更した上で、念のため
// 上限も少し引き上げた(下記「並列実行への変更」のコメントを参照)。
export const maxDuration = 120;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TRENDS_URL = "https://ipo.finance-tower.com/trends";
// 2026/9/9追記: X投稿フッターに貼るリンクは、記事一覧(/trends)ではなくトップページに変更。
const SITE_ROOT_URL = "https://ipo.finance-tower.com/";

// 各特集記事の末尾に固定で付けるリンク。Xはマークダウン記法([text](url))を解釈せず
// 記号がそのまま文字として表示されてしまうため、あえてマークダウンにはせず、
// 裸のURL(https://...)をそのまま書く形にする。Xは裸のURLを自動でリンク化してくれる。
const X_SHARE_FOOTER = `\n\n${"─".repeat(20)}\n📊 IPO企業情報AI分析レポート　担当：大手町調査室九課\n${SITE_ROOT_URL}`;

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
    type ThemeOutcome = { theme: number; status: string; trendsUpdated: boolean; lockupPreRecapText?: string };

    async function runTheme(
      themeNumber: number,
      label: string,
      sector: string,
      skipReason: string,
      externalId: string,
      generate: () => Promise<{ content: string; sourceLinks: { title: string; url: string; source: string }[] } | null>
    ): Promise<ThemeOutcome> {
      try {
        // 本日分が既に保存済みなら、Gemini呼び出し(generate)自体を行わずにスキップする。
        // 以前はここで毎回generate()を呼んでおり、既に成功済みの日でも2回目・3回目のcronで
        // 無駄にGeminiを呼び直し、そこでタイムアウト等が起きると「失敗」として通知されていた
        // (実際にはその日の記事は既に保存済みで、サイト上は何も困っていない誤検知だった)。
        const { data: existing } = await supabase
          .from("market_trends")
          .select("id")
          .eq("external_id", externalId)
          .maybeSingle();
        if (existing) {
          return { theme: themeNumber, status: "skipped(本日分は生成済み)", trendsUpdated: false };
        }

        const result = await generate();
        const outcome = await saveThemeArticle(label, sector, result, externalId);
        if (outcome === "saved") return { theme: themeNumber, status: "success", trendsUpdated: true };
        if (outcome === "skipped_duplicate") return { theme: themeNumber, status: "skipped(本日分は生成済み)", trendsUpdated: false };
        return { theme: themeNumber, status: `skipped(${skipReason})`, trendsUpdated: false };
      } catch (err) {
        console.error(`テーマ${themeNumber}の生成に失敗:`, err);
        return { theme: themeNumber, status: "failed", trendsUpdated: false };
      }
    }

    // JSTの日付文字列(YYYY-MM-DD)。1日1回だけ生成すればよいテーマの重複防止に使う。
    // 以前UTC基準の日付境界でズレが起きたことがあるため、必ずAsia/Tokyoで計算する。
    const jstDay = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

    // テーマ①/③: 「初値・その後の値動き」答え合わせ、該当が無い日は「IPO投資ワンポイント講座」で埋める
    // (2026/9/2、「大株主・VC/PEの異動ウォッチ」の廃止と入れ替えで新設)
    async function runTheme1(): Promise<ThemeOutcome> {
      try {
        const checkpointResult = await generatePriceCheckpointPost();
        if (checkpointResult) {
          const outcome = await saveThemeArticle(
            `初値・その後の値動き(${checkpointResult.companyName}・${checkpointResult.checkpointLabel})`,
            checkpointResult.sector,
            checkpointResult.result,
            checkpointResult.externalId
          );
          return {
            theme: 1,
            status: outcome === "saved" ? "success" : outcome === "skipped_duplicate" ? "skipped(既出)" : "skipped",
            trendsUpdated: outcome === "saved",
          };
        } else {
          // ①に該当銘柄が無い日は③(IPO投資ワンポイント講座)で埋める。
          // こちらは自社DBに依存しないため、jstDayキーで1日1回に限定するだけで必ず生成できる。
          const tipResult = await generateInvestingTipPost();
          const outcome = await saveThemeArticle(
            "IPO投資ワンポイント講座",
            "投資の基礎知識",
            tipResult,
            `investing-tip-${jstDay}`
          );
          return {
            theme: 1,
            status: outcome === "saved" ? "success(③で穴埋め)" : outcome === "skipped_duplicate" ? "skipped(既出)" : "skipped",
            trendsUpdated: outcome === "saved",
          };
        }
      } catch (err) {
        console.error("初値チェックポイント/IPO投資ワンポイント講座の生成に失敗:", err);
        return { theme: 1, status: "failed", trendsUpdated: false };
      }
    }

    // テーマ⑪⑫⑬⑭⑮: 2026/9/2〜9/8追加。①③(初値・その後の値動き)と同様、候補の有無や
    // どの銘柄・イベントを取り上げるかが日によって変わるため、runTheme()の
    // 固定external_id方式ではなく、各生成関数が内部で候補ごとの重複チェックを行う
    // 方式にしている(該当なしの日はスキップするだけで、③のようなフォールバックはない)。
    async function runTheme11(): Promise<ThemeOutcome> {
      try {
        const lockupResult = await generateLockupCountdownPost();
        if (lockupResult) {
          const outcome = await saveThemeArticle(
            `ロックアップ解除カウントダウン(${lockupResult.companyName})`,
            lockupResult.sector,
            lockupResult.result,
            lockupResult.externalId
          );
          return { theme: 11, status: outcome === "saved" ? "success" : outcome === "skipped_duplicate" ? "skipped(既出)" : "skipped", trendsUpdated: outcome === "saved" };
        }
        return { theme: 11, status: "skipped(該当銘柄なし)", trendsUpdated: false };
      } catch (err) {
        console.error("ロックアップ解除カウントダウンの生成に失敗:", err);
        return { theme: 11, status: "failed", trendsUpdated: false };
      }
    }

    async function runTheme12(): Promise<ThemeOutcome> {
      try {
        const econResult = await generateEconEventResultPost();
        if (econResult) {
          const outcome = await saveThemeArticle(
            `経済指標・イベント速報(${econResult.label})`,
            econResult.sector,
            econResult.result,
            econResult.externalId
          );
          return { theme: 12, status: outcome === "saved" ? "success" : outcome === "skipped_duplicate" ? "skipped(既出)" : "skipped", trendsUpdated: outcome === "saved" };
        }
        return { theme: 12, status: "skipped(該当イベントなし)", trendsUpdated: false };
      } catch (err) {
        console.error("経済指標・イベント速報の生成に失敗:", err);
        return { theme: 12, status: "failed", trendsUpdated: false };
      }
    }

    async function runTheme13(): Promise<ThemeOutcome> {
      try {
        const competitorResult = await generateCompetitorComparisonPost();
        if (competitorResult) {
          const outcome = await saveThemeArticle(
            `IPO企業 vs 競合の決算比較(${competitorResult.companyName})`,
            competitorResult.sector,
            competitorResult.result,
            competitorResult.externalId
          );
          return { theme: 13, status: outcome === "saved" ? "success" : outcome === "skipped_duplicate" ? "skipped(既出)" : "skipped", trendsUpdated: outcome === "saved" };
        }
        return { theme: 13, status: "skipped(該当銘柄なし)", trendsUpdated: false };
      } catch (err) {
        console.error("IPO企業 vs 競合の決算比較の生成に失敗:", err);
        return { theme: 13, status: "failed", trendsUpdated: false };
      }
    }

    async function runTheme14(): Promise<ThemeOutcome> {
      try {
        const deepDiveResult = await generateDeepDiveTrendPost();
        if (deepDiveResult) {
          const outcome = await saveThemeArticle(
            `ビジネスモデル・ストーリー・競合との違い(${deepDiveResult.companyName})`,
            deepDiveResult.sector,
            deepDiveResult.result,
            deepDiveResult.externalId
          );
          return { theme: 14, status: outcome === "saved" ? "success" : outcome === "skipped_duplicate" ? "skipped(既出)" : "skipped", trendsUpdated: outcome === "saved" };
        }
        return { theme: 14, status: "skipped(該当銘柄なし)", trendsUpdated: false };
      } catch (err) {
        console.error("ビジネスモデル・ストーリー・競合との違いの生成に失敗:", err);
        return { theme: 14, status: "failed", trendsUpdated: false };
      }
    }

    // テーマ⑮: 2026/9/8追加。「初値・その後の値動き」カテゴリーに位置づける、ロックアップ
    // 解除直前(既定7日前)の振り返り記事。銘柄ごとに100万円投資シミュレーションの現在額と
    // 事前AI分析との答え合わせに加え、ロックアップ解除への注意喚起をまとめて1本にする。
    // タイトルの接頭辞をテーマ①(初値・その後の値動き)と揃えることで、/trendsページの
    // カテゴリー分類(タイトル前方一致)上も同じカテゴリーに表示される。
    // 頻度が低く(銘柄ごとに90日後・180日後の解除タイミングでしか出ない)取りこぼされたく
    // ないため、成功時は他のテーマと違い、通知メール本文に記事全文も埋め込む(下記参照)。
    async function runTheme15(): Promise<ThemeOutcome> {
      try {
        const lockupPreRecapResult = await generateLockupPreRecapPost();
        if (lockupPreRecapResult) {
          const outcome = await saveThemeArticle(
            `初値・その後の値動き(${lockupPreRecapResult.companyName}・${lockupPreRecapResult.checkpointLabel})`,
            lockupPreRecapResult.sector,
            lockupPreRecapResult.result,
            lockupPreRecapResult.externalId
          );
          return {
            theme: 15,
            status: outcome === "saved" ? "success" : outcome === "skipped_duplicate" ? "skipped(既出)" : "skipped",
            trendsUpdated: outcome === "saved",
            lockupPreRecapText: outcome === "saved" ? lockupPreRecapResult.result.content : undefined,
          };
        }
        return { theme: 15, status: "skipped(該当銘柄なし)", trendsUpdated: false };
      } catch (err) {
        console.error("ロックアップ解除前振り返りの生成に失敗:", err);
        return { theme: 15, status: "failed", trendsUpdated: false };
      }
    }

    // 2026/9/8: 以前はテーマ①⑪⑫⑬⑭⑮を1つずつ直列(await)で実行しており、テーマ数が
    // 増えるにつれて合計の待ち時間が伸び、Vercelの関数タイムアウト(maxDuration)に達して
    // 関数ごと強制終了し、最後の管理者通知メール送信まで到達できないことがあった
    // (「マーケットトレンド更新メールがほとんど来なくなった」の根本原因の1つ)。
    // 各テーマは互いに依存しないため、最初の4テーマと同様にすべて並列実行に変更し、
    // 合計の待ち時間を「一番遅い1テーマ分」に近づけた。
    const themeTasks: Promise<ThemeOutcome>[] = [
      runTheme(2, "IPOカレンダー", "IPOカレンダー", "該当銘柄なし", `ipo-calendar-${jstDay}`, generateIpoCalendarPost),
      runTheme(3, "週内の重要経済指標カレンダー", "マクロ経済", "該当イベントなし", `econ-calendar-${jstDay}`, generateEconomicCalendarPost),
      runTheme(9, "直近承認銘柄のスコア傾向", "IPOスコア分析", "対象銘柄なし", `score-trend-${jstDay}`, generateScoreTrendPost),
      runTheme(10, "ロックアップ解除カレンダー", "IPO需給", "該当銘柄なし", `lockup-calendar-${jstDay}`, generateLockupCalendarPost),
      runTheme1(),
      runTheme11(),
      runTheme12(),
      runTheme13(),
      runTheme14(),
      runTheme15(),
    ];

    const themeResults = await Promise.all(themeTasks);
    let lockupPreRecapText: string | null = null;
    for (const r of themeResults) {
      results.push({ theme: r.theme, status: r.status });
      if (r.trendsUpdated) trendsUpdated = true;
      if (r.lockupPreRecapText) lockupPreRecapText = r.lockupPreRecapText;
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

      if (lockupPreRecapText) {
        emailBody += `\n\n${"=".repeat(30)}\n🔓 ロックアップ解除前の振り返り記事(そのままXにコピペ可)\n${"=".repeat(30)}\n\n${lockupPreRecapText}`;
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
