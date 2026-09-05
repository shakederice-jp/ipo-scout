import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import Link from "next/link";

// 2026/9/5新設: Googleニュース向けサイトマップを実現するには、記事ごとに固有のURLが
// 必要(Googleニュースサイトマップの仕様上、1URLにつき1記事)。これまでトレンドの
// 「テーマ記事」(is_theme_article=true。新規IPO紹介・初値の値動き・投資ワンポイント講座等)
// はすべて/trendsの1ページに一覧表示されるだけで、記事ごとの個別ページが存在しなかった。
// このページはその個別ページ。/trendsの一覧はそのまま残し、あわせて個別記事にも
// アクセスできるようにする(一覧・個別ページの両立は一般的なブログの構成と同じ考え方)。

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function fetchArticle(id: string) {
  const { data } = await supabase
    .from("market_trends")
    .select("*")
    .eq("id", id)
    .eq("is_theme_article", true)
    .maybeSingle();
  return data;
}

// /trends側の表示と同じく、本文中のCTA文言・裸のURLをリンクに変換する
// (保存データ自体はプレーンテキストのまま。X投稿へのコピペ用途を壊さないため)
const TRENDS_CTA_PHRASE = "続きは大手町調査室９課公式HPで読む";
function renderContent(content: string): React.ReactNode {
  const urlRegex = /https?:\/\/\S+/g;
  const firstUrlMatch = content.match(urlRegex);
  const primaryUrl = firstUrlMatch ? firstUrlMatch[0] : null;
  if (!primaryUrl) return content;

  const linkStyle: React.CSSProperties = { color: "#0d4f52", fontWeight: 700, textDecoration: "underline", wordBreak: "break-all" };
  const parts: React.ReactNode[] = [];
  let remaining = content;
  let key = 0;

  const ctaIndex = remaining.indexOf(TRENDS_CTA_PHRASE);
  if (ctaIndex !== -1) {
    parts.push(remaining.slice(0, ctaIndex));
    parts.push(
      <a key={`cta-${key++}`} href={primaryUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>
        {TRENDS_CTA_PHRASE}
      </a>
    );
    remaining = remaining.slice(ctaIndex + TRENDS_CTA_PHRASE.length);
  }

  let lastIndex = 0;
  let m: RegExpExecArray | null;
  urlRegex.lastIndex = 0;
  while ((m = urlRegex.exec(remaining)) !== null) {
    parts.push(remaining.slice(lastIndex, m.index));
    parts.push(
      <a key={`url-${key++}`} href={m[0]} target="_blank" rel="noopener noreferrer" style={linkStyle}>
        {m[0]}
      </a>
    );
    lastIndex = m.index + m[0].length;
  }
  parts.push(remaining.slice(lastIndex));

  return parts;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = await fetchArticle(id);
  if (!article) return { title: "記事が見つかりません" };

  const description = (article.content as string).replace(/\s+/g, " ").trim().slice(0, 140);
  const url = `https://ipo.finance-tower.com/trends/${id}`;
  const image = article.image_url || "https://ipo.finance-tower.com/ogp.png";

  return {
    title: article.title,
    description,
    openGraph: {
      title: article.title,
      description,
      url,
      siteName: "大手町調査室九課",
      locale: "ja_JP",
      type: "article",
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description,
      images: [image],
    },
    alternates: { canonical: url },
  };
}

export default async function TrendArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = await fetchArticle(id);
  if (!article) notFound();

  const url = `https://ipo.finance-tower.com/trends/${id}`;
  const image = article.image_url || "https://ipo.finance-tower.com/ogp.png";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    image: [image],
    datePublished: article.fetched_at,
    dateModified: article.fetched_at,
    publisher: {
      "@type": "Organization",
      name: "大手町調査室九課",
      url: "https://ipo.finance-tower.com",
      logo: { "@type": "ImageObject", url: "https://ipo.finance-tower.com/ogp.png" },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f4fbfc" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 16px 60px" }}>
        <Link href="/trends" style={{ fontSize: 12, color: "#66c3c6", textDecoration: "none" }}>
          ← マーケットトレンド一覧に戻る
        </Link>

        <div style={{ background: "white", borderRadius: 12, padding: 24, marginTop: 16,
          border: "1px solid #66c3c6", boxShadow: "0 2px 8px rgba(102,195,198,0.15)" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, marginBottom: 12, alignItems: "center" }}>
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, backgroundColor: "#f0fdf4", color: "#15803d", fontWeight: 700 }}>
              {article.sector || "IPO"}
            </span>
            <span style={{ fontSize: 10, color: "#94a3b8" }}>
              {new Date(article.fetched_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric" })}
            </span>
          </div>

          <h1 style={{ fontSize: 20, fontWeight: 900, color: "#082b2e", margin: "0 0 16px", lineHeight: 1.5 }}>
            {article.title}
          </h1>

          {article.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={article.image_url} alt={article.title} style={{ width: "100%", maxWidth: 360, borderRadius: 12, marginBottom: 16, display: "block" }} />
          )}

          <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.9, margin: "0 0 16px", whiteSpace: "pre-wrap" }}>
            {renderContent(article.content)}
          </p>

          {Array.isArray(article.source_links) && article.source_links.length > 0 && (
            <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#2a7a7e", marginBottom: 6 }}>🔗 情報源</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {article.source_links.map((link: any, i: number) => (
                  link.url ? (
                    <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, color: "#66c3c6", textDecoration: "none" }}>
                      ・[{link.source}] {link.title}
                    </a>
                  ) : (
                    <span key={i} style={{ fontSize: 11, color: "#94a3b8" }}>
                      ・[{link.source}] {link.title}
                    </span>
                  )
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ marginTop: 24 }}>
          <Link href="/" style={{ fontSize: 12, color: "#66c3c6", textDecoration: "none" }}>
            ← IPO分析レポートトップに戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
