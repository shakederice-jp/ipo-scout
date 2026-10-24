import type { Metadata } from "next";
import { Page, Crumbs, H1, Lead, Card, H2, P, Table, RelatedLinks, Disclaimer, JsonLd, C } from "@/components/PageParts";

// 2026/10/24新設(束C・③): IPO株の税金とNISAの基本を、一般的な内容にしぼって説明する無料ページ。
// 個別の税務相談・投資助言にならないよう、事実の整理にとどめる。
// 文体ルール: 1文の読点は1つまで。断定的な言い切りや最上級の表現は使わない。
// 数字(税率・NISAの上限額)は制度改正で変わることがあるため、年1回ほど国税庁・金融庁の案内で見直すこと。
export const revalidate = 86400;

const BASE = "https://ipo.finance-tower.com";

export async function generateMetadata(): Promise<Metadata> {
  const title = "IPO株の税金とNISAの基本｜利益・損失の扱いと注意点｜大手町調査室九課";
  const description = "IPO株の利益にかかる税金（20.315%）と損失の扱い、NISAの基本と注意点を一般的な内容で整理しました。個別の税務相談ではありません。";
  return {
    title, description,
    openGraph: { title, description, url: `${BASE}/tax-nisa`, siteName: "大手町調査室九課", locale: "ja_JP", type: "article", images: [{ url: `${BASE}/ogp.png`, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [`${BASE}/ogp.png`] },
    alternates: { canonical: `${BASE}/tax-nisa` },
  };
}

const FAQ = [
  { q: "利益が少ない年は、確定申告をしなくてもよいですか？", a: "会社員などの一定の条件では、給与以外の所得が年間20万円以下なら所得税の確定申告が不要とされています。ただし住民税の申告が必要な場合があります。詳しくは税務署か税理士にご確認ください。" },
  { q: "NISA口座と特定口座は、両方使えますか？", a: "両方を使えます。NISAの枠を使い切った分や枠の対象外の取引は、特定口座などで行います。" },
  { q: "NISA口座でIPOに申し込めますか？", a: "IPO株は成長投資枠の対象です。ただしNISA口座で申し込めるかどうかは証券会社によって異なるため、申込前に各社の案内でご確認ください。" },
  { q: "税率や非課税枠は、今後も同じですか？", a: "制度は改正されることがあります。最新の内容は、国税庁・金融庁・各証券会社の案内でご確認ください。" },
];

export default function TaxNisaPage() {
  const breadcrumb = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "トップ", item: BASE },
      { "@type": "ListItem", position: 2, name: "IPO株の税金とNISAの基本", item: `${BASE}/tax-nisa` },
    ],
  };
  const faqLd = {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  const link = { color: C.nav, fontWeight: 700 } as const;

  return (
    <Page>
      <JsonLd data={breadcrumb} />
      <JsonLd data={faqLd} />
      <Crumbs items={[{ label: "トップ", href: "/" }, { label: "IPO株の税金とNISAの基本" }]} />
      <H1>IPO株の税金とNISAの基本</H1>
      <Lead>
        IPO株で利益が出たときの税金と、NISA口座の基本を整理しました。一般的な内容にしぼっており、個別の税務相談ではありません。
      </Lead>

      <Card>
        <H2>IPO株の利益にかかる税金</H2>
        <P>上場株式を売って得た利益には、申告分離課税として約20%の税金がかかります。内訳は所得税15%と復興特別所得税0.315%と住民税5%で、合計20.315%です。</P>
        <P>IPOで買った株も、上場後に売って利益が出れば同じ扱いです。損失が出たときは、一定の条件で他の利益と相殺できます。</P>
        <P>税金の手続きは、口座の種類によって変わります。</P>
        <Table
          head={["口座の種類", "税金の計算と納付", "確定申告"]}
          minWidth={520}
          rows={[
            ["特定口座（源泉徴収あり）", "証券会社が税額を計算して納付します。", "原則として不要です。"],
            ["特定口座（源泉徴収なし）", "証券会社が年間の損益を計算します。納付は自分で行います。", "年間の利益が一定額を超える場合は必要です。"],
            ["一般口座", "自分で損益を計算して納付します。", "利益が出た場合は原則として必要です。"],
            ["NISA口座", "利益は非課税です。", "不要です。"],
          ]}
        />
      </Card>

      <Card>
        <H2>損失が出たとき（損益通算と繰越控除）</H2>
        <P>同じ年の中で、利益と損失を合算することを損益通算といいます。</P>
        <P>引ききれなかった損失は、確定申告をすると翌年から3年間繰り越せます。繰越の手続きは、特定口座でも確定申告が必要です。</P>
        <P>損失が出た年の翌年以降に利益が出たときに、税金を減らせる場合があります。</P>
      </Card>

      <Card>
        <H2>NISA（少額投資非課税制度）の基本</H2>
        <P>NISA口座で買った株の利益や配当は、非課税になります。2024年からの新しい制度では、次の2つの枠があります。</P>
        <Table
          head={["項目", "つみたて投資枠", "成長投資枠"]}
          minWidth={520}
          rows={[
            ["年間の上限", "120万円", "240万円"],
            ["主な対象", "一定の公募株式投資信託・ETF", "上場株式・投資信託など（IPO株を含む）"],
            ["非課税の期間", "無期限", "無期限"],
          ]}
        />
        <P>年間の上限は、2つの枠を合わせて360万円です。生涯の非課税保有限度額は1,800万円で、うち成長投資枠は最大1,200万円です。売却した分の枠は、翌年以降に再び使えます。</P>
        <P>使わなかった年間の枠は、翌年に持ち越せません。</P>
      </Card>

      <Card>
        <H2>NISAでIPO株を買うときの注意</H2>
        <P>NISA口座で出た損失は、税務上なかったものとされます。そのため他の口座の利益とは相殺できません。繰越控除も使えません。</P>
        <P>NISA口座でIPOに申し込めるかどうかは証券会社によって異なります。申込前に各社の案内で確認してください。</P>
        <P>初値が公募価格を下回ることもあります。値下がりしたときの損失は他の利益と相殺できない点も、知っておくと役立ちます。</P>
      </Card>

      <Card>
        <H2>税金・NISAのよくある質問</H2>
        {FAQ.map((f, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <h3 style={{ fontSize: 13, fontWeight: 900, color: C.nav, margin: "0 0 4px" }}>{f.q}</h3>
            <p style={{ fontSize: 12, color: "#334155", lineHeight: 1.8, margin: 0 }}>{f.a}</p>
          </div>
        ))}
        <P>
          最新の制度は、<a href="https://www.nta.go.jp/" target="_blank" rel="noopener noreferrer" style={link}>国税庁</a>と
          <a href="https://www.fsa.go.jp/policy/nisa2/" target="_blank" rel="noopener noreferrer" style={link}>金融庁のNISA特設ページ</a>をご覧ください。
        </P>
        <p style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.8, margin: "6px 0 0" }}>
          本ページは一般的な制度の説明であり、個別の税務相談ではありません。具体的な取り扱いは、税務署や税理士などにご確認ください。
        </p>
        <Disclaimer />
      </Card>

      <Card>
        <H2>申込の流れや日程を確認する</H2>
        <P>
          IPOの申込の流れは<a href="/how-to-apply" style={link}>IPOの申込方法</a>に、上場日や申込日程は<a href="/schedule" style={link}>IPOスケジュール</a>にまとめています。
        </P>
      </Card>

      <RelatedLinks current="/tax-nisa" />
    </Page>
  );
}
