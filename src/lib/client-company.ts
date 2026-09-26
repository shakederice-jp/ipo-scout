// 2026/9/26新設: 分析ページ(page.tsx / beginner/page.tsx)からクライアント部品(AnalysisClient)へ
// 渡す company オブジェクトを、画面で実際に使う項目だけに絞る。
//
// 以前は ipo_companies の全列(select("*"))をそのまま渡していたため、ブラウザに送られる
// ページのデータの中に、目論見書本文(raw_prospectus)や9軸の詳細レポート(analysis_axes_*)、
// 市場・競合情報(analysis_market)まで含まれていた。画面には表示されなくても、ページの
// ソースを見れば有料会員限定の内容が読めてしまう状態だったので、ここで取り除く。
// 独自AIナインクロスの独自試算(analysis_market.nine_cross と structured_data.extra_facts)も
// 有料会員限定のため、アクセス権がない場合は送らない。
const CLIENT_FIELDS = [
  "id", "name", "ticker", "exchange", "sector", "biz_type",
  "listing_date", "listing_date_confirmed", "bb_start_date", "apply_start_date",
  "lockup_90_date", "lockup_180_date", "price_range_min", "price_range_max",
  "ipo_price", "initial_price", "price_change_rate", "status", "highlight",
  "ai_score", "ai_summary", "infographic_url", "created_at", "updated_at",
];

export function toClientCompany(co: any, hasAccess: boolean): any {
  const out: any = {};
  for (const k of CLIENT_FIELDS) if (co && k in co) out[k] = co[k];
  if (co?.structured_data) {
    const { extra_facts, ...rest } = co.structured_data;
    out.structured_data = hasAccess ? co.structured_data : rest;
  }
  if (co?.analysis_deep_dive) {
    out.analysis_deep_dive = hasAccess
      ? co.analysis_deep_dive
      : { ...co.analysis_deep_dive, long_term_strength: undefined };
  }
  return out;
}
