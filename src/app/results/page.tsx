import type { Metadata } from "next";
import { getCompanies, type CompanyListItem } from "@/lib/get-companies";
import { todayJst, shortDate, yen, pctText, companySlug } from "@/lib/jp-format";
import { Page, Crumbs, H1, Lead, Card, H2, P, Table, RelatedLinks, Disclaimer, JsonLd, C } from "@/components/PageParts";

// 2026/10/18新設(SEO・GEO対応): 「IPO 初値 結果 一覧」「公募割れ」などで検索する人向けに、
// 当サイトに登録された上場済み銘柄の公募価格・初値・公募価格比を一覧にする。登録データから自動で作る。
export const revalidate = 1800;

const BASE = "https://ipo.finance-tower.com";
const hasAnalysis = (c: CompanyListItem) => !!c.ai_summary || c.ai_score != null;

function rate(c: CompanyListItem): number | null {
  if (c.price_change_rate != null && Number.isFinite(Number(c.price_change_rate))) return Number(c.price_change_rate);
  if (c.ipo_price && c.initial_price) return Math.round(((c.initial_price - c.ipo_price) / c.ipo_price) * 1000) / 10;
  return null;
}

async function load() {
  let rows: CompanyListItem[] = [];
  try { rows = await getCompanies(); } catch { rows = []; }
  const today = todayJst();
  const done = rows
    .filter((r) => r.listing_date && r.listing_date < today && r.initial_price && r.ipo_price)
    .sort((a, b) => b.listing_date.localeCompare(a.listing_date));
  const rates = done.map((c) => rate(c)).filter((v): v is number => v != null);
  const n = rates.length;
  const below = rates.filter((v) => v < 0).length;
  const avg = n ? Math.round((rates.reduce((a, b) => a + b, 0) / n) * 10) / 10 : null;
  const sorted = [...rates].sort((a, b) => a - b);
  const med = n ? (n % 2 ? sorted[(n - 1) / 2] : Math.round(((sorted[n / 2 - 1] + sorted[n / 2]) / 2) * 10) / 10) : null;
  return { today, done, n, below, avg, med };
}

export async function generateMetadata(): Promise<Metadata> {
  const { n, below, avg } = await load();
  const title = "IPOの初値の結果一覧｜公募価格との比較・公募割れ｜大手町調査室九課";
  const description = n
    ? `当サイトに登録された上場済みIPO${n}社の、公募価格・初値・公募価格比を一覧で掲載。公募割れは${below}社、初値の騰落率の平均は${pctText(avg)}です（登録銘柄の集計）。`
    : "上場済みIPOの公募価格・初値・公募価格比を一覧で掲載します。";
  return {
    title, description,
    openGraph: { title, description, url: `${BASE}/results`, siteName: "大手町調査室九課", locale: "ja_JP", type: "website", images: [{ url: `${BASE}/ogp.png`, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [`${BASE}/ogp.png`] },
    alternates: { canonical: `${BASE}/results` },
  };
}

export default async function ResultsPage() {
  const { done, n, below, avg, med } = await load();
  const breadcrumb = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "トップ", item: BASE },
      { "@type": "ListItem", position: 2, name: "IPOの初値の結果一覧", item: `${BASE}/results` },
    ],
  };
  return (
    <Page>
      <JsonLd data={breadcrumb} />
      <Crumbs items={[{ label: "トップ", href: "/" }, { label: "初値の結果一覧" }]} />
      <H1>IPOの初値の結果一覧｜公募価格との比較</H1>
      <Lead>当サイトに登録された上場済みのIPOについて、公募価格・初値・公募価格比を新しい順にまとめました。これからのIPOを考えるときの、過去の値動きの参考にしてください。</Lead>

      {n > 0 && (
        <Card>
          <H2>登録銘柄の集計（{n}社）</H2>
          <Table
            minWidth={420}
            head={["項目", "結果"]}
            rows={[
              ["公募価格を下回って始まった銘柄（公募割れ）", `${below}社（${Math.round((below / n) * 100)}%）`],
              ["初値の公募価格比の平均", pctText(avg) || "-"],
              ["初値の公募価格比の中央値", pctText(med) || "-"],
            ]}
          />
          <P>※ 当サイトに登録された銘柄だけの集計です。市場全体の統計ではありません。平均値は大きく上がった銘柄の影響を受けやすいため、中央値もあわせて載せています。</P>
        </Card>
      )}

      <Card>
        <H2>上場済みIPOの初値一覧</H2>
        {n === 0 ? (
          <P>初値が確定した銘柄が登録され次第、ここに表示します。</P>
        ) : (
          <Table
            minWidth={640}
            head={["上場日", "銘柄", "市場", "公募価格", "初値", "公募価格比"]}
            rows={done.map((c) => {
              const r = rate(c);
              const label = (<><strong>{c.name}</strong>{c.ticker ? <span style={{ color: "#64748b" }}>（{c.ticker}）</span> : null}</>);
              return [
                <span key="d" style={{ whiteSpace: "nowrap" }}>{c.listing_date.replace(/-/g, "/")}</span>,
                hasAnalysis(c) ? <a key="n" href={`/analysis/${companySlug(c)}`} style={{ color: C.nav, textDecoration: "underline" }}>{label}</a> : <span key="n">{label}</span>,
                c.exchange || "-",
                yen(c.ipo_price) || "-",
                yen(c.initial_price) || "-",
                <span key="r" style={{ color: r != null && r < 0 ? "#b91c1c" : "#15803d", fontWeight: 700, whiteSpace: "nowrap" }}>{pctText(r) || "-"}</span>,
              ];
            })}
          />
        )}
      </Card>

      <Card>
        <H2>初値の結果の見方</H2>
        <P>「公募価格比」は、初値が公募価格より何%高かったか（低かったか）を表します。マイナスなら公募価格を下回った「公募割れ」です。初値は上場日に最初についた価格で、その後の株価とは異なります。</P>
        <P>用語の意味は<a href="/glossary" style={{ color: C.nav, fontWeight: 700 }}>IPO用語集</a>で、申込の流れは<a href="/how-to-apply" style={{ color: C.nav, fontWeight: 700 }}>IPOの申込方法</a>で説明しています。これからの上場日は<a href="/schedule" style={{ color: C.nav, fontWeight: 700 }}>上場スケジュール一覧表</a>で確認できます。</P>
        <Disclaimer />
      </Card>

      <RelatedLinks current="/results" />
    </Page>
  );
}
