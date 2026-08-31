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
  const in30days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

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

 // ② 上場まで7日以内なのにanalysis_summaryがない銘柄（緊急度：高）
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

// ②-B 上場まで8〜30日なのにanalysis_summaryがない銘柄（早期警告・緊急度：中）
const { data: noAnalysisEarly } = await supabase
 .from("ipo_companies")
 .select("name, listing_date")
 .gt("listing_date", in7days)
 .lte("listing_date", in30days)
 .is("analysis_summary", null);

if (noAnalysisEarly && noAnalysisEarly.length > 0) {
 issues.push(`📅 上場8〜30日先・分析未生成（早めの対応推奨、${noAnalysisEarly.length}件）:\n` +
   noAnalysisEarly.map(c => `  - ${c.name}（${c.listing_date}）`).join("\n"));
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

  // ⑤ 重複登録の疑いがある銘柄
  // 2026/8/31追記: 「かがやきホールディングス」と「かがやきホールディングス株式会社」が
  // 別々の行として二重登録される事故が発覚したことを受けて追加。株式会社等の法人格表記や
  // 空白の違いを無視して社名を正規化し、同じ会社とみられる行が複数あれば警告する。
  const { data: allForDupCheck } = await supabase
    .from("ipo_companies")
    .select("id, name, listing_date");

  if (allForDupCheck) {
    const normalize = (s: string) => s
      .replace(/株式会社|㈱|（株）|\(株\)|合同会社|有限会社/g, "")
      .replace(/[\s　]/g, "")
      .trim();
    const groups = new Map<string, { id: string; name: string; listing_date: string | null }[]>();
    for (const c of allForDupCheck) {
      const key = normalize(c.name);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    }
    const dupGroups = Array.from(groups.values()).filter(g => g.length > 1);
    if (dupGroups.length > 0) {
      issues.push(`🚨 重複登録の疑いがある銘柄（${dupGroups.length}件）:\n` +
        dupGroups.map(g => `  - ${g.map(c => `「${c.name}」（${c.listing_date ?? "日付未定"}）`).join(" と ")}`).join("\n") +
        `\n  → admin画面の「🛠 手動実行ツール」内「🗑 銘柄を削除」で、不要な方を削除してください。`);
    }
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