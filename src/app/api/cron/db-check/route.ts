import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyAdmin } from "@/lib/notify-admin";

export const maxDuration = 60;

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    const adminPw = req.headers.get("x-admin-password");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && adminPw !== "otemachi9") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

  const supabase = getSupabase();
  const issues: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const in7days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // ① 目論見書取得済みなのにai_summaryがない銘柄
  const { data: noSummary } = await supabase
    .from("ipo_companies")
    .select("name, listing_date")
    .not("raw_prospectus", "is", null)
    .is("ai_summary", null);

  if (noSummary && noSummary.length > 0) {
    issues.push(`⚠️ 目論見書あり・ai_summary未生成（${noSummary.length}件）:\n` +
      noSummary.map(c => `  - ${c.name}（${c.listing_date}）`).join("\n"));
  }

  // ② 上場まで7日以内なのにanalysis_summaryがない銘柄
  const { data: noAnalysis } = await supabase
    .from("ipo_companies")
    .select("name, listing_date")
    .gte("listing_date", today)
    .lte("listing_date", in7days)
    .is("analysis_summary", null);

  if (noAnalysis && noAnalysis.length > 0) {
    issues.push(`🚨 上場7日以内・分析未生成（${noAnalysis.length}件）:\n` +
      noAnalysis.map(c => `  - ${c.name}（${c.listing_date}）`).join("\n"));
  }

  // ③ 上場済みなのにanalysis_summaryがない銘柄
  const { data: listedNoAnalysis } = await supabase
    .from("ipo_companies")
    .select("name, listing_date")
    .lt("listing_date", today)
    .is("analysis_summary", null);

  if (listedNoAnalysis && listedNoAnalysis.length > 0) {
    issues.push(`📋 上場済み・分析未生成（${listedNoAnalysis.length}件）:\n` +
      listedNoAnalysis.map(c => `  - ${c.name}（${c.listing_date}）`).join("\n"));
  }

  // ④ structured_dataがないのにraw_prospectusがある銘柄（Step2未実行）
  const { data: noStructure } = await supabase
    .from("ipo_companies")
    .select("name, listing_date")
    .not("raw_prospectus", "is", null)
    .is("structured_data", null);

  if (noStructure && noStructure.length > 0) {
    issues.push(`⚠️ 目論見書あり・構造化未実施（${noStructure.length}件）:\n` +
      noStructure.map(c => `  - ${c.name}（${c.listing_date}）`).join("\n"));
  }

  // 問題があれば管理者通知
  if (issues.length > 0) {
    await notifyAdmin(
      `DB整合性チェック：${issues.length}件の問題を検出`,
      `確認日時: ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}\n\n` +
      issues.join("\n\n"),
      "warn"
    );
    return NextResponse.json({
      ok: false,
      issues_count: issues.length,
      issues,
      checked_at: new Date().toISOString()
    });
  }

  return NextResponse.json({
    ok: true,
    message: "問題なし",
    checked_at: new Date().toISOString()
  });
}