import type { Metadata } from "next";
import { getCompanies, type CompanyListItem } from "@/lib/get-companies";
import { todayJst, jpDate, shortDate, priceRangeText, yen, pctText, companySlug } from "@/lib/jp-format";
import { Page, Crumbs, H1, Lead, Card, H2, P, Table, RelatedLinks, Disclaimer, JsonLd, C } from "@/components/PageParts";
import WeeklyBriefSignup from "@/components/WeeklyBriefSignup";
import TrendsLinkCard from "@/components/TrendsLinkCard";

// 2026/10/18新設(SEO・GEO対応): 「IPO スケジュール 2026」などで検索する人向けの一覧表ページ。
// 登録済みの銘柄から自動で作る(銘柄の追加・上場日の更新は、30分以内に手作業なしで反映される)。
export const revalidate = 1800;

const BASE = "https://ipo.finance-tower.com";

function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
function monthLabel(key: string): string {
  const [y, m] = key.split("-"); return `${y}年${Number(m)}月`;
}
const hasAnalysis = (c: CompanyListItem) => !!c.ai_summary || c.ai_score != null;

async function load() {
  let rows: CompanyListItem[] = [];
  try { rows = await getCompanies(); } catch { rows = []; }
  const today = todayJst();
  const upcoming = rows.filter((r) => r.listing_date && r.listing_date >= today).sort((a, b) => a.listing_date.localeCompare(b.listing_date));
  const from = addDays(today, -60);
  const recent = rows.filter((r) => r.listing_date && r.listing_date < today && r.listing_date >= from).sort((a, b) => b.listing_date.localeCompare(a.listing_date));
  return { today, upcoming, recent };
}

export async function generateMetadata(): Promise<Metadata> {
  const { today, upcoming } = await load();
  const year = today.slice(0, 4);
  const months = Array.from(new Set(upcoming.map((r) => r.listing_date.slice(0, 7)))).slice(0, 2).map(monthLabel);
  const title = `IPOスケジュール${year}｜新規上場の一覧表（上場日・仮条件・申込日程）｜大手町調査室九課`;
  const description = upcoming.length
    ? `${year}年のIPOスケジュールを一覧表で掲載。${months.join("・")}に上場予定の${upcoming.length}社の、上場日・仮条件・ブックビルディング・申込開始日を確認できます。目論見書をAIが解析した分析レポートへもリンクします。`
    : `${year}年のIPOスケジュールを一覧表で掲載。上場日・仮条件・ブックビルディング・申込開始日を確認できます。`;
  return {
    title, description,
    openGraph: { title, description, url: `${BASE}/schedule`, siteName: "大手町調査室九課", locale: "ja_JP", type: "website", images: [{ url: `${BASE}/ogp.png`, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [`${BASE}/ogp.png`] },
    alternates: { canonical: `${BASE}/schedule` },
  };
}

function NameCell({ c }: { c: CompanyListItem }) {
  const label = (
    <>
      <strong>{c.name}</strong>
      {c.ticker ? <span style={{ color: "#64748b" }}>（{c.ticker}）</span> : null}
    </>
  );
  return hasAnalysis(c)
    ? <a href={`/analysis/${companySlug(c)}`} style={{ color: C.nav, textDecoration: "underline" }}>{label}</a>
    : <span>{label}</span>;
}

const SCHEDULE_FAQ = [
  { q: "IPOは、どのような順番で進みますか？", a: "多くの場合、上場承認・仮条件の決定・ブックビルディング（需要申告）・公募価格の決定・購入申込・上場の順に進みます。上場日の2〜3週間前にブックビルディングが始まることが多いです。" },
  { q: "このスケジュール表の日付は確定していますか？", a: "上場日は取引所の発表で確定しますが、ブックビルディングや申込の日程は仮条件の発表後に確定します。日程が変わることもあるため、申込の前に証券会社の案内も確認してください。" },
  { q: "IPOの申込には、いくらくらい必要ですか？", a: "売買の単位は100株が基本のため、公募価格の100倍が目安です。たとえば公募価格が1,000円なら10万円です。申込時に資金の預け入れが必要かどうかは、証券会社によって異なります。" },
  { q: "上場日の前後で、何を確認すればよいですか？", a: "申込の前には、目論見書で事業内容・財務・リスク・資金の使い道を確認します。上場後は、ロックアップの解除日が近づく銘柄を確認するとよいでしょう。解除予定はロックアップ解除予定のページにまとめています。" },
];

export default async function SchedulePage() {
  const { today, upcoming, recent } = await load();
  const year = today.slice(0, 4);
  const byMonth = new Map<string, CompanyListItem[]>();
  for (const c of upcoming) {
    const k = c.listing_date.slice(0, 7);
    byMonth.set(k, [...(byMonth.get(k) ?? []), c]);
  }

  const itemList = {
    "@context": "https://schema.org", "@type": "ItemList",
    name: `IPOスケジュール${year} 上場予定の銘柄`,
    itemListElement: upcoming.slice(0, 50).map((c, i) => ({ "@type": "ListItem", position: i + 1, name: `${c.name}（上場日 ${c.listing_date}）`, url: `${BASE}/analysis/${companySlug(c)}` })),
  };
  const breadcrumb = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "トップ", item: BASE },
      { "@type": "ListItem", position: 2, name: "IPOスケジュール", item: `${BASE}/schedule` },
    ],
  };
  const faqLd = {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: SCHEDULE_FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };

  return (
    <Page>
      <JsonLd data={breadcrumb} />
      {upcoming.length > 0 && <JsonLd data={itemList} />}
      <JsonLd data={faqLd} />
      <Crumbs items={[{ label: "トップ", href: "/" }, { label: "IPOスケジュール" }]} />
      <H1>IPOスケジュール{year}｜新規上場の一覧表</H1>
      <Lead>
        {upcoming.length > 0
          ? `これから上場する${upcoming.length}社を、上場日の早い順に月ごとの表にまとめました。仮条件・ブックビルディング・申込の日程も確認できます。`
          : "上場日が決まっている銘柄が登録され次第、ここに一覧で表示します。"}
        {" "}カレンダーで見たい方は<a href="/" style={{ color: C.nav, fontWeight: 700 }}>トップページ</a>をご覧ください。（{jpDate(today)}時点）
      </Lead>

      {/* 2026/10/24追加(束C・⑨): 無料で読める範囲の案内。読点は1文に1つ以下 */}
      <div style={{ backgroundColor: "#e8f9f9", border: "1.5px solid #66c3c6", borderRadius: 12, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#0d4f52", lineHeight: 1.8 }}>
        <strong>毎月2銘柄は無料で読めます。</strong>毎月最初の2銘柄の分析レポートは、登録なしでご覧いただけます。
        <a href="/plans" style={{ color: C.nav, fontWeight: 800, marginLeft: 6, whiteSpace: "nowrap" }}>プランを見る →</a>
      </div>

      {/* 2026/10/24追加(束C・⑨): トップページと同じ「マーケットトレンド」カード */}
      <TrendsLinkCard marginBottom={12} />

      {/* 2026/10/20追加(案2): 毎週金曜18時の「IPO週報」(無料)の申込みカード */}
      <WeeklyBriefSignup />

      {[...byMonth.entries()].map(([k, list]) => (
        <Card key={k}>
          <H2>{monthLabel(k)}に上場予定のIPO（{list.length}社）</H2>
          <Table
            head={["上場日", "銘柄", "市場", "仮条件", "公募価格", "BB開始", "申込開始"]}
            rows={list.map((c) => [
              <span key="d" style={{ whiteSpace: "nowrap" }}>{shortDate(c.listing_date)}{c.listing_date_confirmed ? "" : "（予定）"}</span>,
              <NameCell key="n" c={c} />,
              c.exchange || "-",
              priceRangeText(c.price_range_min, c.price_range_max) || "-",
              yen(c.ipo_price) || "-",
              shortDate(c.bb_start_date),
              shortDate(c.apply_start_date),
            ])}
          />
        </Card>
      ))}

      {recent.length > 0 && (
        <Card>
          <H2>最近上場した銘柄（直近60日）</H2>
          <Table
            head={["上場日", "銘柄", "市場", "公募価格", "初値", "公募価格比"]}
            minWidth={560}
            rows={recent.map((c) => [
              <span key="d" style={{ whiteSpace: "nowrap" }}>{shortDate(c.listing_date)}</span>,
              <NameCell key="n" c={c} />,
              c.exchange || "-",
              yen(c.ipo_price) || "-",
              yen(c.initial_price) || "-",
              pctText(c.price_change_rate) || "-",
            ])}
          />
          <P>過去の初値は<a href="/results" style={{ color: C.nav, fontWeight: 700 }}>初値の結果一覧</a>にまとめています。</P>
        </Card>
      )}

      <Card>
        <H2>IPOスケジュールの見方</H2>
        <P>表の「仮条件」は、ブックビルディングで申し込む価格の範囲です。「公募価格」は、その結果を受けて決まる購入時の価格です。「BB開始」はブックビルディング（需要申告）の開始日で、「申込開始」は購入申込などの手続きが始まる日です。</P>
        <P>表に「-」とあるのは、まだ発表されていない項目です。発表され次第、自動で表示が更新されます。銘柄名のリンク先では、目論見書をAIが解析した分析レポートを読めます。</P>
        <P>IPOで利益が出たときの税金やNISAの基本は、<a href="/tax-nisa" style={{ color: C.nav, fontWeight: 700 }}>税金・NISAの解説ページ</a>にまとめています。</P>
      </Card>

      <Card>
        <H2>IPOスケジュールのよくある質問</H2>
        {SCHEDULE_FAQ.map((f, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <h3 style={{ fontSize: 13, fontWeight: 900, color: C.nav, margin: "0 0 4px" }}>{f.q}</h3>
            <p style={{ fontSize: 12, color: "#334155", lineHeight: 1.8, margin: 0 }}>{f.a}</p>
          </div>
        ))}
        <Disclaimer />
      </Card>

      <RelatedLinks current="/schedule" />
    </Page>
  );
}
