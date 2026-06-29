import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const ADMIN_EMAIL = 'otemachi.sec9@gmail.com';
const FROM = 'IPO分析レポート <noreply@ipo-jp.vercel.app>';

export async function notifyAdmin(
  subject: string,
  body: string,
  level: 'error' | 'warn' | 'info' = 'error'
) {
  const emoji = level === 'error' ? '🚨' : level === 'warn' ? '⚠️' : 'ℹ️';
  const color = level === 'error' ? '#b91c1c' : level === 'warn' ? '#d97706' : '#0d4f52';

  try {
    await resend.emails.send({
      from: FROM,
      to: ADMIN_EMAIL,
      subject: `${emoji}【IPO管理通知】${subject}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f4fbfc">
          <div style="background:${color};padding:16px 24px;border-radius:12px 12px 0 0">
            <h2 style="color:white;margin:0;font-size:16px">${emoji} ${subject}</h2>
            <p style="color:rgba(255,255,255,0.7);margin:4px 0 0;font-size:11px">
              ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} JST
            </p>
          </div>
          <div style="background:white;padding:24px;border-radius:0 0 12px 12px;border:1px solid #b3e8ea">
            <pre style="font-size:12px;color:#374151;white-space:pre-wrap;background:#f8fafc;padding:16px;border-radius:8px;border:1px solid #e2e8f0">${body}</pre>
            <p style="margin-top:16px;font-size:11px;color:#94a3b8">
              © 大手町調査室九課 自動監視システム
            </p>
          </div>
        </div>
      `,
    });
  } catch (e) {
    console.error('管理者通知メール送信失敗:', e);
  }
}