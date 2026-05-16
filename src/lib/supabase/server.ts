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

// 分析レポートページ用（1銘柄取得）
export async function fetchIpoCompanyById(id: string): Promise<{
  data: IpoCompany | null;
  error: string | null;
  order: number | null;
}> {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { data: null, error: "Supabase の環境変数が設定されていません。", order: null };
  }

  // 対象銘柄を取得
  const { data, error } = await supabase
    .from("ipo_companies")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return { data: null, error: error?.message ?? "銘柄が見つかりません", order: null };
  }

  // 全銘柄の順番を取得（listing_date昇順）
  const { data: allData } = await supabase
    .from("ipo_companies")
    .select("id")
    .order("listing_date", { ascending: true, nullsFirst: false });

  const order = allData ? allData.findIndex(c => c.id === id) + 1 : null;

  return { data: data as IpoCompany, error: null, order };
}


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