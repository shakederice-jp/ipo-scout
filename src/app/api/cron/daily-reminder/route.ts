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

const SITE_URL = 'https://ipo-jp.vercel.app';

const gradeColor: Record<string, string> = {
  A: '#15803d', B: '#0369a1', C: '#d97706', D: '#dc2626', E: '#7c3aed'
};
const gradeBg: Record<string, string> = {
  A: '#dcfce7', B: '#dbeafe', C: '#fef3c7', D: '#fee2e2', E: '#ede9fe'
};
const gradeLabel: Record<string, string> = {
  A: '強気', B: 'やや強気', C: '中立', D: 'やや弱気', E: '弱気'
};

function gradeTag(grade: string | null | undefined): string {
  const g = grade ?? 'C';
  const color = gradeColor[g] ?? '#64748b';
  const bg = gradeBg[g] ?? '#f1f5f9';
  const label = gradeLabel[g] ?? '中立';
  return `<span style="display:inline-block;padding:2px 10px;border-radius:20px;background:${bg};color:${color};font-weight:800;font-size:13px;border:1px solid ${color}">評価 ${g}（${label}）</span>`;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();

  const now = new Date();
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const tomorrow = new Date(Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate() + 1));
  const targetDate = tomorrow.toISOString().slice(0, 10);

  const selectFields = 'id,name,ticker,bb_start_date,apply_start_date,listing_date,ai_summary,analysis_summary,structured_data';

  const [{ data: bbList }, { data: applyList }, { data: listingList }] = await Promise.all([
    supabase.from('ipo_companies').select(selectFields).eq('bb_start_date', targetDate),
    supabase.from('ipo_companies').select(selectFields).eq('apply_start_date', targetDate),
    supabase.from('ipo_companies').select(selectFields).eq('listing_date', targetDate),
  ]);

  const hasAny = (bbList?.length ?? 0) + (applyList?.length ?? 0) + (listingList?.length ?? 0) > 0;
  if (!hasAny) {
    return NextResponse.json({ message: '明日の通知対象なし', target: targetDate, sent: 0 });
  }

  const formatDate = (d: string) => {
    const dt = new Date(d);
    const dow = ["日", "月", "火", "水", "木", "金", "土"][dt.getDay()];
    return `${dt.getMonth() + 1}/${dt.getDate()}（${dow}）`;
  };

  const dateLabel = formatDate(targetDate);

  const { data: settings } = await supabase
    .from('notification_settings')
    .select('user_id, notify_bb, notify_apply, notify_listing, method_email')
    .is('company_id', null)
    .eq('method_email', true)
    .eq('notify_daily_reminder', true);

  if (!settings || settings.length === 0) {
    return NextResponse.json({ message: '通知ユーザーなし', target: targetDate, sent: 0 });
  }

  const { data: { users } } = await supabase.auth.admin.listUsers();
  const emailMap: Record<string, string> = {};
  users.forEach((u: any) => { if (u.email) emailMap[u.id] = u.email; });

  const buildCard = (c: any, eventLabel: string, eventColor: string) => {
    const grade = c.analysis_summary?.grade ?? null;
    const ultraGrade = c.analysis_summary?.ultra_short_grade ?? null;
    const shortGrade = c.analysis_summary?.short_grade ?? null;
    const longGrade = c.analysis_summary?.long_grade ?? null;
    const aiSummary = c.ai_summary ?? null;
    const offerPrice = c.structured_data?.ipo_details?.offer_price
      ? `¥${Number(c.structured_data.ipo_details.offer_price).toLocaleString()}`
      : null;
    const ticker = c.ticker ?? null;
    const analysisUrl = ticker ? `${SITE_URL}/analysis/${ticker}` : SITE_URL;

    return `
      <div style="background:white;border:1px solid #b3e8ea;border-radius:12px;padding:20px;margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
          <div>
            <span style="font-size:16px;font-weight:800;color:#082b2e">${c.name}</span>
            ${ticker ? `<span style="font-size:12px;color:#64748b;margin-left:8px">${ticker}</span>` : ''}
          </div>
          <span style="background:${eventColor}15;color:${eventColor};font-weight:700;font-size:12px;padding:3px 10px;border-radius:20px;border:1px solid ${eventColor};white-space:nowrap">${eventLabel}</span>
        </div>
        <div style="font-size:13px;color:#475569;margin-bottom:12px">
          📅 <strong>明日（${dateLabel}）</strong>
          ${offerPrice ? `　💴 公募価格 <strong>${offerPrice}</strong>` : ''}
        </div>
        ${grade ? `
        <div style="margin-bottom:12px">
          ${gradeTag(grade)}
          ${ultraGrade ? `<span style="font-size:11px;color:#64748b;margin-left:8px">超短期:${ultraGrade} / 短期:${shortGrade ?? '-'} / 長期:${longGrade ?? '-'}</span>` : ''}
        </div>` : ''}
        ${aiSummary ? `<p style="font-size:13px;color:#334155;background:#f8fafc;padding:12px;border-radius:8px;margin:0 0 12px;border-left:3px solid #66c3c6;line-height:1.6">${aiSummary}</p>` : ''}
        ${ticker ? `<a href="${analysisUrl}" style="display:inline-block;padding:8px 18px;background:#0d4f52;color:white;text-decoration:none;border-radius:8px;font-size:12px;font-weight:700">詳細レポートを見る →</a>` : ''}
      </div>
    `;
  };

  let sentCount = 0;

  for (const setting of settings) {
    const email = emailMap[setting.user_id];
    if (!email) continue;

    const sections: string[] = [];

    if (setting.notify_listing && listingList?.length) {
      sections.push(`<h3 style="color:#15803d;font-size:14px;margin:20px 0 8px">🟢 明日上場</h3>`);
      listingList.forEach((c: any) => sections.push(buildCard(c, '上場日', '#15803d')));
    }
    if (setting.notify_bb && bbList?.length) {
      sections.push(`<h3 style="color:#0369a1;font-size:14px;margin:20px 0 8px">🔵 明日BB開始</h3>`);
      bbList.forEach((c: any) => sections.push(buildCard(c, 'BB開始', '#0369a1')));
    }
    if (setting.notify_apply && applyList?.length) {
      sections.push(`<h3 style="color:#d97706;font-size:14px;margin:20px 0 8px">🟡 明日申込開始</h3>`);
      applyList.forEach((c: any) => sections.push(buildCard(c, '申込開始', '#d97706')));
    }

    if (sections.length === 0) continue;

    try {
      const { error } = await resend.emails.send({
        from: 'IPO分析レポート <noreply@finance-tower.com>',
        to: email,
        subject: `【IPO前日通知】明日（${dateLabel}）のIPOイベント`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f4fbfc">
            <div style="background:#0d4f52;padding:16px 24px;border-radius:12px 12px 0 0">
              <h2 style="color:white;margin:0;font-size:16px">📊 IPO企業情報AI分析レポート</h2>
              <p style="color:#a0d4d6;margin:4px 0 0;font-size:12px">担当：大手町調査室九課</p>
            </div>
            <div style="background:#f4fbfc;padding:20px 24px">
              <p style="color:#082b2e;font-size:14px;margin:0 0 16px">
                明日（<strong>${dateLabel}</strong>）のIPOイベントをお知らせします。
              </p>
              ${sections.join('')}
              <div style="text-align:center;margin-top:24px">
                <a href="${SITE_URL}" style="display:inline-block;padding:14px 32px;background:#66c3c6;color:white;text-decoration:none;border-radius:8px;font-weight:800;font-size:14px">
                  全銘柄の分析レポートを見る →
                </a>
              </div>
              <p style="margin-top:24px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px">
                このメールは前日通知の設定を有効にしているユーザーへ、毎日12時に送信されます。<br/>
                © 大手町調査室九課
              </p>
            </div>
          </div>
        `,
      });

      if (error) {
        console.error(`Resend APIエラー(前日通知): ${email}`, error);
        await notifyAdmin(
          `前日通知メール送信失敗（Resend APIエラー）`,
          `送信先: ${email}\nエラー: ${JSON.stringify(error)}`,
          'error'
        );
        continue;
      }

      await supabase.from('notification_logs').insert({
        user_id: setting.user_id,
        sent_at: new Date().toISOString(),
        method: 'email',
      });

      sentCount++;
    } catch (e) {
      console.error(`前日通知メール送信失敗: ${email}`, e);
      await notifyAdmin(
        `前日通知メール送信失敗`,
        `送信先: ${email}\nエラー: ${String(e)}`,
        'error'
      );
    }
  }

  return NextResponse.json({ success: true, target: targetDate, sent: sentCount });
}