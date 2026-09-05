import { createClient } from "@supabase/supabase-js";

export default async function sitemap() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: companies } = await supabase
    .from("ipo_companies")
    .select("id, ticker, listing_date")
    .order("listing_date", { ascending: false });

  // 2026/9/5追加: トレンド記事の個別ページ(/trends/[id])を新設したことに伴い、
  // 通常のサイトマップにも掲載する(直近2日以内だけを載せるnews-sitemap.xmlとは別に、
  // こちらは全期間の記事を対象にする。生成後に中身が変わることは無いためmonthly扱い)。
  const { data: trendArticles } = await supabase
    .from("market_trends")
    .select("id, fetched_at")
    .eq("is_theme_article", true)
    .order("fetched_at", { ascending: false });

  const baseUrl = "https://ipo.finance-tower.com";

  // 2026/9/5追加: /trends・/plans・/ipo-guideがサイトマップに一件も含まれていなかった
  // 不具合を修正。特に/trendsは1日3回更新される主要ページのため、changeFrequencyを
  // hourlyにしてクロール頻度を上げるよう促す。
  const staticPages = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "daily" as const, priority: 1.0 },
    { url: `${baseUrl}/trends`, lastModified: new Date(), changeFrequency: "hourly" as const, priority: 0.9 },
    { url: `${baseUrl}/plans`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.7 },
    { url: `${baseUrl}/ipo-guide`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.7 },
    { url: `${baseUrl}/guide`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.8 },
    { url: `${baseUrl}/contact`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.5 },
    { url: `${baseUrl}/tokushoho`, lastModified: new Date(), changeFrequency: "yearly" as const, priority: 0.3 },
    { url: `${baseUrl}/privacy`, lastModified: new Date(), changeFrequency: "yearly" as const, priority: 0.3 },
  ];

  const companyPages = (companies ?? []).map(c => ({
    url: `${baseUrl}/analysis/${(c as any).ticker ?? c.id}`,
    lastModified: new Date(c.listing_date ?? new Date()),
    changeFrequency: "weekly" as const,
    priority: 0.9,
  }));

  const trendArticlePages = (trendArticles ?? []).map(a => ({
    url: `${baseUrl}/trends/${a.id}`,
    lastModified: new Date(a.fetched_at ?? new Date()),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [...staticPages, ...companyPages, ...trendArticlePages];
}