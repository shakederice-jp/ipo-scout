import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { notifyAdmin } from '@/lib/notify-admin';
import { postToX } from '@/lib/post-to-x';

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
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dow = today.getDay();
  const daysUntilMonday = dow === 0 ? 1 : 8 - dow;
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + daysUntilMonday);
  const nextSunday = new Date(nextMonday);
  nextSunday.setDate(nextMonday.getDate() + 6);

  const fromDate = nextMonday.toISOString().slice(0, 10);
  const toDate   = nextSunday.toISOString().slice(0, 10);

  const selectFields = 'id,name,ticker,bb_start_date,apply_start_date,listing_date,offer_price,ai_summary,analysis_summary';

  const [{ data: bbList }, { data: applyList }, { data: listingList }] = await Promise.all([
    supabase.from('ipo_companies').select(selectFields).gte('bb_start_date', fromDate).lte('bb_start_date', toDate),
    supabase.from('ipo_companies').select(selectFields).gte('apply_start_date', fromDate).lte('apply_start_date', toDate),
    supabase.from('ipo_companies').select(selectFields).gte('listing_date', fromDate).lte('listing_date', toDate),
  ]);

  const hasAny = (bbList?.length ?? 0) + (applyList?.length ?? 0) + (listingList?.length ?? 0) > 0;
  if (!hasAny) {
    return NextResponse.json({ message: '翌週の通知対象なし', sent: 0 });
  }

  const formatDate = (d: string) => {
    const dt = new Date(d);
    const dow = ["日","月","火","水","木","金","土"][dt.getDay()];
    return `${dt.getMonth()+1}/${dt.getDate()}（${dow}）`;
  };

  // 注目銘柄を選出（グレード優先: A>B>C>D>E）
  const gradeOrder: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, E: 1 };
  const allCompanies = [...(listingList ?? []), ...(bbList ?? []), ...(applyList ?? [])];
  const featured = allCompanies.reduce((best: any, c: any) => {
    const cGrade = gradeOrder[c.analysis_summary?.grade ?? 'C'] ?? 3;
    const bGrade = gradeOrder[best?.analysis_summary?.grade ?? 'C'] ?? 3;
    return cGrade > bGrade ? c : best;
  }, allCompanies[0]);

  // X（旧Twitter）への自動投稿
  const xLines: string[] = [];
  if (listingList?.length) listingList.forEach((c: any) => xLines.push(`▶ ${formatDate(c.listing_date)} ${c.name} 上場`));
  if (bbList?.length) bbList.forEach((c: any) => xLines.push(`▶ ${formatDate(c.bb_start_date)} ${c.name} BB開始`));
  if (applyList?.length) applyList.forEach((c: any) => xLines.push(`▶ ${formatDate(c.apply_start_date)} ${c.name} 申込開始`));

  if (xLines.length > 0) {
    const xText = `📊【今週のIPOスケジュール】\n${xLines.slice(0, 6).join("\n")}\n\n詳細はプロフィールのリンクから👇\n\n#IPO #新規上場 #IPO投資`;
    const xResult = await postToX(xText);
    if (!xResult.success) {
      await notifyAdmin("X自動投稿失敗", `エラー: ${xResult.error}`, "warn");
    }
  }

  // 通知設定を取得
  const { data: settings } = await supabase
    .from('notification_settings')
    .select('user_id, notify_bb, notify_apply, notify_listing, method_email')
    .eq('method_email', true);

  if (!settings || settings.length === 0) {
    return NextResponse.json({ message: '通知ユーザーなし', sent: 0 });
  }

  const { data: { users } } = await supabase.auth.admin.listUsers();
  const emailMap: Record<string, string> = {};
  users.forEach((u: any) => { if (u.email) emailMap[u.id] = u.email; });

  let sentCount = 0;

  for (const setting of settings) {
    const email = emailMap[setting.user_id];
    if (!email) continue;

    // 銘柄カードを生成する関数
    const buildCard = (c: any, eventLabel: string, eventColor: string, dateStr: string) => {
      const grade = c.analysis_summary?.grade ?? null;
      const ultraGrade = c.analysis_summary?.ultra_short_grade ?? null;
      const shortGrade = c.analysis_summary?.short_grade ?? null;
      const longGrade = c.analysis_summary?.long_grade ?? null;
      const aiSummary = c.ai_summary ?? null;
      const offerPrice = c.offer_price ? `¥${Number(c.offer_price).toLocaleString()}` : null;
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
            📅 <strong>${dateStr}</strong>
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

    const sections: string[] = [];

    if (setting.notify_listing && listingList?.length) {
      sections.push(`<h3 style="color:#15803d;font-size:14px;margin:20px 0 8px">🟢 上場銘柄</h3>`);
      listingList.forEach((c: any) => sections.push(buildCard(c, '上場日', '#15803d', formatDate(c.listing_date))));
    }
    if (setting.notify_bb && bbList?.length) {
      sections.push(`<h3 style="color:#0369a1;font-size:14px;margin:20px 0 8px">🔵 BB開始銘柄</h3>`);
      bbList.forEach((c: any) => sections.push(buildCard(c, 'BB開始', '#0369a1', formatDate(c.bb_start_date))));
    }
    if (setting.notify_apply && applyList?.length) {
      sections.push(`<h3 style="color:#d97706;font-size:14px;margin:20px 0 8px">🟡 申込開始銘柄</h3>`);
      applyList.forEach((c: any) => sections.push(buildCard(c, '申込開始', '#d97706', formatDate(c.apply_start_date))));
    }

    if (sections.length === 0) continue;

    // 注目銘柄バナー
    const featuredGrade = featured?.analysis_summary?.grade ?? null;
    const featuredBanner = featured ? `
      <div style="background:linear-gradient(135deg,#0d4f52,#2a7a7e);border-radius:12px;padding:16px 20px;margin-bottom:20px">
        <p style="color:#a0d4d6;font-size:11px;margin:0 0 4px;font-weight:700">✨ 今週の注目銘柄</p>
        <p style="color:white;font-size:16px;font-weight:800;margin:0 0 6px">${featured.name}${featured.ticker ? ` (${featured.ticker})` : ''}</p>
        ${featuredGrade ? `<span style="background:white;color:#0d4f52;font-size:12px;font-weight:800;padding:2px 10px;border-radius:20px">総合評価 ${featuredGrade}（${gradeLabel[featuredGrade] ?? ''}）</span>` : ''}
      </div>
    ` : '';

    try {
      const { data, error } = await resend.emails.send({
        from: 'IPO分析レポート <noreply@finance-tower.com>',
        to: email,
        subject: `【IPO週次通知】翌週（${fromDate}〜${toDate}）のIPOイベント`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f4fbfc">
            <div style="background:#0d4f52;padding:16px 24px;border-radius:12px 12px 0 0">
              <h2 style="color:white;margin:0;font-size:16px">📊 IPO企業情報AI分析レポート</h2>
              <p style="color:#a0d4d6;margin:4px 0 0;font-size:12px">担当：大手町調査室九課</p>
            </div>
            <div style="background:#f4fbfc;padding:20px 24px">
              <p style="color:#082b2e;font-size:14px;margin:0 0 16px">
                翌週（<strong>${fromDate}〜${toDate}</strong>）のIPOイベントをお知らせします。
              </p>
              ${featuredBanner}
              ${sections.join('')}
              <div style="text-align:center;margin-top:24px">
                <a href="${SITE_URL}" style="display:inline-block;padding:14px 32px;background:#66c3c6;color:white;text-decoration:none;border-radius:8px;font-weight:800;font-size:14px">
                  全銘柄の分析レポートを見る →
                </a>
              </div>
              <p style="margin-top:24px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px">
                このメールは毎週金曜日18時に通知設定を有効にしているユーザーへ送信されます。<br/>
                © 大手町調査室九課
              </p>
            </div>
          </div>
        `,
      });

      if (error) {
        console.error(`Resend APIエラー: ${email}`, error);
        await notifyAdmin(
          `週次通知メール送信失敗（Resend APIエラー）`,
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