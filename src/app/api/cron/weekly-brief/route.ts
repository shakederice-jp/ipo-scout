import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { notifyAdmin, ADMIN_EMAIL } from "@/lib/notify-admin";
import { canReadPaidAnalysis } from "@/lib/member-auth";
import { loadBriefData, hasBriefContent, briefSubject, buildBriefHtml } from "@/lib/weekly-brief";
import { unsubscribeUrl } from "@/lib/weekly-brief-token";

// 2026/10/20新設(案2): 週刊ブリーフ「IPO週報」を、毎週金曜18時に配信する。
// 使い方(いずれも Authorization: Bearer <CRON_SECRET> が必要):
//   /api/cron/weekly-brief              … 配信を希望した会員(weekly_brief_subscribers)全員に送る
//   /api/cron/weekly-brief?test=1       … 管理者(自分)だけに、無料版と有料版を1通ずつ送る
//   /api/cron/weekly-brief?preview=1    … 画面に無料版のHTMLを表示する(送らない)。&paid=1 で有料版
export const maxDuration = 60;

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "IPO分析レポート <noreply@finance-tower.com>";
const MAX_RECIPIENTS = 300; // 1回の実行時間(60秒)に収めるための上限。増えたら分割送信にする

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sp = new URL(req.url).searchParams;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const data = await loadBriefData(supabase);
  if (!hasBriefContent(data)) {
    return NextResponse.json({ message: "今週は載せる内容が無いため、送信しませんでした", sent: 0 });
  }
  const subject = briefSubject(data);

  // ── プレビュー(送らない) ──
  if (sp.get("preview") === "1") {
    const html = buildBriefHtml(data, { paid: sp.get("paid") === "1", unsubscribeUrl: "https://ipo.finance-tower.com/mypage" });
    return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  // ── テスト送信(管理者だけ) ──
  if (sp.get("test") === "1") {
    for (const paid of [false, true]) {
      await resend.emails.send({
        from: FROM,
        to: ADMIN_EMAIL,
        subject: `【テスト・${paid ? "有料版" : "無料版"}】${subject}`,
        html: buildBriefHtml(data, { paid, unsubscribeUrl: "https://ipo.finance-tower.com/mypage" }),
      });
    }
    return NextResponse.json({ success: true, test: true, sentTo: ADMIN_EMAIL });
  }

  // ── 本番送信 ──
  const { data: subs } = await supabase
    .from("weekly_brief_subscribers")
    .select("user_id")
    .order("created_at", { ascending: true })
    .limit(MAX_RECIPIENTS);
  const ids = (subs ?? []).map((s: any) => s.user_id as string);
  if (ids.length === 0) return NextResponse.json({ message: "配信希望の会員がいません", sent: 0 });

  // 既存の週次通知メール(/api/cron/notify)を受け取っている会員には、重複して送らない
  const { data: digestUsers } = await supabase
    .from("notification_settings")
    .select("user_id")
    .is("company_id", null)
    .eq("method_email", true)
    .in("user_id", ids);
  const skip = new Set((digestUsers ?? []).map((r: any) => r.user_id as string));

  const { data: profiles } = await supabase.from("user_profiles").select("id, plan, free_until").in("id", ids);
  const profileMap = new Map<string, any>((profiles ?? []).map((p: any) => [p.id, p]));

  let sent = 0, skipped = 0, failed = 0;
  for (const id of ids) {
    if (skip.has(id)) { skipped++; continue; }
    try {
      const { data: u } = await supabase.auth.admin.getUserById(id);
      const email = u?.user?.email;
      if (!email) { skipped++; continue; }
      const paid = canReadPaidAnalysis(profileMap.get(id));
      const { error } = await resend.emails.send({
        from: FROM,
        to: email,
        subject,
        html: buildBriefHtml(data, { paid, unsubscribeUrl: unsubscribeUrl(id) }),
      });
      if (error) { failed++; console.error("IPO週報の送信エラー:", error); } else { sent++; }
    } catch (e) {
      failed++;
      console.error("IPO週報の送信失敗:", e);
    }
  }

  await notifyAdmin(
    "IPO週報の送信結果",
    `送信: ${sent}件\n重複回避でスキップ: ${skipped}件\n失敗: ${failed}件\n対象期間: ${data.nextMon}〜${data.nextSun}`,
    failed > 0 ? "warn" : "info"
  );
  return NextResponse.json({ success: true, sent, skipped, failed });
}
