// 2026/10/20新設(案2・週刊ブリーフのPDFスライド): スライドに差し込むデータの型。
// 数字・日付・社名・スコアは、すべてDBの値をコードでそのまま入れる(AIには書かせない)。
// AIが書くのは、commentary(各スライドのひとこと解説)だけで、数字は元データと照合してから使う。

export interface SlideEvent {
  date: string;         // YYYY-MM-DD
  label: string;        // 上場日 / BB開始 / 申込開始 / ロックアップ解除(90日) など
  color: string;
  name: string;
  ticker: string | null;
}

export interface SlideResultRow {
  name: string;
  ticker: string | null;
  listing_date: string;
  ipo_price: number | null;
  initial_price: number | null;
  rate: number | null;        // 公募価格比(%)
  grade: string | null;       // 上場前に付けたAI評価(A〜E)。上場後に作った評価は入れない
  score: number | null;
  verdict: "一致" | "不一致" | "中立" | "-";
}

export interface SlideScheduleRow {
  name: string;
  ticker: string | null;
  exchange: string | null;
  range: string;              // 仮条件(表示用の文字列)
  ipo_price: string;
  bb: string;                 // 表示用 "10/26(月)" または "-"
  apply: string;
  listing: string;
}

export interface SlideLockupRow {
  name: string;
  ticker: string | null;
  kind: string;               // 90日 / 180日
  date: string;               // 表示用
  listing: string;
}

export interface SlideFeatured {
  name: string;
  ticker: string | null;
  exchange: string | null;
  sector: string | null;
  grade: string | null;
  score: number | null;
  ultra: string | null;
  short: string | null;
  long: string | null;
  facts: [string, string][];  // 表示用の項目(値があるものだけ)
  summary: string;            // 要約の最初の2文まで
  axes: { label: string; score: number }[];     // 9軸(0〜100)
  points: { title: string; text: string }[];    // 注目点(最大2)
  caution: { title: string; score: number; text: string } | null;
}

export interface SlideTheme {
  title: string;
  lead: string;
  points: { head: string; body: string }[];
  note: string;
}

export interface SlidesData {
  issueLabel: string;          // 例: 2026年10月 第4週号
  asOf: string;                // データ時点 YYYY-MM-DD
  thisMon: string;
  thisFri: string;
  nextMon: string;
  nextSun: string;
  points: string[];            // 今週の3つの要点(コードで作成)
  counts: { listing: number; bb: number; apply: number; lockup: number };
  events: SlideEvent[];        // 来週の予定
  market: { items: { name: string; value: number; date: string }[]; avg: number | null; median: number | null; up: number; n: number };
  results: SlideResultRow[];   // 今週に初値が付いた銘柄
  check: SlideResultRow[];     // 答え合わせ(直近4週間に上場した銘柄)
  schedule: SlideScheduleRow[];
  lockups: SlideLockupRow[];
  featured: SlideFeatured[];   // 注目銘柄(最大3)
  theme: SlideTheme;
  commentary: { market?: string; check?: string; outlook?: string };
}
