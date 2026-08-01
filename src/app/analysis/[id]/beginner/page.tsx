import { fetchIpoCompanyById, fetchIpoCompanies, createSupabaseServerClient, createSupabaseRouteClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
import { createClient } from "@supabase/supabase-js";
import AnalysisClient from "@/components/AnalysisClient";
import { notFound } from "next/navigation";

async function fetchCompany(id: string) {
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
  if (!data) return { title: "銘柄分析レポート（初心者向け）" };
  const co = data as any;
  const summary = co.analysis_summary?.summary ?? `${data.name}のIPO分析レポート（初心者向け）。`;
  const title = `${data.name} IPO分析レポート｜初心者向け｜大手町調査室九課`;
  const ticker = (data as any).ticker;
  const canonicalId = ticker ?? data.id;
  const url = `https://ipo.finance-tower.com/analysis/${canonicalId}/beginner`;
  return {
    title,
    description: summary.slice(0, 150),
    keywords: [`${data.name}`, "IPO分析", "初心者向け", "IPO投資 初心者", (data as any).sector ?? ""].filter(Boolean),
    openGraph: {
      title, description: summary.slice(0, 150), url,
      siteName: "大手町調査室九課",
      locale: "ja_JP",
      type: "article",
      images: [{ url: "https://ipo.finance-tower.com/ogp.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title, description: summary.slice(0, 150),
      images: ["https://ipo.finance-tower.com/ogp.png"],
    },
    alternates: { canonical: url },
  };
}

export default async function AnalysisBeginnerPage({ params }: { params: Promise<{ id: string }> }) {
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

  const isFreeCompany = (allCompanies as any[] | null)?.find((c) => c.id === company.id)?.is_free ?? false;
  const hasAccess = await checkAccess(company.id, isFreeCompany);

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
    "headline": `${company.name} IPO分析レポート（初心者向け）`,
    "description": analysisSummary?.summary ?? `${company.name}のIPO分析（初心者向け）`,
    "publisher": {
      "@type": "Organization",
      "name": "大手町調査室九課",
      "url": "https://ipo.finance-tower.com",
    },
    "datePublished": company.listing_date ?? new Date().toISOString(),
    "dateModified": new Date().toISOString(),
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `https://ipo.finance-tower.com/analysis/${canonicalId}/beginner`,
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
        level="beginner"
      />
    </>
  );
}