import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CATEGORIES = [
  {
    key: "ipo",
    label: "🚀 IPOニュース",
    query: "新規上場 IPO",
  },
  {
    key: "japan_stock",
    label: "🇯🇵 日本株・市況",
    query: "日経平均 グロース市場 株式相場",
  },
  {
    key: "us_stock",
    label: "🇺🇸 米国株・マクロ経済",
    query: "ナスダック S&P500 米国株",
  },
  {
    key: "startup",
    label: "🏢 スタートアップ・ベンチャー",
    query: "スタートアップ 資金調達 ベンチャー",
  },
  {
    key: "forex",
    label: "💹 為替・金融政策",
    query: "円ドル 日銀 FRB 金融政策",
  },
];

async function fetchGoogleNewsRSS(query: string): Promise<{ title: string; url: string; source: string; published_at: string }[]> {
  const encoded = encodeURIComponent(query);
  const url = `https://news.google.com/rss/search?q=${encoded}&hl=ja&gl=JP&ceid=JP:ja`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: { title: string; url: string; source: string; published_at: string }[] = [];
    const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
    for (const match of itemMatches) {
      const block = match[1];
      const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
        ?? block.match(/<title>(.*?)<\/title>/)?.[1] ?? "";
      const link = block.match(/<link>(.*?)<\/link>/)?.[1]
        ?? block.match(/<guid[^>]*>(.*?)<\/guid>/)?.[1] ?? "";
      const source = block.match(/<source[^>]*>(.*?)<\/source>/)?.[1] ?? "";
      const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? "";
      if (title && link) {
        items.push({
          title: title.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim(),
          url: link.trim(),
          source: source.trim(),
          published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        });
      }
      if (items.length >= 10) break;
    }
    return items;
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const results: string[] = [];

  for (const cat of CATEGORIES) {
    try {
      const items = await fetchGoogleNewsRSS(cat.query);
      if (items.length === 0) {
        results.push(`⚠️ ${cat.label}: 取得0件`);
        continue;
      }
      // 既存データを削除して新しいデータで上書き
      await supabase.from("news_cache").delete().eq("category", cat.key);
      const { error } = await supabase.from("news_cache").insert(
        items.map(item => ({
          category: cat.key,
          title: item.title,
          url: item.url,
          source: item.source,
          published_at: item.published_at,
        }))
      );
      if (error) {
        results.push(`❌ ${cat.label}: 保存エラー - ${error.message}`);
      } else {
        results.push(`✅ ${cat.label}: ${items.length}件取得・保存`);
      }
    } catch (e) {
      results.push(`❌ ${cat.label}: ${String(e)}`);
    }
  }

  return NextResponse.json({ success: true, results, fetched_at: new Date().toISOString() });
}