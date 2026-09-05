import { createClient } from "@supabase/supabase-js";

// 2026/9/5新設: Googleニュース向けの専用サイトマップ。通常のsitemap.ts(標準サイトマップ)
// とは別に、news:news拡張形式のXMLで返す必要があるため、next-sitemapのMetadata規約
// (sitemap.ts)ではなく、この独立したルートハンドラで実装している。
// Google Newsサイトマップの仕様上、直近2日以内に公開した記事のみを載せるのが正しい運用
// (それより古い記事は通常のsitemap.tsの側でカバーする)。
export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

  const { data: articles } = await supabase
    .from("market_trends")
    .select("id, title, fetched_at")
    .eq("is_theme_article", true)
    .gte("fetched_at", twoDaysAgo)
    .order("fetched_at", { ascending: false });

  const escapeXml = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const urlEntries = (articles ?? [])
    .map((a) => {
      const loc = `https://ipo.finance-tower.com/trends/${a.id}`;
      return `  <url>
    <loc>${loc}</loc>
    <news:news>
      <news:publication>
        <news:name>大手町調査室九課</news:name>
        <news:language>ja</news:language>
      </news:publication>
      <news:publication_date>${a.fetched_at}</news:publication_date>
      <news:title>${escapeXml(a.title)}</news:title>
    </news:news>
  </url>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urlEntries}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=UTF-8" },
  });
}
