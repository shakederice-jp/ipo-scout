// 2026/10/21改訂(週刊PDFスライド・第2版): スライドに差し込むデータの型。
// 方針: 「結論 → 根拠」の順。数字・日付・社名・スコア・結論の一文は、すべてDBの値からコードで作る(AIには書かせない)。
// 例外: ありません(第1版にあった「AIのひとこと解説」は、読み手の時間を使うだけなので廃止した)。

export type Tone = "good" | "neutral" | "warn";

export interface SlideEvent {
  date: string;         // YYYY-MM-DD
  label: string;        // 上場日 / BB開始 / 申込開始 / ロックアップ解除(90日) など
  color: string;
  name: string;
  ticker: string | null;
}

// 過去の初値の統計(同じ市場・同じ主幹事など)
export interface CompStat {
  label: string;        // 例: 「グロース市場」「SMBC日興証券」
  n: number;
  avg: number;          // 公募価格比の平均(%)
  median: number;
  winRate: number;      // 公募価格を上回った割合(%)
  lossRate: number;     // 公募割れの割合(%)
  bins: number[];       // 度数(7区分。BIN_LABELSと対応)
}
export const BIN_LABELS = ["〜-10%", "-10〜0", "0〜10", "10〜30", "30〜60", "60〜100", "100%〜"];

export interface Holder { name: string; ratio: number; type: string; lockup: boolean | null }

export interface CompanyCard {
  id: string;
  name: string;
  ticker: string | null;
  exchange: string | null;
  sector: string | null;
  // AI評価(信頼できる評価のときだけ値が入る。例の数字のコピーだった評価は入れない)
  grade: string | null;
  score: number | null;
  ultra: string | null;
  short: string | null;
  long: string | null;
  headline: string;              // 結論の一文(コードで作る)
  supplyHeadline: string;        // 需給の結論の一文
  axes: { label: string; score: number }[];
  points: { title: string; text: string }[];           // 注目点(最大2)
  risks: { title: string; severity: string; text: string }[];   // リスク(最大3)
  financials: { label: string; revenue: number; profit: number | null }[];   // 億円
  facts: [string, string][];
  underwriter: string | null;
  dates: { bb: string | null; apply: string | null; listing: string | null; lock90: string | null; lock180: string | null; listingConfirmed: boolean };
  price: { range: string; ipo: string; basisLabel: string; need100: number | null; basis: number | null };  // need100: 100株の必要資金(円)
  supply: {
    postIpoShares: number | null; newShares: number | null; soldShares: number | null; oaShares: number | null;
    floatRatio: number | null;   // %
    fundraisingOku: number | null;
    marketCapOku: number | null; // 公募価格(または仮条件の上限)×上場後の株式数
    absorbOku: number | null;    // (公募+売出+OA)×価格
    lockupPeriod: string | null;
    lockupCover: number | null;  // ロックアップ対象の株主の保有比率の合計(%)
    vcRatio: number | null;      // VC等の保有比率の合計(%)
  };
  holders: Holder[];
  comps: { market: CompStat | null; underwriter: CompStat | null; sector: CompStat | null };
}

export interface GanttRow {
  name: string;
  ticker: string | null;
  exchange: string | null;
  need100: number | null;
  bb: string | null;
  apply: string | null;
  listing: string | null;
  listingConfirmed: boolean;
}

export interface RankRow { label: string; n: number; avg: number; winRate: number }

export interface TrackPoint { name: string; score: number; grade: string; rate: number }

export interface SlidesData {
  issueLabel: string;          // 例: 2026年10月 第4週号
  asOf: string;                // データ時点 YYYY-MM-DD
  thisMon: string;
  thisFri: string;
  nextMon: string;
  nextSun: string;
  headline: string;            // 1枚目の結論
  bullets: { text: string; tone: Tone }[];   // 今週の結論(最大3)
  counts: { listing: number; bb: number; apply: number; lockup: number };
  agenda: { date: string; label: string; color: string; name: string }[];   // これから先の期日(直近の順・最大5)
  events: SlideEvent[];        // 来週の予定
  gantt: { from: string; days: number; rows: GanttRow[] };
  lockups: { name: string; ticker: string | null; kind: string; date: string }[];
  companies: CompanyCard[];    // 注目銘柄(最大3)
  market: {
    items: { name: string; value: number; date: string }[];   // 直近の上場(古い順・最大20)
    avg: number | null; median: number | null; up: number; n: number; best: number | null; worst: number | null;
    tone: Tone; toneLabel: string;
  };
  rankUnderwriter: RankRow[];
  rankSector: RankRow[];
  track: { points: TrackPoint[]; byGrade: { grade: string; n: number; avg: number }[] } | null;   // 5件未満は null
}
