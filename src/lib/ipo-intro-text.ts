// 新規IPO承認時にX投稿用として自動生成する文章の組み立てロジック。
// 以前は src/app/api/analyze/route.ts の中だけに書かれていたが、
// 過去銘柄向けの管理画面ツール(backfill-infographics)からも同じ文章を
// 組み立てられるように、共通の関数としてここに切り出した。
// (2026/8/29、マーケットトレンドページの「新規IPO紹介」カテゴリー追加に伴う変更)

export interface IpoIntroCompany {
  name: string;
  listing_date?: string | null;
  exchange?: string | null;
  ticker?: string | null;
  structured_data?: any;
  analysis_market?: any;
}

// 注意: DBの値が空文字列("")の場合、??はnull/undefinedにしか反応しないため
// フォールバック文言に置き換わらない不具合が過去にあった。そのため||を使う。
export function buildIpoIntroText(co: IpoIntroCompany, insightBody: string, titleLabel: string = "新規IPO承認"): string {
  const revenue = co.structured_data?.financials?.revenue_trend || "不明";
  const profit = co.structured_data?.financials?.profit_trend || "不明";
  const underwriter = co.analysis_market?.lead_underwriter || "未定";

  return `【${titleLabel}】\n${co.name}\n\n` +
    `・上場日：${co.listing_date || "未定"}\n` +
    `・市場：${co.exchange || "不明"}\n` +
    `・コード：${co.ticker || "未定"}\n` +
    `・売上：${revenue}\n` +
    `・利益：${profit}\n` +
    `・主幹事：${underwriter}\n\n` +
    `${insightBody}\n\n` +
    `続きは分析アプリで👆\n\n#IPO #新規上場`;
}
