import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export const maxDuration = 60;

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(req: NextRequest) {
  // Cronシークレット認証
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 来週月曜〜日曜の上場銘柄を取得
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + (8 - today.getDay()) % 7 || 7);
  const nextSunday = new Date(nextMonday);
  nextSunday.setDate(nextMonday.getDate() + 6);

  const { data: companies } = await supabase
    .from('ipo_companies')
    .select('id, name, listing_date, sector, ticker')
    .gte('listing_date', nextMonday.toISOString().slice(0, 10))
    .lte('listing_date', nextSunday.toISOString().slice(0, 10));

  if (!companies || companies.length === 0) {
    return NextResponse.json({ message: '来週の上場銘柄なし', sent: 0 });
  }

  // 通知設定を持つユーザーを取得
  const companyIds = companies.map(c => c.id);
  const { data: settings } = await supabase
    .from('notification_settings')
    .select('user_id, company_id, notify_listing, method_email')
    .in('company_id', companyIds)
    .eq('notify_listing', true)
    .eq('method_email', true);

  if (!settings || settings.length === 0) {
    return NextResponse.json({ message: '通知対象ユーザーなし', sent: 0 });
  }

  // ユーザーごとにメールをまとめて送信
  const userMap: Record<string, typeof companies> = {};
  settings.forEach(s => {
    const co = companies.find(c => c.id === s.company_id);
    if (!co) return;
    if (!userMap[s.user_id]) userMap[s.user_id] = [];
    userMap[s.user_id].push(co);
  });

  let sentCount = 0;
  for (const [userId, userCompanies] of Object.entries(userMap)) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('email, plan')
      .eq('id', userId)
      .single();

    if (!profile?.email) continue;
    const allowedPlans = ['notify', 'report', 'complete'];
    if (!allowedPlans.includes(profile.plan ?? '')) continue;

    const companyList = userCompanies.map(c => {
      const d = new Date(c.listing_date);
      const dow = ["日","月","火","水","木","金","土"][d.getDay()];
      return `・${c.name}（${d.getMonth()+1}月${d.getDate()}日（${dow}）上場）`;
    }).join('\n');

    await resend.emails.send({
      from: 'IPO通知 <noreply@ipo-scout.jp>',
      to: profile.email,
      subject: `【来週のIPO通知】${userCompanies.length}社が上場予定`,
      text: `大手町調査室九課 IPO通知サービス\n\n来週上場予定の銘柄をお知らせします。\n\n${companyList}\n\n分析レポートはこちら：https://ipo-scout-six.vercel.app\n\n※通知設定の変更は分析ページから行えます。`,
    });

    // 送信ログ記録
    await supabase.from('notification_logs').insert(
      userCompanies.map(c => ({
        user_id: userId,
        company_id: c.id,
        event_type: 'listing',
        sent_at: new Date().toISOString(),
        method: 'email',
      }))
    );

    sentCount++;
  }

  return NextResponse.json({ success: true, sent: sentCount, companies: companies.length });
}