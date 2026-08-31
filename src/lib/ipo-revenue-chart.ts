// インフォグラフィック画像に載せる「売上高・経常利益の推移」棒グラフ用のデータを組み立てる。
// STEP3(財務データを構造化)で保存されるstructured_data.key_metricsは、
// 目論見書の「主要な経営指標等の推移」表をそのままJSON化したもので、
// revenueやordinary_profitは "1,456,789千円" のような文字列(カンマ・単位付き)で入っている。
// ここではそれを数値化し、読みやすい「億円」単位のグラフ用データ配列に変換する。
// (2026/8/29、インフォグラフィックを「スコア+ひとことインサイト」から
//  「実際のデータを可視化したグラフ」中心のデザインに刷新した際に追加)
//
// 2026/8/29 追記: 「売上は伸びているが利益は赤字」という構造を同時に見せたいとの要望を受け、
// 経常利益(ordinary_profit)もあわせて抽出するようにした。経常損失は目論見書上
// "△195,336千円" のように△(または▲・マイナス)付きで記載されるため、符号付きで
// パースするparseSignedThousandYen()を新設した(売上高用のparseThousandYenは
// 「0以下は記載なし扱い」で除外する仕様のため、赤字を表現できる符号付き専用の関数が必要)。

export interface RevenueChartPoint {
  label: string; // 例: "25/3期"
  value: number; // 売上高・億円換算・小数点1桁
  profit: number | null; // 経常利益・億円換算・小数点1桁。赤字はマイナス値。読み取れない場合はnull
}

// "1,456,789千円" のような文字列から数値(千円単位)を取り出す。
// "目論見書に記載なし"や空文字など数値化できないものはnullを返す。
function parseThousandYen(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/[^0-9.]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

// "△195,336千円"(赤字)・"98,765千円"(黒字)のような文字列を符号付きの数値(千円単位)にする。
// 売上高用のparseThousandYenと異なり、0以下(赤字)も有効な値として扱う。
function parseSignedThousandYen(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const isNegative = /[△▲-]/.test(raw);
  const digits = raw.replace(/[^0-9.]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isFinite(n)) return null;
  return isNegative ? -n : n;
}

// "2025年3月期" のような決算期表記を、グラフの横軸に収まる短い表記("25/3期")に変換する。
// 想定外の表記の場合は、先頭6文字程度を返す(表示が極端に長くならないための保険)。
function shortenPeriodLabel(period: unknown): string {
  if (typeof period !== "string" || !period) return "";
  const m = period.match(/(\d{4})年(\d{1,2})月期/);
  if (m) return `${m[1].slice(2)}/${m[2]}期`;
  return period.length > 6 ? period.slice(0, 6) : period;
}

// key_metrics配列(古い期→新しい期の順)から、売上高・経常利益の推移グラフ用データを作る。
// maxPointsを超える場合は、直近(配列の末尾側)のものだけを使う。
export function buildRevenueChartData(keyMetrics: unknown, maxPoints: number = 5): RevenueChartPoint[] {
  if (!Array.isArray(keyMetrics)) return [];
  const points: RevenueChartPoint[] = [];
  for (const km of keyMetrics) {
    const thousandYen = parseThousandYen((km as any)?.revenue);
    if (thousandYen == null) continue;
    // 千円 → 億円 (1億円 = 100,000千円)
    const oku = Math.round((thousandYen / 100000) * 10) / 10;
    const profitThousandYen = parseSignedThousandYen((km as any)?.ordinary_profit);
    const profitOku = profitThousandYen == null ? null : Math.round((profitThousandYen / 100000) * 10) / 10;
    points.push({ label: shortenPeriodLabel((km as any)?.period), value: oku, profit: profitOku });
  }
  return points.slice(-maxPoints);
}

// 2026/8/30追記: 「トレンド記事本文の売上高」と「インフォグラフィック画像内のグラフ」で
// 数字が食い違う不具合(オリバー社で発覚)への対処。
// 原因は、STEP3(構造化)が「売上推移」を、①目論見書の表をそのまま数値抽出したkey_metrics(構造化配列)と、
// ②AIが自由記述で書くfinancials.revenue_trend(文章、千円→億円換算もAI任せ)という
// 2つの独立した項目として生成しており、両者の間で整合性を取る仕組みが無かったこと。
// インフォグラフィックのグラフは①(key_metrics)由来、トレンド記事本文(appeal_narrative)を
// 書くAIに渡す実データノートは②(revenue_trend)由来になっていたため、②側でAIが
// 単位換算や期の対応を誤ると、画像と本文の数字がずれて見える状態になっていた。
// 恒久対策として、記事本文生成に渡す「売上推移」「利益推移」の文章も、
// このbuildRevenueChartData()と同じ①(key_metrics)から機械的に組み立てる(=情報源を一本化する)。
// これにより、画像と本文は常に同じ数字(key_metrics)を参照するようになり、
// AIの自由記述による食い違いは構造的に起こらなくなる。
export function formatKeyMetricsTrend(keyMetrics: unknown): { revenueTrend: string | null; profitTrend: string | null } {
  const points = buildRevenueChartData(keyMetrics, 5);
  if (points.length === 0) return { revenueTrend: null, profitTrend: null };

  const revenueTrend = points
    .filter(p => p.label)
    .map(p => `${p.label}${p.value}億円`)
    .join("→");

  const profitPoints = points.filter(p => p.label && p.profit != null);
  const profitTrend = profitPoints.length > 0
    ? profitPoints.map(p => `${p.label}${p.profit}億円`).join("→")
    : null;

  return { revenueTrend: revenueTrend || null, profitTrend };
}
