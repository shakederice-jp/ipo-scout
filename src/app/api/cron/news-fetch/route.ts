import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);

const ADMIN_EMAIL = "shakederice@gmail.com";

// TinyURLで短縮
async function shortenUrl(url: string): Promise<string> {
  try {
    const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return url;
    return await res.text();
  } catch {
    return url;
  }
}

// PR Times RSS取得
async function fetchPRTimes(): Promise<{ title: string; url: string; source: string }[]> {
  const queries = ["資金調達", "新規上場", "スタートアップ"];
  const results: { title: string; url: string; source: string }[] = [];
  for (const q of queries) {
    try {
      const url = `https://prtimes.jp/rss20.aspx?keyword=${encodeURIComponent(q)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const xml = await res.text();
      const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
      for (const match of itemMatches) {
        const block = match[1];
        const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
          ?? block.match(/<title>(.*?)<\/title>/)?.[1] ?? "";
        const link = block.match(/<link>(.*?)<\/link>/)?.[1] ?? "";
        if (title && link && !results.find(r => r.url === link)) {
          results.push({ title: title.trim(), url: link.trim(), source: "PR TIMES" });
        }
        if (results.length >= 20) break;
      }
    } catch { continue; }
  }
  return results.slice(0, 20);
}

// News API取得
async function fetchNewsAPI(): Promise<{ title: string; url: string; source: string; summary: string }[]> {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) return [];
  const queries = [
    "Japan IPO startup investment",
    "semiconductor AI fintech Japan stock",
  ];
  const results: { title: string; url: string; source: string; summary: string }[] = [];
  for (const q of queries) {
    try {
      const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=publishedAt&pageSize=10&apiKey=${apiKey}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const data = await res.json();
      for (const article of data.articles ?? []) {
        if (!article.title || article.title === "[Removed]") continue;
        if (results.find(r => r.url === article.url)) continue;
        results.push({
          title: article.title,
          url: article.url,
          source: article.source?.name ?? "海外メディア",
          summary: article.description ?? "",
        });
        if (results.length >= 15) break;
      }
    } catch { continue; }
  }
  return results;
}

// Claude分析
async function analyzeWithClaude(items: { title: string; source: string; summary?: string }[]): Promise<any[]> {
  const prompt = `以下のニュース記事リストを分析し、JSONのみで返してください。マークダウン不要。

【ニュース一覧】
${items.map((item, i) => `${i + 1}. [${item.source}] ${item.title}${item.summary ? `\n   概要: ${item.summary}` : ""}`).join("\n")}

各記事について以下を判定してください:
{
  "results": [
    {
      "index": 1,
      "sector": "AI・機械学習 / フィンテック / 半導体 / ヘルスケア / SaaS・クラウド / 小売・EC / 製造・ロボット / エネルギー / 不動産・建設 / その他",
      "sector_score": 1〜10,
      "ai_comment": "20字以内でポイントを端的に",
      "is_featured": true/false,
     "title_ja": "英語タイトルの場合は日本語に自然に翻訳。日本語タイトルはそのまま",
      "tweet": "X投稿用140文字以内のツイート本文。日本語で。絵文字1〜2個・ハッシュタグ2個・末尾にURLプレースホルダー[URL]を含める。URL込みで140文字に収まるよう本文は110文字以内にすること"
    }
  ]
}`;

  try {
    const msg = await claude.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
    });
    const text = (msg.content[0] as any).text ?? "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return parsed.results ?? [];
  } catch {
    return [];
  }
}

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const useNewsAPI = req.nextUrl.searchParams.get("newsapi") !== "false";
  const supabase = getSupabase();

  // 3日以上前のデータを削除
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from("market_trends").delete().lt("fetched_at", threeDaysAgo);

  const allItems: { title: string; url: string; source: string; summary?: string }[] = [];

  // PR Times取得
  const prItems = await fetchPRTimes();
  allItems.push(...prItems);

  // News API取得（朝・昼のみ）
  if (useNewsAPI) {
    const newsItems = await fetchNewsAPI();
    allItems.push(...newsItems);
  }

  if (allItems.length === 0) {
    return NextResponse.json({ success: true, message: "取得0件", fetched_at: new Date().toISOString() });
  }

  // Claude分析
  const analysisResults = await analyzeWithClaude(allItems);

  // 短縮URL生成 & Supabase保存
  const inserts = [];
  const featuredItems: { title: string; tweet: string; shortUrl: string; sector: string }[] = [];

  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];
    const analysis = analysisResults.find((r: any) => r.index === i + 1);
    const shortUrl = await shortenUrl(item.url);

    inserts.push({
      source: item.source,
      title: analysis?.title_ja ?? item.title,
      url: item.url,
      summary: item.summary ?? null,
      sector: analysis?.sector ?? "その他",
      sector_score: analysis?.sector_score ?? 5,
      ai_comment: analysis?.ai_comment ?? null,
      is_featured: analysis?.is_featured ?? false,
      fetched_at: new Date().toISOString(),
    });

    // 注目記事のツイート文を収集
    if (analysis?.is_featured && analysis?.tweet) {
      const tweet = analysis.tweet.replace("[URL]", shortUrl);
      featuredItems.push({
        title: item.title,
        tweet,
        shortUrl,
        sector: analysis.sector ?? "その他",
      });
    }
  }

  await supabase.from("market_trends").insert(inserts);

  // 注目記事があればメール送信
  if (featuredItems.length > 0) {
    const timeLabel = useNewsAPI ? "朝・昼" : "夕方";
    const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

    const emailHtml = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f4fbfc">
        <div style="background:#0d4f52;padding:16px 24px;border-radius:12px 12px 0 0">
          <h2 style="color:white;margin:0;font-size:16px">📡 大手町発マーケットトレンド</h2>
          <p style="color:#a0d4d6;margin:4px 0 0;font-size:12px">${timeLabel}の注目ニュース｜${now}</p>
        </div>
        <div style="background:white;padding:24px;border-radius:0 0 12px 12px;border:1px solid #b3e8ea">
          <p style="font-size:13px;color:#082b2e;margin:0 0 20px">
            以下のツイート文をそのままXにコピペして投稿できます。
          </p>
          ${featuredItems.map((item, i) => `
            <div style="margin-bottom:24px;padding:16px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0">
              <div style="font-size:11px;color:#66c3c6;font-weight:700;margin-bottom:6px">
                📌 注目ニュース ${i + 1}｜${item.sector}
              </div>
              <div style="font-size:12px;color:#334155;margin-bottom:12px;line-height:1.5">
                ${item.title}
              </div>
              <div style="background:#0d4f52;border-radius:8px;padding:12px 14px">
                <div style="font-size:10px;color:#a0d4d6;margin-bottom:6px;font-weight:700">
                  ▼ X投稿用（そのままコピペ）
                </div>
                <div style="font-size:13px;color:white;line-height:1.7;white-space:pre-wrap;">${item.tweet}</div>
              </div>
              <div style="margin-top:8px;font-size:11px;color:#94a3b8">
                🔗 元記事: <a href="${item.shortUrl}" style="color:#66c3c6">${item.shortUrl}</a>
              </div>
            </div>
          `).join("")}
          <p style="margin-top:16px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px">
            © 大手町調査室九課 自動マーケットレポート
          </p>
        </div>
      </div>
    `;

    await resend.emails.send({
      from: "大手町マーケットレポート <noreply@finance-tower.com>",
      to: ADMIN_EMAIL,
      subject: `【大手町トレンド】${timeLabel}の注目ニュース ${featuredItems.length}選`,
      html: emailHtml,
    });
  }

  return NextResponse.json({
    success: true,
    total: inserts.length,
    featured: featuredItems.length,
    pr_times: prItems.length,
    news_api: useNewsAPI ? allItems.length - prItems.length : 0,
    fetched_at: new Date().toISOString(),
  });
}