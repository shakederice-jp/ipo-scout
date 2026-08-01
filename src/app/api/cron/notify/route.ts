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

const SITE_URL = 'https://ipo.finance-tower.com';

const gradeColor: Record<string, string> = {
  A: '#15803d', B: '#0369a1', C: '#d97706', D: '#dc2626', E: '#7c3aed'
};
const gradeBg: Record<string, string> = {
  A: '#dcfce7', B: '#dbeafe', C: '#fef3c7', D: '#fee2e2', E: '#ede9fe'
};
const gradeLabel: Record<string, string> = {
  A: '蠑ｷ豌・, B: '繧・ｄ蠑ｷ豌・, C: '荳ｭ遶・, D: '繧・ｄ蠑ｱ豌・, E: '蠑ｱ豌・
};

function gradeTag(grade: string | null | undefined): string {
  const g = grade ?? 'C';
  const color = gradeColor[g] ?? '#64748b';
  const bg = gradeBg[g] ?? '#f1f5f9';
  const label = gradeLabel[g] ?? '荳ｭ遶・;
  return `<span style="display:inline-block;padding:2px 10px;border-radius:20px;background:${bg};color:${color};font-weight:800;font-size:13px;border:1px solid ${color}">隧穂ｾ｡ ${g}・・{label}・・/span>`;
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

  const selectFields = 'id,name,ticker,bb_start_date,apply_start_date,listing_date,ai_summary,analysis_summary,structured_data';

  const [{ data: bbList }, { data: applyList }, { data: listingList }] = await Promise.all([
    supabase.from('ipo_companies').select(selectFields).gte('bb_start_date', fromDate).lte('bb_start_date', toDate),
    supabase.from('ipo_companies').select(selectFields).gte('apply_start_date', fromDate).lte('apply_start_date', toDate),
    supabase.from('ipo_companies').select(selectFields).gte('listing_date', fromDate).lte('listing_date', toDate),
  ]);

  const hasAny = (bbList?.length ?? 0) + (applyList?.length ?? 0) + (listingList?.length ?? 0) > 0;
  if (!hasAny) {
    return NextResponse.json({ message: '鄙碁ｱ縺ｮ騾夂衍蟇ｾ雎｡縺ｪ縺・, sent: 0 });
  }

  const formatDate = (d: string) => {
    const dt = new Date(d);
    const dow = ["譌･","譛・,"轣ｫ","豌ｴ","譛ｨ","驥・,"蝨・][dt.getDay()];
    return `${dt.getMonth()+1}/${dt.getDate()}・・{dow}・荏;
  };

  // 豕ｨ逶ｮ驫俶氛繧帝∈蜃ｺ・医げ繝ｬ繝ｼ繝牙━蜈・ A>B>C>D>E・・
  const gradeOrder: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, E: 1 };
  const allCompanies = [...(listingList ?? []), ...(bbList ?? []), ...(applyList ?? [])];
  const featured = allCompanies.reduce((best: any, c: any) => {
    const cGrade = gradeOrder[c.analysis_summary?.grade ?? 'C'] ?? 3;
    const bGrade = gradeOrder[best?.analysis_summary?.grade ?? 'C'] ?? 3;
    return cGrade > bGrade ? c : best;
  }, allCompanies[0]);

  // X・域立Twitter・峨∈縺ｮ閾ｪ蜍墓兜遞ｿ
  const xLines: string[] = [];
  if (listingList?.length) listingList.forEach((c: any) => xLines.push(`笆ｶ ${formatDate(c.listing_date)} ${c.name} 荳雁ｴ`));
  if (bbList?.length) bbList.forEach((c: any) => xLines.push(`笆ｶ ${formatDate(c.bb_start_date)} ${c.name} BB髢句ｧ義));
  if (applyList?.length) applyList.forEach((c: any) => xLines.push(`笆ｶ ${formatDate(c.apply_start_date)} ${c.name} 逕ｳ霎ｼ髢句ｧ義));

  if (xLines.length > 0) {
    const xText = `投縲千ｿ碁ｱ縺ｮIPO繧ｹ繧ｱ繧ｸ繝･繝ｼ繝ｫ縲曾n${xLines.slice(0, 6).join("\n")}\n\n隧ｳ邏ｰ縺ｯ繝励Ο繝輔ぅ繝ｼ繝ｫ縺ｮ繝ｪ繝ｳ繧ｯ縺九ｉ燥\n\n#IPO #譁ｰ隕丈ｸ雁ｴ #IPO謚戊ｳ㌔;
    const xResult = await postToX(xText);
    if (!xResult.success) {
      await notifyAdmin("X閾ｪ蜍墓兜遞ｿ螟ｱ謨・, `繧ｨ繝ｩ繝ｼ: ${xResult.error}`, "warn");
    }
  }

  // 騾夂衍險ｭ螳壹ｒ蜿門ｾ・
  const { data: settings } = await supabase
    .from('notification_settings')
    .select('user_id, notify_bb, notify_apply, notify_listing, method_email')
    .eq('method_email', true);

  if (!settings || settings.length === 0) {
    return NextResponse.json({ message: '騾夂衍繝ｦ繝ｼ繧ｶ繝ｼ縺ｪ縺・, sent: 0 });
  }

  const { data: { users } } = await supabase.auth.admin.listUsers();
  const emailMap: Record<string, string> = {};
  users.forEach((u: any) => { if (u.email) emailMap[u.id] = u.email; });

  let sentCount = 0;

  for (const setting of settings) {
    const email = emailMap[setting.user_id];
    if (!email) continue;

    // 驫俶氛繧ｫ繝ｼ繝峨ｒ逕滓・縺吶ｋ髢｢謨ｰ
    const buildCard = (c: any, eventLabel: string, eventColor: string, dateStr: string) => {
      const grade = c.analysis_summary?.grade ?? null;
      const ultraGrade = c.analysis_summary?.ultra_short_grade ?? null;
      const shortGrade = c.analysis_summary?.short_grade ?? null;
      const longGrade = c.analysis_summary?.long_grade ?? null;
      const aiSummary = c.ai_summary ?? null;
      const offerPrice = c.structured_data?.ipo_details?.offer_price 
  ? `ﾂ･${Number(c.structured_data.ipo_details.offer_price).toLocaleString()}` 
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
            套 <strong>${dateStr}</strong>
            ${offerPrice ? `縲超 蜈ｬ蜍滉ｾ｡譬ｼ <strong>${offerPrice}</strong>` : ''}
          </div>
          ${grade ? `
          <div style="margin-bottom:12px">
            ${gradeTag(grade)}
            ${ultraGrade ? `<span style="font-size:11px;color:#64748b;margin-left:8px">雜・洒譛・${ultraGrade} / 遏ｭ譛・${shortGrade ?? '-'} / 髟ｷ譛・${longGrade ?? '-'}</span>` : ''}
          </div>` : ''}
          ${aiSummary ? `<p style="font-size:13px;color:#334155;background:#f8fafc;padding:12px;border-radius:8px;margin:0 0 12px;border-left:3px solid #66c3c6;line-height:1.6">${aiSummary}</p>` : ''}
          ${ticker ? `<a href="${analysisUrl}" style="display:inline-block;padding:8px 18px;background:#0d4f52;color:white;text-decoration:none;border-radius:8px;font-size:12px;font-weight:700">隧ｳ邏ｰ繝ｬ繝昴・繝医ｒ隕九ｋ 竊・/a>` : ''}
        </div>
      `;
    };

    const sections: string[] = [];

    if (setting.notify_listing && listingList?.length) {
      sections.push(`<h3 style="color:#15803d;font-size:14px;margin:20px 0 8px">泙 荳雁ｴ驫俶氛</h3>`);
      listingList.forEach((c: any) => sections.push(buildCard(c, '荳雁ｴ譌･', '#15803d', formatDate(c.listing_date))));
    }
    if (setting.notify_bb && bbList?.length) {
      sections.push(`<h3 style="color:#0369a1;font-size:14px;margin:20px 0 8px">鳩 BB髢句ｧ矩釜譟・/h3>`);
      bbList.forEach((c: any) => sections.push(buildCard(c, 'BB髢句ｧ・, '#0369a1', formatDate(c.bb_start_date))));
    }
    if (setting.notify_apply && applyList?.length) {
      sections.push(`<h3 style="color:#d97706;font-size:14px;margin:20px 0 8px">泯 逕ｳ霎ｼ髢句ｧ矩釜譟・/h3>`);
      applyList.forEach((c: any) => sections.push(buildCard(c, '逕ｳ霎ｼ髢句ｧ・, '#d97706', formatDate(c.apply_start_date))));
    }

    if (sections.length === 0) continue;

    // 豕ｨ逶ｮ驫俶氛繝舌リ繝ｼ
    const featuredGrade = featured?.analysis_summary?.grade ?? null;
    const featuredBanner = featured ? `
      <div style="background:linear-gradient(135deg,#0d4f52,#2a7a7e);border-radius:12px;padding:16px 20px;margin-bottom:20px">
        <p style="color:#a0d4d6;font-size:11px;margin:0 0 4px;font-weight:700">笨ｨ 莉企ｱ縺ｮ豕ｨ逶ｮ驫俶氛</p>
        <p style="color:white;font-size:16px;font-weight:800;margin:0 0 6px">${featured.name}${featured.ticker ? ` (${featured.ticker})` : ''}</p>
        ${featuredGrade ? `<span style="background:white;color:#0d4f52;font-size:12px;font-weight:800;padding:2px 10px;border-radius:20px">邱丞粋隧穂ｾ｡ ${featuredGrade}・・{gradeLabel[featuredGrade] ?? ''}・・/span>` : ''}
      </div>
    ` : '';

    try {
      const { data, error } = await resend.emails.send({
        from: 'IPO蛻・梵繝ｬ繝昴・繝・<noreply@finance-tower.com>',
        to: email,
        subject: `縲蝕PO騾ｱ谺｡騾夂衍縲醍ｿ碁ｱ・・{fromDate}縲・{toDate}・峨・IPO繧､繝吶Φ繝・,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f4fbfc">
            <div style="background:#0d4f52;padding:16px 24px;border-radius:12px 12px 0 0">
              <h2 style="color:white;margin:0;font-size:16px">投 IPO莨∵･ｭ諠・ｱAI蛻・梵繝ｬ繝昴・繝・/h2>
              <p style="color:#a0d4d6;margin:4px 0 0;font-size:12px">諡・ｽ難ｼ壼､ｧ謇狗伴隱ｿ譟ｻ螳､荵晁ｪｲ</p>
            </div>
            <div style="background:#f4fbfc;padding:20px 24px">
              <p style="color:#082b2e;font-size:14px;margin:0 0 16px">
                鄙碁ｱ・・strong>${fromDate}縲・{toDate}</strong>・峨・IPO繧､繝吶Φ繝医ｒ縺顔衍繧峨○縺励∪縺吶・
              </p>
              ${featuredBanner}
              ${sections.join('')}
              <div style="text-align:center;margin-top:24px">
                <a href="${SITE_URL}" style="display:inline-block;padding:14px 32px;background:#66c3c6;color:white;text-decoration:none;border-radius:8px;font-weight:800;font-size:14px">
                  蜈ｨ驫俶氛縺ｮ蛻・梵繝ｬ繝昴・繝医ｒ隕九ｋ 竊・
                </a>
              </div>
              <p style="margin-top:24px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px">
                縺薙・繝｡繝ｼ繝ｫ縺ｯ豈朱ｱ驥第屆譌･18譎ゅ↓騾夂衍險ｭ螳壹ｒ譛牙柑縺ｫ縺励※縺・ｋ繝ｦ繝ｼ繧ｶ繝ｼ縺ｸ騾∽ｿ｡縺輔ｌ縺ｾ縺吶・br/>
                ﾂｩ 螟ｧ謇狗伴隱ｿ譟ｻ螳､荵晁ｪｲ
              </p>
            </div>
          </div>
        `,
      });

      if (error) {
        console.error(`Resend API繧ｨ繝ｩ繝ｼ: ${email}`, error);
        await notifyAdmin(
          `騾ｱ谺｡騾夂衍繝｡繝ｼ繝ｫ騾∽ｿ｡螟ｱ謨暦ｼ・esend API繧ｨ繝ｩ繝ｼ・荏,
          `騾∽ｿ｡蜈・ ${email}\n繧ｨ繝ｩ繝ｼ: ${JSON.stringify(error)}`,
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
      console.error(`繝｡繝ｼ繝ｫ騾∽ｿ｡螟ｱ謨・ ${email}`, e);
      await notifyAdmin(
        `騾ｱ谺｡騾夂衍繝｡繝ｼ繝ｫ騾∽ｿ｡螟ｱ謨輿,
        `騾∽ｿ｡蜈・ ${email}\n繧ｨ繝ｩ繝ｼ: ${String(e)}`,
        'error'
      );
    }
  }

  return NextResponse.json({ success: true, sent: sentCount, range: `${fromDate}縲・{toDate}` });
}