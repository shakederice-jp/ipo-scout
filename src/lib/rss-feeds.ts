import Parser from "rss-parser";

const parser = new Parser({
  timeout: 10000,
});

export const RSS_SOURCES = [
  { name: "Bloomberg Business", url: "https://feeds.bloomberg.com/business/news.rss" },
  { name: "Bloomberg Markets", url: "https://feeds.bloomberg.com/markets/news.rss" },
  { name: "Bloomberg Technology", url: "https://feeds.bloomberg.com/technology/news.rss" },
  { name: "Yahoo Finance", url: "https://finance.yahoo.com/news/rss" },
];

export interface FeedHeadline {
  source: string;
  title: string;
  summary: string;
  pubDate: string;
}

export async function fetchAllHeadlines(): Promise<FeedHeadline[]> {
  const results: FeedHeadline[] = [];

  for (const source of RSS_SOURCES) {
    try {
      const feed = await parser.parseURL(source.url);
      for (const item of feed.items.slice(0, 15)) {
        results.push({
          source: source.name,
          title: item.title ?? "",
          summary: (item.contentSnippet ?? item.content ?? "").slice(0, 300),
          pubDate: item.pubDate ?? "",
        });
      }
    } catch (err) {
      console.error(`RSS取得失敗: ${source.name}`, err);
      // 1つのフィードが失敗しても他は続行する
    }
  }

  return results;
}