// 2026/10/24新設(日本版): 原文(有価証券届出書・目論見書)との照合による校正。
//   Gemini(別会社のAI)が間違い候補を挙げる → Sonnetが原文を読み直して判断し、必要な箇所だけ書き直す。
//   これを最大3回まで繰り返す。管理画面のSTEP4・STEP5の最後に自動で呼ばれる(ボタンは増やさない)。
//   米国版(ipo-scout-us)の仕組みを、日本語の原文向けに作り直したもの。

export type ProofIssue = { field: string; quote: string; kind: string; problem: string; source_quote?: string };
export type ProofChange = { field: string; action: string; before: string; after: string; reason: string };
export type ProofResult = { fields: Record<string, string>; fixed: number; unresolved: ProofIssue[]; changes: ProofChange[]; skipped?: string };

// 分析結果(merged)の中から、事実のチェックが必要な文章だけを取り出す。シナリオなどの見通し・意見は対象外。
export function collectFields(merged: any): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (path: string, v: any) => { if (typeof v === "string" && v.trim().length >= 12) out[path] = v; };
  put("summary", merged?.summary);
  put("summary_beginner", merged?.summary_beginner);
  put("ai_summary", merged?.ai_summary);
  put("appeal_narrative", merged?.appeal_narrative);
  for (const k of ["ultra_short", "short", "long"]) put(`grade_reason.${k}`, merged?.grade_reason?.[k]);
  (merged?.insights ?? []).forEach((x: any, i: number) => {
    put(`insights.${i}.body`, x?.body);
    put(`insights.${i}.detail`, x?.detail);
    put(`insights.${i}.detail_beginner`, x?.detail_beginner);
  });
  return out;
}

// 直した文章を、元の分析結果(merged)へ書き戻す
export function applyFields(merged: any, fields: Record<string, string>) {
  for (const [path, text] of Object.entries(fields)) {
    const keys = path.split(".");
    let cur: any = merged;
    for (let i = 0; i < keys.length - 1; i++) {
      cur = cur?.[keys[i]];
      if (cur == null) break;
    }
    if (cur != null && typeof cur === "object") cur[keys[keys.length - 1]] = text;
  }
}

async function post(body: any): Promise<any> {
  const res = await fetch("/api/admin/proofread", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const keyOf = (i: { field: string; quote: string }) => `${i.field}@@${i.quote}`;
void keyOf;

// 確認済み(問題なし)の箇所と、ほぼ同じ箇所かどうか(同じ欄で、8文字以上の共通部分がある)
function sharesRun(a: string, b: string, n = 8): boolean {
  if (a.includes(b) || b.includes(a)) return true;
  for (let i = 0; i + n <= a.length; i++) if (b.includes(a.slice(i, i + n))) return true;
  return false;
}
const sameSpot = (a: ProofIssue, k: ProofIssue) => a.field === k.field && sharesRun(a.quote, k.quote);

// 照合→書き直しを、問題がなくなるまで最大3回行い、それでも残ったものは「強制決着」で必ず終わらせる。
//  ・Sonnetが「Geminiの指摘は誤り(原文どおり)」と判断した箇所は、以後の照合で再び指摘させない(最終判断はSonnet)
//  ・3回目は「最後の見直し」として、確認できないものは削る・ぼかす形で決着させる
//  ・それでも残ったものは、Sonnetが決められなければ、その文を削除する(誤った記述を残さない)
//  ・直した内容(直す前と後の文)は changes に残し、管理画面で読めるようにする
//  途中で失敗しても、元の文章はそのまま返す(保存は止めない)。
//  1回の呼び出し(check / fix)は、それぞれ別の通信なので、全体が長くなってもサーバーの時間制限には当たらない。
export async function runProofread(
  companyId: string,
  startFields: Record<string, string>,
  onProgress?: (msg: string) => void,
): Promise<ProofResult> {
  let fields = { ...startFields };
  if (Object.keys(fields).length === 0) return { fields, fixed: 0, unresolved: [], changes: [] };
  const MAX_ROUNDS = 3;
  let fixed = 0;
  const changes: ProofChange[] = [];
  const kept: ProofIssue[] = []; // Sonnetが「問題なし」と判断した箇所
  let unresolved: ProofIssue[] = [];
  const absorb = (fx: any) => {
    for (const r of fx.results ?? []) {
      if (r.verdict === "keep") kept.push(r.issue);
      else if (r.applied) changes.push({ field: r.issue.field, action: r.verdict, before: String(r.before ?? ""), after: String(r.after ?? ""), reason: String(r.reason ?? "") });
    }
    fields = fx.fields ?? fields;
    fixed += fx.applied ?? 0;
  };
  const notKept = (list: any[]): ProofIssue[] => (list ?? []).filter((i: ProofIssue) => !kept.some(k => sameSpot(i, k)));
  try {
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      onProgress?.(`原文と照合中(${round}/${MAX_ROUNDS})...`);
      const chk = await post({ action: "check", company_id: companyId, fields, ignore: kept.slice(-30) });
      const issues = notKept(chk.issues);
      if (issues.length === 0) return { fields, fixed, unresolved: [], changes };
      onProgress?.(`指摘${issues.length}件を、Sonnetが原文で再確認して修正中(${round}/${MAX_ROUNDS})...`);
      const fx = await post({ action: "fix", company_id: companyId, fields, issues, round, final: round === MAX_ROUNDS });
      absorb(fx);
      unresolved = (fx.results ?? []).filter((r: any) => r.verdict !== "keep" && !r.applied).map((r: any) => r.issue);
    }
    // 最後の書き直しのあとの最終確認。まだ指摘が残るなら、強制決着で必ず終わらせる
    onProgress?.("最終確認中...");
    const last = await post({ action: "check", company_id: companyId, fields, ignore: kept.slice(-30) });
    const rest = notKept(last.issues);
    if (rest.length > 0) {
      onProgress?.(`残り${rest.length}件を、Sonnetが最終判断中...`);
      const fx = await post({ action: "fix", company_id: companyId, fields, issues: rest, round: MAX_ROUNDS + 1, final: true, force: true });
      absorb(fx);
    }
    return { fields, fixed, unresolved: [], changes };
  } catch (e: any) {
    return { fields, fixed, unresolved, changes, skipped: String(e?.message ?? e).slice(0, 120) };
  }
}
