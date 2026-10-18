import { createClient } from "@supabase/supabase-js";

export default async function sitemap() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 2026/10/18改修(SEO対応): 分析がまだ無い銘柄のページは中身が薄い(検索結果にも出さない設定)ため、
  // サイトマップには分析のある銘柄だけを載せる。更新日は、実際に情報を更新した時刻(updated_at)を使う。
  const { data: companies } = await supabase
    .from("ipo_companies")
    .select("id, ticker, listing_date, updated_at")
    .or("analysis_summary.not.is.null,analysis_detail.not.is.null")
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
    // 2026/9/14追加: E-E-A-T対策として新設した「運営者について・分析手法について」ページ
    { url: `${baseUrl}/about`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.7 },
    // 2026/9/14追加: 「9軸分析メソッド」専用ページ(AI生成コンテンツの差別化要素強化)
    { url: `${baseUrl}/methodology`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.7 },
    { url: `${baseUrl}/guide`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.8 },
    // 2026/10/18追加(SEO・GEO対応): 検索されやすいテーマの新ページ。登録データから自動で更新される。
    { url: `${baseUrl}/schedule`, lastModified: new Date(), changeFrequency: "daily" as const, priority: 0.9 },
    { url: `${baseUrl}/results`, lastModified: new Date(), changeFrequency: "daily" as const, priority: 0.8 },
    { url: `${baseUrl}/lockup`, lastModified: new Date(), changeFrequency: "daily" as const, priority: 0.8 },
    { url: `${baseUrl}/how-to-apply`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.8 },
    { url: `${baseUrl}/glossary`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.7 },
    { url: `${baseUrl}/contact`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.5 },
    { url: `${baseUrl}/tokushoho`, lastModified: new Date(), changeFrequency: "yearly" as const, priority: 0.3 },
    { url: `${baseUrl}/privacy`, lastModified: new Date(), changeFrequency: "yearly" as const, priority: 0.3 },
    { url: `${baseUrl}/terms`, lastModified: new Date(), changeFrequency: "yearly" as const, priority: 0.3 },
  ];

  const companyPages = (companies ?? []).map(c => ({
    url: `${baseUrl}/analysis/${(c as any).ticker ?? c.id}`,
    lastModified: new Date((c as any).updated_at ?? c.listing_date ?? new Date()),
    changeFrequency: "weekly" as const,
    priority: 0.9,
  }));

  // 2026/10/18変更(SEO対応): 初心者向け分析ページ(/analysis/[id]/beginner)は、通常版と同じ銘柄・
  // 同じ数字を別の言い回しで見せるページのため、検索エンジンには通常版を正規URL(canonical)として
  // 伝えている。重複を避けるため、サイトマップからは外した(ページ自体は従来どおり利用できる)。

  const trendArticlePages = (trendArticles ?? []).map(a => ({
    url: `${baseUrl}/trends/${a.id}`,
    lastModified: new Date(a.fetched_at ?? new Date()),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [...staticPages, ...companyPages, ...trendArticlePages];
}