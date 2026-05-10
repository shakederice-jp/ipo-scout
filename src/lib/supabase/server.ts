import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { IpoCompany } from "@/types/ipo";

function getEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return { url, key };
}

export function createSupabaseServerClient(): SupabaseClient | null {
  const { url, key } = getEnv();
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function fetchIpoCompanies(): Promise<{
  data: IpoCompany[] | null;
  error: string | null;
}> {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return {
      data: null,
      error: "Supabase の環境変数（NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY）が設定されていません。",
    };
  }

  const { data, error } = await supabase
    .from("ipo_companies")
    .select("id,name,sector,listing_date,ai_summary,ticker,created_at")
    .order("listing_date", { ascending: true, nullsFirst: false });

  if (error) {
    return {
      data: null,
      error: error.message,
    };
  }

  return { data: data as IpoCompany[], error: null };
}
