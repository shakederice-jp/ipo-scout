export type IpoCompany = {
  id: string;
  name: string;
  sector: string | null;
  listing_date: string | null;
  ai_summary: string | null;
  ticker: string | null;
  created_at?: string;
};
