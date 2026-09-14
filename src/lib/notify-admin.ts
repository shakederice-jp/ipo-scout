import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const ADMIN_EMAIL = 'shakederice@gmail.com';
const FROM = 'IPO分析レポート <onboarding@resend.dev>';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

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

// 2026/9/14追加: STEP8完了時に自動生成したnote.com向け記事の本文を、
// マイケルさん宛にそのままコピー&ペーストできる形で届けるための専用メール。
// notifyAdmin()の警告・エラー通知とは毛色が違う(「記事ができました」というお知らせ)ため、
// 別関数として新設した。呼び出し元はsrc/app/api/deep-dive/route.ts。
export async function notifyNoteArticleReady(
  companyName: string,
  articleText: string,
  analysisUrl: string
) {
  try {
    await resend.emails.send({
      from: FROM,
      to: ADMIN_EMAIL,
      subject: `📝【note下書き完成】${companyName}の記事を書きました`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f4fbfc">
          <div style="background:#0d4f52;padding:16px 24px;border-radius:12px 12px 0 0">
            <h2 style="color:white;margin:0;font-size:16px">📝 ${escapeHtml(companyName)}のnote記事を書きました</h2>
            <p style="color:rgba(255,255,255,0.7);margin:4px 0 0;font-size:11px">
              ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} JST
            </p>
          </div>
          <div style="background:white;padding:24px;border-radius:0 0 12px 12px;border:1px solid #b3e8ea">
            <p style="font-size:12px;color:#374151;line-height:1.7">
              下の本文をそのままnote.comにコピー&amp;ペーストしてください。マーケットトレンドの「新規IPO紹介」記事も、既にこの内容に差し替え済みです。
            </p>
            <pre style="font-size:12px;color:#374151;white-space:pre-wrap;background:#f8fafc;padding:16px;border-radius:8px;border:1px solid #e2e8f0">${escapeHtml(articleText)}</pre>
            <p style="margin-top:16px;font-size:11px;color:#94a3b8">
              分析ページ: <a href="${analysisUrl}">${analysisUrl}</a><br/>
              © 大手町調査室九課 自動生成システム
            </p>
          </div>
        </div>
      `,
    });
  } catch (e) {
    console.error('note記事準備完了メール送信失敗:', e);
  }
}