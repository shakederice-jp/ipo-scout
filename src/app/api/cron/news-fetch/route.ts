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

// 情報源定義
export const NEWS_SOURCES = [
  { name: "PR TIMES", url: "https://prtimes.jp/rss20.aspx?keyword=%E8%B3%87%E9%87%91%E8%AA%BF%E9%81%94", category: "資金調達" },
  { name: "PR TIMES", url: "https://prtimes.jp/rss20.aspx?keyword=%E6%96%B0%E8%A6%8F%E4%B8%8A%E5%A0%B4", category: "新規上場" },
  { name: "PR TIMES", url: "https://prtimes.jp/rss20.aspx?keyword=%E3%82%B9%E3%82%BF%E3%83%BC%E3%83%88%E3%82%A2%E3%83%83%E3%83%97", category: "スタートアップ" },
  { name: "ロイター日本語版", url: "https://feeds.reuters.com/reuters/JPBusinessNews", category: "ビジネス" },
  { name: "東洋経済オンライン", url: "https://toyokeizai.net/list/feed/rss", category: "産業トレンド" },
  { name: "みんかぶ", url: "https://minkabu.jp/rss/news", category: "株式・IPO" },
];

// RSS取得
async function fetchRSS(url: string, sourceName: string): Promise<{ title: string; url: string; source: string }[]> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: { title: string; url: string; source: string }[] = [];
    const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
    for (const match of itemMatches) {
      const block = match[1];
      const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
        ?? block.match(/<title>(.*?)<\/title>/)?.[1] ?? "";
      const link = block.match(/<link>(.*?)<\/link>/)?.[1]
        ?? block.match(/<guid[^>]*>(.*?)<\/guid>/)?.[1] ?? "";
      if (title && link && !items.find(i => i.url === link)) {
        items.push({
          title: title.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim(),
          url: link.trim(),
          source: sourceName,
        });
      }
      if (items.length >= 8) break;
    }
    return items;
  } catch {
    return [];
  }
}

// TinyURL短縮
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

// Claude分析
async function analyzeWithClaude(items: { title: string; source: string }[]): Promise<any[]> {
  const prompt = `あなたは日本の投資トレンドアナリストです。以下のニュース記事を分析し、JSONのみで返してください。マークダウン不要。

【ニュース一覧】
${items.map((item, i) => `${i + 1}. [${item.source}] ${item.title}`).join("\n")}

投資家・IPO投資家の視点で各記事を評価してください:
{
  "results": [
    {
      "index": 1,
      "sector": "AI・機械学習 / フィンテック / 半導体 / ヘルスケア / SaaS・クラウド / 小売・EC / 製造・ロボット / エネルギー / 不動産・建設 / その他",
      "sector_score": 1〜10（投資家にとっての注目度。IPO・資金調達・成長性で判断）,
      "ai_comment": "投資家視点で25字以内のポイント",
      "is_featured": true/false（sector_scoreが7以上かつIPO・資金調達・成長セクターに直結する記事のみtrue）,
      "tweet": "X投稿用ツイート。日本語140文字以内。絵文字1〜2個・#IPO #投資 などハッシュタグ2個・末尾に[URL]プレースホルダー。本文は100文字以内に収めること"
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

  const supabase = getSupabase();

  // 3日以上前のデータを削除
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from("market_trends").delete().lt("fetched_at", threeDaysAgo);

  // 全ソースからRSS取得
  const allItems: { title: string; url: string; source: string }[] = [];
  for (const src of NEWS_SOURCES) {
    const items = await fetchRSS(src.url, src.name);
    for (const item of items) {
      if (!allItems.find(a => a.title === item.title)) {
        allItems.push(item);
      }
    }
  }

  if (allItems.length === 0) {
    return NextResponse.json({ success: true, message: "取得0件", fetched_at: new Date().toISOString() });
  }

  // Claude分析
  const analysisResults = await analyzeWithClaude(allItems);

  // 短縮URL生成 & 保存
  const inserts = [];
  const featuredItems: { title: string; tweet: string; shortUrl: string; sector: string }[] = [];

  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];
    const analysis = analysisResults.find((r: any) => r.index === i + 1);
    const shortUrl = await shortenUrl(item.url);

    inserts.push({
      source: item.source,
      title: item.title,
      url: item.url,
      summary: null,
      sector: analysis?.sector ?? "その他",
      sector_score: analysis?.sector_score ?? 5,
      ai_comment: analysis?.ai_comment ?? null,
      is_featured: analysis?.is_featured ?? false,
      fetched_at: new Date().toISOString(),
    });

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
    const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    const emailHtml = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f4fbfc">
        <div style="background:#0d4f52;padding:16px 24px;border-radius:12px 12px 0 0">
          <h2 style="color:white;margin:0;font-size:16px">📡 大手町発マーケットトレンド</h2>
          <p style="color:#a0d4d6;margin:4px 0 0;font-size:12px">注目ニュース自動レポート｜${now}</p>
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
            情報源: PR TIMES / ロイター日本語版 / 東洋経済オンライン / みんかぶ<br/>
            © 大手町調査室九課 自動マーケットレポート
          </p>
        </div>
      </div>
    `;

    await resend.emails.send({
      from: "大手町マーケットレポート <noreply@finance-tower.com>",
      to: ADMIN_EMAIL,
      subject: `【大手町トレンド】注目ニュース ${featuredItems.length}選｜${now}`,
      html: emailHtml,
    });
  }

  return NextResponse.json({
    success: true,
    total: inserts.length,
    featured: featuredItems.length,
    fetched_at: new Date().toISOString(),
  });
}