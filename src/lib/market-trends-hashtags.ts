// 2026/9/14新設: 「マーケットトレンドに掲載する記事には必ずハッシュタグを入れてほしい」
// というユーザー要望への対応。AIへのプロンプト指示だけに頼ると「入れ忘れる」ケースが
// 起こりうるため(AIの指示追従は完璧ではない)、記事をmarket_trendsに保存する直前に
// このヘルパーでハッシュタグ文字列を機械的に組み立てて本文に追記する設計にした
// (新たなAI呼び出しは増やしていない)。
// 呼び出し元: src/app/api/cron/generate-x-drafts/route.ts(saveThemeArticle、テーマ記事全般)、
// src/app/api/analyze/route.ts(新規IPO紹介の初期版)、
// src/app/api/deep-dive/route.ts(新規IPO紹介のnote.com差し替え版)。

// 会社名につきがちな法人格の接尾辞を外し、ハッシュタグとして見やすくする
// (2026/9/13にユーザーへ提示した見本記事「クラウドキッチン株式会社」→「#クラウドキッチン」と同じ処理)
function stripCorporateSuffix(name: string): string {
  return name
    .replace(/(株式会社|合同会社|一般社団法人|一般財団法人|ホールディングス)$/u, "")
    .trim();
}

// テーマ記事のタイトルが「ラベル(会社名)」の形式(例:「ロックアップ解除カウントダウン(会社名)」)
// になっている場合に会社名を取り出す。src/app/trends/[id]/page.tsxのbuildSeoMetaと同じ正規表現。
function extractCompanyFromLabel(label: string): string | null {
  const m = label.match(/^(.+?)\(([^)]+)\)$/);
  if (!m) return null;
  const companyRaw = m[2].split("・")[0];
  const stripped = stripCorporateSuffix(companyRaw);
  return stripped || null;
}

// sectorフィールドは実際の業種(例:「小売業」)の場合と、このサイト独自のテーマ分類ラベル
// (例:「IPOカレンダー」「マクロ経済」)の場合がある。どちらであっても、そのままハッシュタグに
// してしまって差し支えないため、特に判別はしていない。
export function buildMarketTrendsHashtags(label: string, sector: string | null | undefined, companyName?: string | null): string {
  const tags = ["#IPO", "#新規上場"];

  const company = companyName ? stripCorporateSuffix(companyName) : extractCompanyFromLabel(label);
  if (company) tags.push(`#${company}`);

  if (sector && sector.trim() && sector !== "その他") {
    tags.push(`#${sector.trim()}`);
  }

  tags.push("#株式投資");

  // 重複タグ(例: 会社名とsectorが偶然同じ文字列になった場合)を除いてから返す
  return Array.from(new Set(tags)).join(" ");
}
