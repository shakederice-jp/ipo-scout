import type { Metadata } from "next";
import { TERM_GROUPS, ALL_TERMS } from "@/lib/ipo-terms";
import { Page, Crumbs, H1, Lead, Card, H2, RelatedLinks, Disclaimer, JsonLd, C } from "@/components/PageParts";

// 2026/10/18新設(SEO・GEO対応): 「ロックアップとは」「ブックビルディングとは」「仮条件とは」など、
// IPOで検索される用語の解説ページ。固定文(src/lib/ipo-terms.ts)なので、表現がぶれない。
export const dynamic = "force-static";

const BASE = "https://ipo.finance-tower.com";

export const metadata: Metadata = {
  title: "IPO用語集｜ブックビルディング・仮条件・ロックアップなどの意味｜大手町調査室九課",
  description: "IPOでよく出る用語を、やさしく解説。ブックビルディング・仮条件・公募価格・初値・公募割れ・ロックアップ・主幹事・オーバーアロットメントなど、申込から上場後までの言葉を一覧にしました。",
  openGraph: {
    title: "IPO用語集｜ブックビルディング・仮条件・ロックアップなどの意味",
    description: "IPOでよく出る用語を、申込から上場後まで順にやさしく解説します。",
    url: `${BASE}/glossary`, siteName: "大手町調査室九課", locale: "ja_JP", type: "website",
    images: [{ url: `${BASE}/ogp.png`, width: 1200, height: 630 }],
  },
  alternates: { canonical: `${BASE}/glossary` },
};

export default function GlossaryPage() {
  const setLd = {
    "@context": "https://schema.org", "@type": "DefinedTermSet",
    name: "IPO用語集", url: `${BASE}/glossary`, inLanguage: "ja",
    hasDefinedTerm: ALL_TERMS.map((t) => ({ "@type": "DefinedTerm", name: t.term, description: t.def, url: `${BASE}/glossary#${t.id}`, inDefinedTermSet: `${BASE}/glossary` })),
  };
  const breadcrumb = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "トップ", item: BASE },
      { "@type": "ListItem", position: 2, name: "IPO用語集", item: `${BASE}/glossary` },
    ],
  };
  const byId = new Map(ALL_TERMS.map((t) => [t.id, t]));
  return (
    <Page>
      <JsonLd data={setLd} />
      <JsonLd data={breadcrumb} />
      <Crumbs items={[{ label: "トップ", href: "/" }, { label: "IPO用語集" }]} />
      <H1>IPO用語集｜申込から上場後までの言葉をやさしく解説</H1>
      <Lead>ブックビルディング・仮条件・ロックアップなど、IPOで出てくる言葉を{ALL_TERMS.length}語まとめました。申込から上場後までの順に並べています。</Lead>

      <Card>
        <H2>用語の一覧</H2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {TERM_GROUPS.map((g) => (
            <div key={g.title}>
              <div style={{ fontSize: 12, fontWeight: 900, color: C.mid, marginBottom: 4 }}>{g.title}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {g.terms.map((t) => (
                  <a key={t.id} href={`#${t.id}`} style={{ fontSize: 11, color: C.nav, textDecoration: "none", padding: "4px 10px", borderRadius: 14, border: `1px solid ${C.border}`, backgroundColor: C.soft }}>{t.term}</a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {TERM_GROUPS.map((g) => (
        <Card key={g.title}>
          <H2>{g.title}</H2>
          <dl style={{ margin: 0 }}>
            {g.terms.map((t) => (
              <div key={t.id} id={t.id} style={{ marginBottom: 16, scrollMarginTop: 60 }}>
                <dt style={{ fontSize: 14, fontWeight: 900, color: C.nav, margin: "0 0 4px" }}>
                  {t.term}{t.reading ? <span style={{ fontSize: 10, fontWeight: 500, color: "#94a3b8", marginLeft: 6 }}>（{t.reading}）</span> : null}
                </dt>
                <dd style={{ fontSize: 13, color: "#334155", lineHeight: 1.9, margin: 0 }}>
                  {t.def}
                  {t.related && t.related.length > 0 && (
                    <span style={{ display: "block", fontSize: 11, marginTop: 4 }}>
                      関連：{t.related.map((r, i) => byId.get(r) ? (
                        <span key={r}>{i > 0 ? "、" : ""}<a href={`#${r}`} style={{ color: C.nav }}>{byId.get(r)!.term}</a></span>
                      ) : null)}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      ))}

      <Card>
        <P2 />
        <Disclaimer />
      </Card>
      <RelatedLinks current="/glossary" />
    </Page>
  );
}

function P2() {
  return (
    <p style={{ fontSize: 13, color: "#334155", lineHeight: 1.9, margin: 0 }}>
      制度や慣行は変わることがあります。申込の前には、<a href="/how-to-apply" style={{ color: C.nav, fontWeight: 700 }}>IPOの申込方法</a>のページと各証券会社の最新の案内もあわせて確認してください。
    </p>
  );
}
