// インフォグラフィック画像に載せる「超短期・短期・長期」投資家向けスコアを計算する。
// 分析ページ(src/components/AnalysisClient.tsx)の9軸詳細分析と同じ考え方で、
// 各グループに属する軸(axis)のscoreを単純平均・四捨五入したものを使う。
//
// ipo_companiesテーブルのanalysis_axes_short/analysis_axes_mid/analysis_axes_long列は、
// STEP5(9軸 詳細分析、管理画面上の表示ラベル)が完了して初めて値が入るJSON列
// (軸ID→軸データのオブジェクト、各軸データがscoreフィールドを持つ)。
// STEP5がまだ実行されていない銘柄では3つともnullになるため、呼び出し側は
// nullの場合インフォグラフィックにこの項目自体を表示しない(2026/8/29、
// 「未定」プレースホルダーを見せないという既存方針と同じ考え方)。
//
// 注意: 分析ページ側の列名・変数名の対応がやや分かりにくい。
// DBのanalysis_axes_short列は実際には「超短期(ultra_short)」グループに、
// analysis_axes_mid列は「短期(short)」グループに対応する
// (AnalysisClient.tsxのaxes.ultra_short / axes.shortにそれぞれ対応)。
// ここでも同じ対応関係を踏襲する。

export interface AxisGroupScores {
  ultraShort: number | null; // 超短期(初値売り・当日トレード)
  short: number | null;      // 短期(数週間〜数ヶ月)
  long: number | null;       // 長期(数年〜)
}

function avgScore(group: unknown): number | null {
  if (!group || typeof group !== "object") return null;
  const items = Object.values(group as Record<string, any>).filter(
    (x) => x && typeof x.score === "number" && Number.isFinite(x.score)
  );
  if (items.length === 0) return null;
  const sum = items.reduce((s: number, x: any) => s + x.score, 0);
  return Math.round(sum / items.length);
}

export function computeAxisGroupScores(axesShort: unknown, axesMid: unknown, axesLong: unknown): AxisGroupScores {
  return {
    ultraShort: avgScore(axesShort),
    short: avgScore(axesMid),
    long: avgScore(axesLong),
  };
}

// 2026/9/4追加: インフォグラフィックの9軸レーダーチャート用に、
// 3グループ(analysis_axes_short/mid/long)から9軸それぞれの個別スコアを
// 抽出する。AXIS_CONFIG(src/app/api/axes/route.ts)のaxes配列と同じ順序・
// 軸IDを使う。いずれかのグループが未生成(null)の場合、そのグループに
// 属する3軸はnullのまま返す(呼び出し側はnullの軸を除いて描画する)。
export interface RadarAxisScore {
  id: string;
  label: string; // インフォグラフィック上の短いラベル
  score: number | null;
}

const RADAR_AXIS_ORDER: { id: string; label: string; group: "ultra_short" | "short" | "long" }[] = [
  { id: "float", label: "需給", group: "ultra_short" },
  { id: "lockup", label: "ロックアップ", group: "ultra_short" },
  { id: "timing", label: "上場タイミング", group: "ultra_short" },
  { id: "valuation", label: "バリュエーション", group: "short" },
  { id: "vc_sell", label: "VC売圧", group: "short" },
  { id: "growth", label: "成長性", group: "short" },
  { id: "management", label: "経営陣", group: "long" },
  { id: "unit_econ", label: "収益性", group: "long" },
  { id: "competitor", label: "競合環境", group: "long" },
];

function scoreOf(group: unknown, axisId: string): number | null {
  if (!group || typeof group !== "object") return null;
  const item = (group as Record<string, any>)[axisId];
  return item && typeof item.score === "number" && Number.isFinite(item.score) ? item.score : null;
}

export function computeIndividualAxisScores(axesShort: unknown, axesMid: unknown, axesLong: unknown): RadarAxisScore[] {
  const groups = { ultra_short: axesShort, short: axesMid, long: axesLong };
  return RADAR_AXIS_ORDER.map(({ id, label, group }) => ({
    id,
    label,
    score: scoreOf(groups[group], id),
  }));
}
