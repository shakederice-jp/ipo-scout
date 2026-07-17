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

    if (profile?.plan && ["notify", "report", "complete"].includes(profile.plan)) return true;

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
  const description = score
    ? `総合スコア${score}/100（${grade}評価）。${summary.slice(0, 120)}`
    : summary.slice(0, 150);
  const title = `${data.name} IPO分析レポート｜大手町調査室九課`;
  const ticker = (data as any).ticker;
  const canonicalId = ticker ?? data.id;
  const url = `https://ipo-jp.vercel.app/analysis/${canonicalId}`;
  return {
    title,
    description,
    keywords: [`${data.name}`, "IPO分析", "IPOスコア", "目論見書", "初値予測", (data as any).sector ?? ""].filter(Boolean),
    openGraph: {
      title, description, url,
      siteName: "大手町調査室九課",
      locale: "ja_JP",
      type: "article",
      images: [{ url: "https://ipo-jp.vercel.app/ogp.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title, description,
      images: ["https://ipo-jp.vercel.app/ogp.png"],
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

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": `${company.name} IPO分析レポート`,
    "description": analysisSummary?.summary ?? `${company.name}のIPO分析`,
    "publisher": {
      "@type": "Organization",
      "name": "大手町調査室九課",
      "url": "https://ipo-jp.vercel.app",
    },
    "datePublished": company.listing_date ?? new Date().toISOString(),
    "dateModified": new Date().toISOString(),
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `https://ipo-jp.vercel.app/analysis/${canonicalId}`,
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
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