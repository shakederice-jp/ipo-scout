export interface IpoCompany {
  id: string;
  name: string;
  ticker: string | null;
  exchange: string | null;
  sector: string | null;
  biz_type: string | null;
  price_range_min: number | null;
  price_range_max: number | null;
  listing_date: string | null;
  apply_start_date: string | null;
  bb_start_date: string | null;
  lockup_90_date: string | null;
  lockup_180_date: string | null;
  status: string;
  highlight: boolean;
  ai_score: number | null;
  ai_summary: string | null;
  created_at?: string;
  updated_at?: string;
  analysis_detail?: any;
  analysis_summary?: any;
  analysis_axes_short?: any;
  analysis_axes_mid?: any;
  analysis_axes_long?: any;
  analysis_market?: any;
  structured_data?: any;
  raw_prospectus?: any;
}