import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { notifyAdmin } from '@/lib/notify-admin';

export const maxDuration = 60;

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 翌週月曜〜日曜の範囲を計算
  const dow = today.getDay();
  const daysUntilMonday = dow === 0 ? 1 : 8 - dow;
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + daysUntilMonday);
  const nextSunday = new Date(nextMonday);
  nextSunday.setDate(nextMonday.getDate() + 6);

  const fromDate = nextMonday.toISOString().slice(0, 10);
  const toDate   = nextSunday.toISOString().slice(0, 10);

  // 翌週のBB開始・申込開始・上場銘柄を取得
  const [{ data: bbList }, { data: applyList }, { data: listingList }] = await Promise.all([
    supabase.from('ipo_companies').select('id,name,ticker,bb_start_date').gte('bb_start_date', fromDate).lte('bb_start_date', toDate),
    supabase.from('ipo_companies').select('id,name,ticker,apply_start_date').gte('apply_start_date', fromDate).lte('apply_start_date', toDate),
    supabase.from('ipo_companies').select('id,name,ticker,listing_date').gte('listing_date', fromDate).lte('listing_date', toDate),
  ]);

  const hasAny = (bbList?.length ?? 0) + (applyList?.length ?? 0) + (listingList?.length ?? 0) > 0;
  if (!hasAny) {
    return NextResponse.json({ message: '翌週の通知対象なし', sent: 0 });
  }

  // 通知設定を取得
  const { data: settings } = await supabase
    .from('notification_settings')
    .select('user_id, notify_bb, notify_apply, notify_listing, method_email')
    .eq('method_email', true);

  if (!settings || settings.length === 0) {
    return NextResponse.json({ message: '通知ユーザーなし', sent: 0 });
  }

  // auth.usersからメールアドレス取得
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const emailMap: Record<string, string> = {};
  users.forEach(u => { if (u.email) emailMap[u.id] = u.email; });

  const formatDate = (d: string) => {
    const dt = new Date(d);
    const dow = ["日","月","火","水","木","金","土"][dt.getDay()];
    return `${dt.getMonth()+1}/${dt.getDate()}（${dow}）`;
  };

  let sentCount = 0;

  for (const setting of settings) {
    const email = emailMap[setting.user_id];
    if (!email) continue;

    const rows: string[] = [];

    if (setting.notify_bb && bbList?.length) {
      bbList.forEach(c => {
        rows.push(`<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0"><strong>${c.name}</strong>（${c.ticker ?? ""}）</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#0369a1;font-weight:700">BB開始</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${formatDate(c.bb_start_date)}</td></tr>`);
      });
    }
    if (setting.notify_apply && applyList?.length) {
      applyList.forEach(c => {
        rows.push(`<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0"><strong>${c.name}</strong>（${c.ticker ?? ""}）</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#d97706;font-weight:700">申込開始</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${formatDate(c.apply_start_date)}</td></tr>`);
      });
    }
    if (setting.notify_listing && listingList?.length) {
      listingList.forEach(c => {
        rows.push(`<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0"><strong>${c.name}</strong>（${c.ticker ?? ""}）</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#15803d;font-weight:700">上場日</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${formatDate(c.listing_date)}</td></tr>`);
      });
    }

    if (rows.length === 0) continue;

    try {
      await resend.emails.send({
        from: 'IPO分析レポート <noreply@ipo-jp.vercel.app>',
        to: email,
        subject: `【IPO週次通知】翌週（${fromDate}〜${toDate}）のIPOイベント`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f4fbfc">
            <div style="background:#0d4f52;padding:16px 24px;border-radius:12px 12px 0 0">
              <h2 style="color:white;margin:0;font-size:16px">📊 IPO企業情報AI分析レポート</h2>
              <p style="color:#a0d4d6;margin:4px 0 0;font-size:12px">担当：大手町調査室九課</p>
            </div>
            <div style="background:white;padding:24px;border-radius:0 0 12px 12px;border:1px solid #b3e8ea">
              <p style="color:#082b2e;font-size:14px;margin-bottom:16px">
                翌週（<strong>${fromDate}〜${toDate}</strong>）のIPOイベントをお知らせします。
              </p>
              <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
                <thead>
                  <tr style="background:#f4fbfc">
                    <th style="padding:8px 12px;text-align:left;color:#2a7a7e;font-size:11px">銘柄</th>
                    <th style="padding:8px 12px;text-align:left;color:#2a7a7e;font-size:11px">イベント</th>
                    <th style="padding:8px 12px;text-align:left;color:#2a7a7e;font-size:11px">日付</th>
                  </tr>
                </thead>
                <tbody>${rows.join("")}</tbody>
              </table>
              <a href="https://ipo-jp.vercel.app"
                style="display:inline-block;padding:12px 24px;background:#66c3c6;color:white;text-decoration:none;border-radius:8px;font-weight:bold;margin-top:20px;font-size:14px">
                分析レポートを確認する →
              </a>
              <p style="margin-top:24px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px">
                このメールは毎週金曜日18時に通知設定を有効にしているユーザーへ送信されます。<br/>
                © 大手町調査室九課
              </p>
            </div>
          </div>
        `,
      });

      await supabase.from('notification_logs').insert({
        user_id: setting.user_id,
        sent_at: new Date().toISOString(),
        method: 'email',
      });

      sentCount++;
    } catch (e) {
      console.error(`メール送信失敗: ${email}`, e);
      await notifyAdmin(
        `週次通知メール送信失敗`,
        `送信先: ${email}\nエラー: ${String(e)}`,
        'error'
      );
    }
  }

  return NextResponse.json({ success: true, sent: sentCount, range: `${fromDate}〜${toDate}` });
}