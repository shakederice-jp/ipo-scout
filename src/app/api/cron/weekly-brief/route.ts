import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { notifyAdmin, ADMIN_EMAIL } from "@/lib/notify-admin";
import { canReadPaidAnalysis } from "@/lib/member-auth";
import { loadBriefData, hasBriefContent, briefSubject, buildBriefHtml } from "@/lib/weekly-brief";
import { unsubscribeUrl, guestUrl } from "@/lib/weekly-brief-token";
import { latestPublishedSlide } from "@/lib/weekly-slides-store";

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
  const t0 = Date.now();
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
  // 今週号のPDFスライドが公開済みなら、有料会員向けのメールにだけリンクを付ける(2026/10/20追加)
  const slide = await latestPublishedSlide(supabase).catch(() => null);
  const slidesUrl = slide && slide.issue_date === data.thisFri ? "https://ipo.finance-tower.com/mypage" : undefined;

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
        html: buildBriefHtml(data, { paid, unsubscribeUrl: "https://ipo.finance-tower.com/mypage", slidesUrl: paid ? slidesUrl : undefined }),
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

  // 既存の週次通知メール(/api/cron/notify)を受け取っている会員には、重複して送らない
  const { data: digestUsers } = ids.length === 0 ? { data: [] as any[] } : await supabase
    .from("notification_settings")
    .select("user_id")
    .is("company_id", null)
    .eq("method_email", true)
    .in("user_id", ids);
  const skip = new Set((digestUsers ?? []).map((r: any) => r.user_id as string));

  const { data: profiles } = ids.length === 0 ? { data: [] as any[] } : await supabase.from("user_profiles").select("id, plan, free_until").in("id", ids);
  const profileMap = new Map<string, any>((profiles ?? []).map((p: any) => [p.id, p]));

  let sent = 0, skipped = 0, failed = 0;
  const memberEmails = new Set<string>(); // 会員に送ったメールアドレス(メールだけ登録の人と重複して送らないため)
  for (const id of ids) {
    if (skip.has(id)) { skipped++; continue; }
    try {
      const { data: u } = await supabase.auth.admin.getUserById(id);
      const email = u?.user?.email;
      if (!email) { skipped++; continue; }
      memberEmails.add(email.toLowerCase());
      const paid = canReadPaidAnalysis(profileMap.get(id));
      const { error } = await resend.emails.send({
        from: FROM,
        to: email,
        subject,
        html: buildBriefHtml(data, { paid, unsubscribeUrl: unsubscribeUrl(id), slidesUrl }),
      });
      if (error) { failed++; console.error("IPO週報の送信エラー:", error); } else { sent++; }
    } catch (e) {
      failed++;
      console.error("IPO週報の送信失敗:", e);
    }
  }

  // ── メールアドレスだけで申し込み(確認メールで本人確認済み)の人へ。無料版を送る ──
  // 2026/11/1追加(集客施策2)。実行時間(60秒)に収めるため、50秒を超えたら残りは次回に回す。
  let guestSent = 0, guestSkipped = 0, guestFailed = 0, guestLeft = 0;
  const { data: guests } = await supabase
    .from("weekly_brief_guests")
    .select("id, email")
    .not("confirmed_at", "is", null)
    .order("created_at", { ascending: true })
    .limit(MAX_RECIPIENTS);
  const guestList = (guests ?? []) as { id: string; email: string }[];
  for (let i = 0; i < guestList.length; i++) {
    const g = guestList[i];
    if (Date.now() - t0 > 50_000) { guestLeft = guestList.length - i; break; }
    if (memberEmails.has(g.email.toLowerCase())) { guestSkipped++; continue; }
    try {
      const { error } = await resend.emails.send({
        from: FROM,
        to: g.email,
        subject,
        html: buildBriefHtml(data, { paid: false, unsubscribeUrl: guestUrl(g.id, "stop") }),
      });
      if (error) { guestFailed++; console.error("IPO週報(メール登録)の送信エラー:", error); } else { guestSent++; }
    } catch (e) {
      guestFailed++;
      console.error("IPO週報(メール登録)の送信失敗:", e);
    }
  }

  await notifyAdmin(
    "IPO週報の送信結果",
    `会員 送信: ${sent}件 / 重複回避でスキップ: ${skipped}件 / 失敗: ${failed}件\nメール登録のみ 送信: ${guestSent}件 / スキップ: ${guestSkipped}件 / 失敗: ${guestFailed}件${guestLeft > 0 ? ` / 時間切れで未送信: ${guestLeft}件` : ""}\n対象期間: ${data.nextMon}〜${data.nextSun}`,
    failed + guestFailed > 0 || guestLeft > 0 ? "warn" : "info"
  );
  return NextResponse.json({ success: true, sent, skipped, failed, guestSent, guestSkipped, guestFailed, guestLeft });
}
