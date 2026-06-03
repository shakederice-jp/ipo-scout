import { fetchIpoCompanyById, fetchIpoCompanies } from "@/lib/supabase/server";
import AnalysisClient from "@/components/AnalysisClient";
import { notFound } from "next/navigation";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await fetchIpoCompanyById(id);
  return {
    title: data ? `${data.name} 分析レポート` : "銘柄分析レポート",
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
    />
  );
}