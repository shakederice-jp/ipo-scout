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

  const initialAnalysis = (company as any).analysis_detail ?? null;

  return (
    <AnalysisClient
      company={company as any}
      initialAnalysis={initialAnalysis}
    />
  );
}