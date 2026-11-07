import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 2026/11/7新設: 管理画面の「分析の進み具合」の記録。
// 画面を閉じても、どのSTEPまで完了したか(完了日時つき)が分かるように、ipo_companies.analysis_progress(jsonb)に保存する。
//   GET  ?company_id=…  … { progress: 記録済み, inferred: 既存データから推定した完了(この機能の導入前に作った分析用), column_ready }
//   POST { company_id, key, status: "done" | "failed", note? } … 1つのSTEPの結果を記録する(日時はサーバーの時刻)
// このURL(/api/admin/...)は管理画面にログインしている人だけが使える(src/proxy.ts が門番)。
// analysis_progress 列がまだ無いとき(SQL未実行)は、GETは推定だけを返し、POSTは何もせず成功を返す(管理画面の分析は止めない)。
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const KEYS = new Set(["1", "2", "3", "4", "5a", "5b", "5c", "6", "7a", "7b", "7c", "8"]);

const hasObj = (v: any) => !!v && typeof v === "object" && Object.keys(v).length > 0;
const AXES: Record<string, string[]> = {
  "5a": ["float", "lockup", "timing"], "5b": ["valuation", "vc_sell", "growth"], "5c": ["management", "unit_econ", "competitor"],
};
const AXES_COLUMN: Record<string, string> = { "5a": "analysis_axes_short", "5b": "analysis_axes_mid", "5c": "analysis_axes_long" };

// すでに保存されているデータから「完了している」STEPを推定する(日時が分かるものだけ at を付ける)
function infer(co: any): Record<string, { at: string | null }> {
  const out: Record<string, { at: string | null }> = {};
  if (hasObj(co.raw_prospectus)) out["1"] = { at: null };
  if (hasObj(co.analysis_market)) out["2"] = { at: null };
  if (hasObj(co.structured_data)) out["3"] = { at: null };
  if (hasObj(co.analysis_summary)) out["4"] = { at: co.analysis_summary.generated_at ?? null };
  for (const k of ["5a", "5b", "5c"]) {
    const col = co[AXES_COLUMN[k]];
    const ids = AXES[k];
    if (hasObj(col) && ids.every((id) => col[id]?.report)) {
      out[k] = { at: null };
      if (ids.every((id) => col[id]?.report_beginner)) out[k.replace("5", "7")] = { at: null };
    }
  }
  if (hasObj(co.visualization_data)) out["6"] = { at: null };
  const dd = co.analysis_deep_dive;
  if (hasObj(dd) && dd.business_model && dd.story && dd.competitor_diff && dd.long_term_strength) {
    out["8"] = { at: dd.updated_at ?? null };
  }
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const companyId = new URL(req.url).searchParams.get("company_id");
    if (!companyId) return NextResponse.json({ error: "company_id is required" }, { status: 400 });
    const supabase = getSupabase();
    const { data: co, error } = await supabase.from("ipo_companies").select("*").eq("id", companyId).maybeSingle();
    if (error || !co) return NextResponse.json({ error: error?.message ?? "銘柄が見つかりません" }, { status: 404 });
    return NextResponse.json({
      progress: hasObj((co as any).analysis_progress) ? (co as any).analysis_progress : {},
      inferred: infer(co),
      column_ready: "analysis_progress" in (co as any),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { company_id, key, status, note } = await req.json();
    if (!company_id || !KEYS.has(String(key)) || (status !== "done" && status !== "failed")) {
      return NextResponse.json({ error: "リクエストの形式が不正です" }, { status: 400 });
    }
    const supabase = getSupabase();
    const { data: co, error } = await supabase.from("ipo_companies").select("*").eq("id", company_id).maybeSingle();
    if (error || !co) return NextResponse.json({ error: error?.message ?? "銘柄が見つかりません" }, { status: 404 });
    // 列がまだ無い(SQL未実行)なら、何もせずに成功を返す
    if (!("analysis_progress" in (co as any))) return NextResponse.json({ success: true, recorded: false });
    const current = hasObj((co as any).analysis_progress) ? (co as any).analysis_progress : {};
    const next = { ...current, [String(key)]: { status, at: new Date().toISOString(), note: String(note ?? "").slice(0, 300) } };
    const { error: upErr } = await supabase.from("ipo_companies").update({ analysis_progress: next }).eq("id", company_id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    return NextResponse.json({ success: true, recorded: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "error" }, { status: 500 });
  }
}
