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
  url: string;
}

export async function fetchAllHeadlines(): Promise<FeedHeadline[]> {
  // 以前は4つのフィードを1つずつ順番に取得しており、1件あたり最大10秒の設定と
  // 合わせると、遅いフィードが重なった場合に最大40秒近くかかることがあった。
  // これがgenerate-x-draftsルート全体のタイムアウトの一因になっていたため、
  // 互いに独立したフィード取得は並行で行い、一番遅い1件分(最大10秒)に近づける。
  const perSourceResults = await Promise.allSettled(
    RSS_SOURCES.map(async (source) => {
      const feed = await parser.parseURL(source.url);
      return feed.items.slice(0, 15).map((item) => ({
        source: source.name,
        title: item.title ?? "",
        summary: (item.contentSnippet ?? item.content ?? "").slice(0, 300),
        pubDate: item.pubDate ?? "",
        url: item.link ?? "",
      }));
    })
  );

  const results: FeedHeadline[] = [];
  perSourceResults.forEach((r, i) => {
    if (r.status === "fulfilled") {
      results.push(...r.value);
    } else {
      console.error(`RSS取得失敗: ${RSS_SOURCES[i].name}`, r.reason);
      // 1つのフィードが失敗しても他は続行する
    }
  });

  return results;
}