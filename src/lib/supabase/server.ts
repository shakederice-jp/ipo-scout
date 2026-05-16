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

// トップページ用
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
    .select("id,name,sector,listing_date,ai_summary,ticker,created_at,status,highlight,ai_score,exchange,biz_type")
    .order("listing_date", { ascending: true, nullsFirst: false });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as IpoCompany[], error: null };
}

// カレンダーページ用（全フィールド取得）
export async function fetchIpoCompaniesForCalendar(): Promise<{
  data: IpoCompany[] | null;
  error: string | null;
}> {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return {
      data: null,
      error: "Supabase の環境変数が設定されていません。",
    };
  }

  const { data, error } = await supabase
    .from("ipo_companies")
    .select("id,name,ticker,exchange,sector,biz_type,price_range_min,price_range_max,listing_date,apply_start_date,bb_start_date,lockup_90_date,lockup_180_date,status,highlight,ai_score,ai_summary")
    .order("listing_date", { ascending: true, nullsFirst: false });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as IpoCompany[], error: null };
}