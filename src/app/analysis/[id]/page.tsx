import { fetchIpoCompanyById, fetchIpoCompanies } from "@/lib/supabase/server";
import AnalysisClient from "@/components/AnalysisClient";
import { notFound } from "next/navigation";
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await fetchIpoCompanyById(id);
  if (!data) return { title: "銘柄分析レポート" };
  const co = data as any;
  const summary = co.analysis_summary?.summary ?? `${data.name}のIPO分析レポート。スコア・シナリオ・詳細分析を掲載。`;
  const score = co.analysis_summary?.total_score ?? "";
  const grade = co.analysis_summary?.grade ?? "";
  const description = score
    ? `総合スコア${score}/100（${grade}評価）。${summary.slice(0, 120)}`
    : summary.slice(0, 150);
  const title = `${data.name} IPO分析レポート｜大手町調査室九課`;
  const url = `https://ipo-scout-six.vercel.app/analysis/${id}`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: "大手町調査室九課",
      locale: "ja_JP",
      type: "article",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
    alternates: {
      canonical: url,
    },
  };
}


export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [{ data: company, error }, { data: allCompanies }] = await Promise.all([
    fetchIpoCompanyById(id),
    fetchIpoCompanies(),
  ]);

  if (!company) notFound();

  const co = company as any;

  // analysis_summaryがあれば新形式、なければanalysis_detailにフォールバック
  const analysisSummary = co.analysis_summary ?? null;
  const axesShort = co.analysis_axes_short ?? null;
  const axesMid = co.analysis_axes_mid ?? null;
  const axesLong = co.analysis_axes_long ?? null;
  const analysisMarket = co.analysis_market ?? null;
  const visualizationData = co.visualization_data ?? null;
  // 旧形式との互換性を保ちつつ新形式データを統合
  let initialAnalysis: any = null;

  if (analysisSummary) {
    // 新7ステップ形式
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
    // 旧形式フォールバック
    initialAnalysis = {
      ...co.analysis_detail,
      is_new_format: false,
    };
  }

  return (
    <AnalysisClient
      company={company as any}
      initialAnalysis={initialAnalysis}
      visualizationData={visualizationData}
    />
  );
}