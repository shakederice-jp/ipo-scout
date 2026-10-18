import type { Metadata } from "next";
import { getCompanies, type CompanyListItem } from "@/lib/get-companies";
import { todayJst, jpDate, shortDate, yen, pctText, companySlug } from "@/lib/jp-format";
import { Page, Crumbs, H1, Lead, Card, H2, P, Table, RelatedLinks, Disclaimer, JsonLd, C } from "@/components/PageParts";

// 2026/10/18新設(SEO・GEO対応): 「IPO ロックアップ解除 一覧」「ロックアップ 解除日」で検索する人向け。
// 登録されたロックアップ解除日(90日・180日)から、これから解除を迎える銘柄を日付順に自動で並べる。
export const revalidate = 1800;

const BASE = "https://ipo.finance-tower.com";
const hasAnalysis = (c: CompanyListItem) => !!c.ai_summary || c.ai_score != null;

type Row = { date: string; kind: string; c: CompanyListItem };

function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400000);
}

async function load() {
  let rows: CompanyListItem[] = [];
  try { rows = await getCompanies(); } catch { rows = []; }
  const today = todayJst();
  const list: Row[] = [];
  for (const c of rows) {
    if (c.lockup_90_date) list.push({ date: c.lockup_90_date, kind: "90日", c });
    if (c.lockup_180_date) list.push({ date: c.lockup_180_date, kind: "180日", c });
  }
  const upcoming = list.filter((r) => r.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = list.filter((r) => r.date < today && r.date >= addDays(today, -30)).sort((a, b) => b.date.localeCompare(a.date));
  return { today, upcoming, past };
}

export async function generateMetadata(): Promise<Metadata> {
  const { upcoming } = await load();
  const title = "IPOロックアップ解除の予定一覧｜90日・180日の解除日｜大手町調査室九課";
  const description = upcoming.length
    ? `IPOのロックアップ解除日を日付順に一覧で掲載。これから解除を迎える${upcoming.length}件の、銘柄・解除日・上場日・公募価格を確認できます。ロックアップの意味と見方も解説します。`
    : "IPOのロックアップ解除日を日付順に一覧で掲載。ロックアップの意味と見方も解説します。";
  return {
    title, description,
    openGraph: { title, description, url: `${BASE}/lockup`, siteName: "大手町調査室九課", locale: "ja_JP", type: "website", images: [{ url: `${BASE}/ogp.png`, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [`${BASE}/ogp.png`] },
    alternates: { canonical: `${BASE}/lockup` },
  };
}

const LOCKUP_FAQ = [
  { q: "ロックアップとは何ですか？", a: "上場後の一定期間に、大株主・ベンチャーキャピタル・役員などが持ち株を売らないと約束する取り決めです。上場直後に大量の売りが出るのを防ぐ目的があります。" },
  { q: "ロックアップの期間は何日ですか？", a: "銘柄ごとに異なります。90日や180日がよく見られますが、株主ごとに期間が違う銘柄もあります。正確な期間は、その銘柄の目論見書で確認できます。" },
  { q: "ロックアップが解除されると、株価は下がりますか？", a: "解除されても、すぐに売りが増えるとは限りません。大株主が売るかどうかは、株価の水準や会社の状況によって変わります。解除日の前後は需給が変わりやすい時期と考えられているため、注目されます。" },
  { q: "解除日より前にロックアップが外れることはありますか？", a: "株価が公募価格の1.5倍以上になった場合など、一定の条件を満たすと期間の途中で解除される取り決めが付く銘柄があります。条件の有無は目論見書で確認できます。" },
];

export default async function LockupPage() {
  const { today, upcoming, past } = await load();
  const breadcrumb = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "トップ", item: BASE },
      { "@type": "ListItem", position: 2, name: "ロックアップ解除予定", item: `${BASE}/lockup` },
    ],
  };
  const faqLd = {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: LOCKUP_FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  const mk = (r: Row) => {
    const label = (<><strong>{r.c.name}</strong>{r.c.ticker ? <span style={{ color: "#64748b" }}>（{r.c.ticker}）</span> : null}</>);
    return hasAnalysis(r.c) ? <a key="n" href={`/analysis/${companySlug(r.c)}`} style={{ color: C.nav, textDecoration: "underline" }}>{label}</a> : <span key="n">{label}</span>;
  };
  return (
    <Page>
      <JsonLd data={breadcrumb} />
      <JsonLd data={faqLd} />
      <Crumbs items={[{ label: "トップ", href: "/" }, { label: "ロックアップ解除予定" }]} />
      <H1>IPOロックアップ解除の予定一覧</H1>
      <Lead>上場後の一定期間、大株主などが株を売れない「ロックアップ」。この期間が終わる解除日を、日付の近い順にまとめました。（{jpDate(today)}時点）</Lead>

      <Card>
        <H2>これから解除を迎える銘柄{upcoming.length ? `（${upcoming.length}件）` : ""}</H2>
        {upcoming.length === 0 ? (
          <P>解除日が登録された銘柄が追加され次第、ここに表示します。</P>
        ) : (
          <Table
            minWidth={620}
            head={["解除日", "あと", "区分", "銘柄", "上場日", "公募価格", "初値"]}
            rows={upcoming.map((r) => [
              <span key="d" style={{ whiteSpace: "nowrap" }}>{shortDate(r.date)}</span>,
              <span key="a" style={{ whiteSpace: "nowrap" }}>{daysBetween(today, r.date) === 0 ? "本日" : `${daysBetween(today, r.date)}日`}</span>,
              `${r.kind}`,
              mk(r),
              <span key="l" style={{ whiteSpace: "nowrap" }}>{shortDate(r.c.listing_date)}</span>,
              yen(r.c.ipo_price) || "-",
              r.c.initial_price ? `${yen(r.c.initial_price)}${r.c.price_change_rate != null ? `（${pctText(r.c.price_change_rate)}）` : ""}` : "-",
            ])}
          />
        )}
        <P>※ 区分の「90日」「180日」は、上場日から数えた日数です。株主ごとに期間や条件が異なる場合があるため、正確な内容は各銘柄の目論見書で確認してください。</P>
      </Card>

      {past.length > 0 && (
        <Card>
          <H2>最近解除された銘柄（直近30日）</H2>
          <Table
            minWidth={520}
            head={["解除日", "区分", "銘柄", "上場日", "公募価格"]}
            rows={past.map((r) => [
              <span key="d" style={{ whiteSpace: "nowrap" }}>{shortDate(r.date)}</span>,
              r.kind,
              mk(r),
              <span key="l" style={{ whiteSpace: "nowrap" }}>{shortDate(r.c.listing_date)}</span>,
              yen(r.c.ipo_price) || "-",
            ])}
          />
        </Card>
      )}

      <Card>
        <H2>ロックアップのよくある質問</H2>
        {LOCKUP_FAQ.map((f, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <h3 style={{ fontSize: 13, fontWeight: 900, color: C.nav, margin: "0 0 4px" }}>{f.q}</h3>
            <p style={{ fontSize: 12, color: "#334155", lineHeight: 1.8, margin: 0 }}>{f.a}</p>
          </div>
        ))}
        <P>ほかの用語は<a href="/glossary" style={{ color: C.nav, fontWeight: 700 }}>IPO用語集</a>で説明しています。</P>
        <Disclaimer />
      </Card>

      <RelatedLinks current="/lockup" />
    </Page>
  );
}
