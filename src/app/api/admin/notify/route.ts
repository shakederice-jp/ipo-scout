import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const resend = new Resend(process.env.RESEND_API_KEY);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST() {
  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

  // 明日BB開始・申込開始の銘柄を取得
  const { data: companies } = await supabase
    .from("ipo_companies")
    .select("*")
    .or(`bb_start_date.eq.${tomorrow},apply_start_date.eq.${tomorrow}`);

  if (!companies || companies.length === 0) {
    return NextResponse.json({ message: "通知対象なし", sent: 0 });
  }

  // 通知設定を持つユーザーを取得
  const { data: settings } = await supabase
    .from("notification_settings")
    .select("user_id, email, notify_bb, notify_apply")
    .eq("enabled", true);

  if (!settings || settings.length === 0) {
    return NextResponse.json({ message: "通知ユーザーなし", sent: 0 });
  }

  let sent = 0;

  for (const setting of settings) {
    const targets = companies.filter(c => {
      const isBB    = c.bb_start_date    === tomorrow && setting.notify_bb;
      const isApply = c.apply_start_date === tomorrow && setting.notify_apply;
      return isBB || isApply;
    });

    if (targets.length === 0) continue;

    const items = targets.map(c => {
      const type = c.bb_start_date === tomorrow ? "BB開始" : "申込開始";
      return `<li><strong>${c.name}</strong>（${c.ticker}）— 明日${type}</li>`;
    }).join("");

    await resend.emails.send({
      from:    "IPO分析レポート <onboarding@resend.dev>",
      to:      setting.email,
      subject: `【IPO通知】明日${targets.length}件のIPOイベントがあります`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="color:#082b2e">📊 IPO企業情報AI分析レポート</h2>
          <p>明日（${tomorrow}）に以下のIPOイベントがあります：</p>
          <ul style="line-height:2">${items}</ul>
          <a href="https://ipo-scout-six.vercel.app/calendar"
            style="display:inline-block;padding:12px 24px;background:#66c3c6;color:white;text-decoration:none;border-radius:8px;font-weight:bold;margin-top:16px">
            カレンダーを確認する →
          </a>
          <p style="margin-top:24px;font-size:12px;color:#999">
            通知設定の変更は設定画面から行えます。
          </p>
        </div>
      `,
    });
    sent++;
  }

  // 送信ログを記録
  await supabase.from("notification_logs").insert({
    sent_at:    new Date().toISOString(),
    recipients: sent,
    companies:  companies.map(c => c.name).join(", "),
  });

  return NextResponse.json({ success: true, sent, companies: companies.length });
}