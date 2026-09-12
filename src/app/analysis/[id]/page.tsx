import { fetchIpoCompanyById, fetchIpoCompanies, createSupabaseServerClient, createSupabaseRouteClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
import { createClient } from "@supabase/supabase-js";
import AnalysisClient from "@/components/AnalysisClient";
import { notFound } from "next/navigation";

async function fetchCompany(id: string) {
  // ハイフンを含む場合はUUID、そうでなければティッカーコードとして検索
  if (id.includes("-")) {
    return fetchIpoCompanyById(id);
  }
  const supabase = createSupabaseServerClient();
  if (!supabase) return { data: null, error: new Error("no client") };
  const { data, error } = await supabase
    .from("ipo_companies")
    .select("*")
    .eq("ticker", id.toUpperCase())
    .single();
  return { data, error };
}

// この銘柄をこのユーザーが閲覧できるかどうかを判定する
// (無料枠の銘柄 / ログイン済みかつ有料プラン加入 / ログイン済みかつ単品購入済み のいずれか)
async function checkAccess(companyId: string, isFreeCompany: boolean): Promise<boolean> {
  if (isFreeCompany) return true;

  const routeClient = await createSupabaseRouteClient();
  if (!routeClient) return false;
  const { data: { session } } = await routeClient.auth.getSession();
  if (!session) return false;

  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: profile } = await serviceSupabase
    .from("user_profiles")
    .select("plan")
    .eq("id", session.user.id)
    .single();

    if (profile?.plan && ["report", "complete"].includes(profile.plan)) return true;

  const { data: purchase } = await serviceSupabase
    .from("purchased_stocks")
    .select("id")
    .eq("user_id", session.user.id)
    .eq("company_id", companyId)
    .maybeSingle();

  return !!purchase;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await fetchCompany(id);
  if (!data) return { title: "銘柄分析レポート" };
  const co = data as any;
  const summary = co.analysis_summary?.summary ?? `${data.name}のIPO分析レポート。スコア・シナリオ・詳細分析を掲載。`;
  const score = co.analysis_summary?.total_score ?? "";
  const grade = co.analysis_summary?.grade ?? "";
  const ticker = (data as any).ticker;

  // 2026/9/12改修: 個別銘柄ページのSEO強化。「会社名 IPO」だけでなく「会社名 初値予想」
  // 「会社名 上場日」という、実際に個人投資家が検索する語句にtitle/descriptionを合わせた。
  // このページは1つの共通テンプレートのため、この変更だけで全銘柄(今後上場する銘柄も含む)
  // に自動的に反映される。上場日は、目論見書以外の複数情報源で確認済み(listing_date_confirmed)
  // の銘柄のみ実際の日付を出す(未確定の日付を断定表示しない、という既存のカウントダウン
  // バッジと同じ方針を踏襲)。具体的な初値の予想数値は掲載していないため、「初値予想」という
  // 検索語はtitleで受け止めつつ、description側では「初値シナリオ」という実態に即した言葉で
  // 案内し、検索から来た人が期待と実態のズレで離脱しないようにしている。
  const listingDateStr = co.listing_date_confirmed && data.listing_date
    ? new Date(data.listing_date).toLocaleDateString("ja-JP", { year: "numeric", month: "numeric", day: "numeric" })
    : null;
  const tickerPart = ticker ? `(${ticker})` : "";
  const scheduleNote = listingDateStr ? `${listingDateStr}上場予定。` : "";
  const description = (score
    ? `${data.name}${tickerPart}のIPO分析。${scheduleNote}目論見書をAIが解析し、上場日・初値シナリオ・総合スコア${score}/100（${grade}評価）を掲載。${summary}`
    : `${data.name}${tickerPart}のIPO分析。${scheduleNote}目論見書をAIが解析し、上場日・初値シナリオ・9軸スコアを掲載。${summary}`
  ).slice(0, 160);
  const title = `${data.name} IPO 上場日・初値シナリオ分析｜大手町調査室九課`;
  const canonicalId = ticker ?? data.id;
  const url = `https://ipo.finance-tower.com/analysis/${canonicalId}`;
  return {
    title,
    description,
    keywords: [`${data.name}`, "IPO分析", "初値予想", "上場日", "IPOスコア", "目論見書", (data as any).sector ?? ""].filter(Boolean),
    openGraph: {
      title, description, url,
      siteName: "大手町調査室九課",
      locale: "ja_JP",
      type: "article",
      images: [{ url: "https://ipo.finance-tower.com/ogp.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title, description,
      images: ["https://ipo.finance-tower.com/ogp.png"],
    },
    alternates: { canonical: url },
  };
}

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ data: company }, { data: allCompanies }] = await Promise.all([
    fetchCompany(id),
    fetchIpoCompanies(),
  ]);

  if (!company) notFound();

  const co = company as any;
  const analysisSummary = co.analysis_summary ?? null;
  const axesShort = co.analysis_axes_short ?? null;
  const axesMid = co.analysis_axes_mid ?? null;
  const axesLong = co.analysis_axes_long ?? null;
  const analysisMarket = co.analysis_market ?? null;
  const visualizationData = co.visualization_data ?? null;

  let initialAnalysis: any = null;
  if (analysisSummary) {
    initialAnalysis = {
      ...analysisSummary,
      axes: {
        ultra_short: axesShort ? Object.values(axesShort) : [],
        short: axesMid ? Object.values(axesMid) : [],
        long: axesLong ? Object.values(axesLong) : [],
      },
      market_data: analysisMarket,
      is_new_format: true,
    };
  } else if (co.analysis_detail) {
    initialAnalysis = { ...co.analysis_detail, is_new_format: false };
  }

  // 無料公開対象の銘柄かどうか(月初3銘柄まで)はfetchIpoCompanies側で計算済み
  const isFreeCompany = (allCompanies as any[] | null)?.find((c) => c.id === company.id)?.is_free ?? false;
  const hasAccess = await checkAccess(company.id, isFreeCompany);
  console.error("課金判定診断:", "company.id=", company.id, "isFreeCompany=", isFreeCompany, "hasAccess=", hasAccess);

  // アクセス権が無い場合は、要約・スコアなどの「無料プレビュー」部分だけ残し、
  // 詳細分析(軸別スコア・シナリオ・インサイト)はクライアントに一切送らない
  if (initialAnalysis && !hasAccess) {
    initialAnalysis = {
      summary: initialAnalysis.summary,
      total_score: initialAnalysis.total_score,
      grade: initialAnalysis.grade,
      ultra_short_grade: initialAnalysis.ultra_short_grade,
      short_grade: initialAnalysis.short_grade,
      long_grade: initialAnalysis.long_grade,
      is_new_format: initialAnalysis.is_new_format,
    };
  }

  const ticker = co.ticker;
  const canonicalId = ticker ?? company.id;
  const url = `https://ipo.finance-tower.com/analysis/${canonicalId}`;

  // 2026/9/5追加: dateModifiedが常に「今」(new Date())になっており、実際には
  // 中身が変わっていないアクセスのたびにGoogleへ「更新した」という偽の鮮度シグナルを
  // 送ってしまっていた不具合を修正。STEP4(スコア・シナリオ生成)保存時刻
  // (analysis_summary.generated_at)と、STEP8(深掘り3要素)保存時刻
  // (analysis_deep_dive.updated_at)のうち、実際に記録されている一番新しい時刻を使う。
  // どちらも無ければ上場日、それも無ければ現在時刻にフォールバックする。
  const contentTimestamps = [
    analysisSummary?.generated_at,
    co.analysis_deep_dive?.updated_at,
  ]
    .filter(Boolean)
    .map((d: string) => new Date(d).getTime())
    .filter((t: number) => !Number.isNaN(t));
  const dateModified = contentTimestamps.length
    ? new Date(Math.max(...contentTimestamps)).toISOString()
    : new Date().toISOString();
  const datePublished = analysisSummary?.generated_at ?? company.listing_date ?? dateModified;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": `${company.name} IPO分析レポート`,
    "description": analysisSummary?.summary ?? `${company.name}のIPO分析`,
    "publisher": {
      "@type": "Organization",
      "name": "大手町調査室九課",
      "url": "https://ipo.finance-tower.com",
    },
    "datePublished": datePublished,
    "dateModified": dateModified,
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `https://ipo.finance-tower.com/analysis/${canonicalId}`,
    },
  };

  // 2026/9/12追加: 画面上のパンくず(AppHeader.tsxの「トップ＞銘柄分析」)は見た目のみで
  // Google向けの構造化データが無かったため、こちらで別途BreadcrumbListを付与する。
  // AppHeaderは全ページ共通のクライアントコンポーネントで会社名を持たないため、末尾の
  // 項目には(見た目の「銘柄分析」より具体的な)実際の会社名を使い、検索結果でのパンくず
  // 表示の精度を優先した(見た目のラベルと完全一致させる必要はない)。
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "トップ", "item": "https://ipo.finance-tower.com" },
      { "@type": "ListItem", "position": 2, "name": company.name, "item": url },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <AnalysisClient
        company={company as any}
        initialAnalysis={initialAnalysis}
        visualizationData={hasAccess ? visualizationData : null}
        allCompanies={allCompanies as any[]}
        hasAccess={hasAccess}
      />
    </>
  );
}