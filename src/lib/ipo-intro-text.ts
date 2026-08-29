// 新規IPO承認時にX投稿用として自動生成する文章の組み立てロジック。
// 以前は src/app/api/analyze/route.ts の中だけに書かれていたが、
// 過去銘柄向けの管理画面ツール(backfill-infographics)からも同じ文章を
// 組み立てられるように、共通の関数としてここに切り出した。
// (2026/8/29、マーケットトレンドページの「新規IPO紹介」カテゴリー追加に伴う変更)
//
// 2026/8/29 追記: コード(証券コード)・主幹事は、まだ判明していない銘柄が実際にある
// (証券コードは東証が上場直前に付番するため分析時点では未定のことが多く、主幹事は
// STEP2「市場・競合情報を収集」のAI検索が見つけられないことがある)。
// 以前はここに「未定」「不明」という文言を入れていたが、ユーザーから
// 「情報が無いのに未定と表示されるのはおかしい。二度と出さないでほしい」との指摘を受け、
// 値が無い項目は行ごと省略する方式に変更した(空欄や「未定」を見せるより、
// 分かっている情報だけを簡潔に見せた方が記事として自然なため)。
//
// 2026/8/29 追記: 「売上」「利益」の推移(5期分の実数値をそのまま並べたもの)は、
// せっかく心理学・行動経済学を意識して作った紹介文(appeal_narrative)がその下に
// 隠れてしまい、X上でフォロワーの目に入る前に読み飛ばされる原因になるとの
// フィードバックを受け、箇条書きから削除した。財務の詳しい推移は分析ページ側で
// 読んでもらう位置づけとする。
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
  const underwriter = co.analysis_market?.lead_underwriter || "";

  // 値が判明している項目だけを箇条書きにする(未判明の項目は行ごと省略)。
  // 売上・利益の推移は、紹介文(appeal_narrative)が下に隠れて読み飛ばされる
  // 原因になるため、あえて含めない(2026/8/29)。
  const facts: { label: string; value: string }[] = [
    { label: "上場日", value: co.listing_date || "" },
    { label: "市場", value: co.exchange || "" },
    { label: "コード", value: co.ticker || "" },
    { label: "主幹事", value: underwriter },
  ];
  const factLines = facts.filter((f) => f.value).map((f) => `・${f.label}：${f.value}`);

  return `【${titleLabel}】\n${co.name}\n\n` +
    (factLines.length > 0 ? factLines.join("\n") + "\n\n" : "") +
    `${insightBody}\n\n` +
    `続きは大手町調査室９課公式HPで読む\n\n#IPO #新規上場`;
}
