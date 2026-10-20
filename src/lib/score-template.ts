// 2026/10/20新設: AI評価のスコアが「プロンプトの出力例の数字」のコピーになっていた不具合への対策。
// 不具合: 分析プロンプト(src/app/api/analyze/route.ts)の出力例に、総合65点・B・9軸の具体的な数字が
// 書かれており、AIがそれをそのまま返していた(複数の銘柄で、9軸が同じ並びになっていた)。
// ・プロンプトは修正済み。ここでは「例と同じ並びのスコア」を見分ける関数を置く。
// ・週刊スライドなど、AI評価を見せる画面は、これに当てはまる銘柄の評価を出さない。
// ・管理画面の「スコア作り直し」(/api/admin/rescore)が、これを使って対象の銘柄を探す。

export const TEMPLATE_AXES: Record<string, number> = {
  float: 65, lockup: 60, timing: 70, valuation: 55, vc_sell: 50,
  growth: 75, management: 65, unit_econ: 60, competitor: 55,
};

export const AXIS_IDS = ["float", "lockup", "timing", "valuation", "vc_sell", "growth", "management", "unit_econ", "competitor"] as const;

// axes_scores が、例の数字と同じ並びか(同じ並びなら true)
export function isTemplateAxes(axes: unknown): boolean {
  if (!axes || typeof axes !== "object") return false;
  const a = axes as Record<string, unknown>;
  return AXIS_IDS.every((id) => Number(a[id]) === TEMPLATE_AXES[id]);
}

// 上場前のAI評価として信頼できるか(例の数字のコピーでなく、9軸がそろっている)
export function isTrustedScore(summary: any): boolean {
  if (!summary || typeof summary.total_score !== "number") return false;
  const a = summary.axes_scores;
  if (!a || typeof a !== "object") return false;
  if (!AXIS_IDS.every((id) => typeof a[id] === "number" && Number.isFinite(a[id]))) return false;
  return !isTemplateAxes(a);
}

export function gradeFromScore(score: number): "A" | "B" | "C" | "D" | "E" {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "E";
}

const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

// AIが返した採点を検査して、保存用に整える(だめなら理由つきで null)
export function normalizeScoreResult(r: any): { ok: true; value: any } | { ok: false; reason: string } {
  const ax = r?.axes_scores;
  if (!ax || typeof ax !== "object") return { ok: false, reason: "axes_scores がありません" };
  const scores: Record<string, number> = {};
  for (const id of AXIS_IDS) {
    const v = Number(ax[id]);
    if (!Number.isFinite(v) || v < 0 || v > 100) return { ok: false, reason: `${id} の点数が不正です` };
    scores[id] = Math.round(v);
  }
  if (isTemplateAxes(scores)) return { ok: false, reason: "例の数字と同じ並びでした" };
  const vals = AXIS_IDS.map((id) => scores[id]);
  if (new Set(vals).size <= 2) return { ok: false, reason: "9軸にほとんど差がありません" };

  const mean = avg(vals);
  let total = Number(r?.total_score);
  if (!Number.isFinite(total)) total = mean;
  total = Math.round(Math.min(mean + 5, Math.max(mean - 5, total)));   // 9軸の平均のプラスマイナス5点以内
  total = Math.max(0, Math.min(100, total));

  const grp = (ids: string[]) => gradeFromScore(avg(ids.map((i) => scores[i])));
  return {
    ok: true,
    value: {
      axes_scores: scores,
      total_score: total,
      grade: gradeFromScore(total),
      ultra_short_grade: grp(["float", "lockup", "timing"]),
      short_grade: grp(["valuation", "vc_sell", "growth"]),
      long_grade: grp(["management", "unit_econ", "competitor"]),
      grade_reason: r?.grade_reason && typeof r.grade_reason === "object" ? r.grade_reason : null,
    },
  };
}
