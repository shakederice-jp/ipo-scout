import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const resend = new Resend(process.env.RESEND_API_KEY);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST() {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

  // 明日BB開始・申込開始・上場の銘柄を取得
  const { data: companies } = await supabase
    .from("ipo_companies")
    .select("*")
    .or(`bb_start_date.eq.${tomorrow},apply_start_date.eq.${tomorrow},listing_date.eq.${tomorrow}`);

  if (!companies || companies.length === 0) {
    return NextResponse.json({ message: "通知対象なし", sent: 0 });
  }

  // 通知設定を取得（company_idがnullのもの＝全銘柄通知）
  const { data: settings } = await supabase
    .from("notification_settings")
    .select("user_id, notify_bb, notify_apply, notify_listing, method_email")
    .eq("method_email", true);

  if (!settings || settings.length === 0) {
    return NextResponse.json({ message: "通知ユーザーなし", sent: 0 });
  }

  // ユーザーのメールアドレスをauth.usersから取得
  const userIds = [...new Set(settings.map(s => s.user_id))];
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const emailMap: Record<string, string> = {};
  users.forEach(u => { if (u.email) emailMap[u.id] = u.email; });

  let sent = 0;

  for (const setting of settings) {
    const email = emailMap[setting.user_id];
    if (!email) continue;

    const targets = companies.filter(c => {
      const isBB      = c.bb_start_date    === tomorrow && setting.notify_bb;
      const isApply   = c.apply_start_date === tomorrow && setting.notify_apply;
      const isListing = c.listing_date     === tomorrow && setting.notify_listing;
      return isBB || isApply || isListing;
    });

    if (targets.length === 0) continue;

    const items = targets.map(c => {
      const type = c.listing_date === tomorrow ? "上場日" 
        : c.bb_start_date === tomorrow ? "BB開始" : "申込開始";
      return `<li><strong>${c.name}</strong>（${c.ticker ?? ""}）— 明日<strong>${type}</strong></li>`;
    }).join("");

    try {
      await resend.emails.send({
        from:    "IPO分析レポート <noreply@ipo-jp.vercel.app>",
        to:      email,
        subject: `【IPO通知】明日${targets.length}件のIPOイベントがあります（${tomorrow}）`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f4fbfc">
            <div style="background:#0d4f52;padding:16px 24px;border-radius:12px 12px 0 0">
              <h2 style="color:white;margin:0;font-size:16px">📊 IPO企業情報AI分析レポート</h2>
              <p style="color:#a0d4d6;margin:4px 0 0;font-size:12px">担当：大手町調査室九課</p>
            </div>
            <div style="background:white;padding:24px;border-radius:0 0 12px 12px;border:1px solid #b3e8ea">
              <p style="color:#082b2e;font-size:14px">明日（${tomorrow}）に以下のIPOイベントがあります：</p>
              <ul style="line-height:2;color:#0d4f52;font-size:14px">${items}</ul>
              <a href="https://ipo-jp.vercel.app"
                style="display:inline-block;padding:12px 24px;background:#66c3c6;color:white;text-decoration:none;border-radius:8px;font-weight:bold;margin-top:16px;font-size:14px">
                分析レポートを確認する →
              </a>
              <p style="margin-top:24px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px">
                このメールは通知設定を有効にしているユーザーに送信されています。<br/>
                © 大手町調査室九課
              </p>
            </div>
          </div>
        `,
      });
      sent++;
    } catch (e) {
      console.error(`メール送信失敗: ${email}`, e);
    }
  }

  // 送信ログを記録
  await supabase.from("notification_logs").insert({
    sent_at:    new Date().toISOString(),
    recipients: sent,
    companies:  companies.map(c => c.name).join(", "),
  });

  return NextResponse.json({ success: true, sent, companies: companies.length });
}