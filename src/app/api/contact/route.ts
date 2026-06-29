import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { notifyAdmin } from "@/lib/notify-admin";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "IPO分析レポート <noreply@ipo-jp.vercel.app>";
const ADMIN_EMAIL = "otemachi.sec9@gmail.com";

export async function POST(req: NextRequest) {
  try {
    const { name, email, category, message } = await req.json();

    if (!message || message.trim().length < 10) {
      return NextResponse.json({ error: "お問い合わせ内容を10文字以上入力してください" }, { status: 400 });
    }

    const categoryLabel: Record<string, string> = {
      bug: "🐛 バグ・不具合報告",
      analysis: "📊 分析内容への質問・指摘",
      feature: "💡 機能改善のご提案",
      other: "💬 その他",
    };
    const catLabel = categoryLabel[category] ?? "その他";
    const displayName = name?.trim() || "匿名";
    const hasEmail = email && email.trim().length > 0;

    // ① 管理者への通知メール
    await notifyAdmin(
      `お問い合わせ：${catLabel}`,
      `種別: ${catLabel}\n名前: ${displayName}\nメール: ${hasEmail ? email : "未記入"}\n\n内容:\n${message}`,
      "info"
    );

    // ② ユーザーへの自動返信メール（メールアドレスがある場合のみ）
    if (hasEmail) {
      await resend.emails.send({
        from: FROM,
        to: email.trim(),
        subject: "【大手町調査室九課】お問い合わせを受け付けました",
        html: `
          <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f4fbfc">
            <div style="background:#0d4f52;padding:20px 28px;border-radius:12px 12px 0 0">
              <h2 style="color:white;margin:0;font-size:17px;font-weight:900">📊 IPO企業情報AI分析レポート</h2>
              <p style="color:#a0d4d6;margin:4px 0 0;font-size:12px">大手町調査室九課</p>
            </div>
            <div style="background:white;padding:28px;border-radius:0 0 12px 12px;border:1px solid #b3e8ea">

              <p style="color:#082b2e;font-size:15px;font-weight:700;margin:0 0 16px">
                ${displayName} 様
              </p>

              <p style="color:#374151;font-size:14px;line-height:1.9;margin:0 0 16px">
                このたびはお問い合わせいただき、誠にありがとうございます。<br/>
                大手町調査室九課のIPO分析レポートをご利用いただいていること、スタッフ一同大変嬉しく思っております。
              </p>

              <p style="color:#374151;font-size:14px;line-height:1.9;margin:0 0 16px">
                いただいた<strong style="color:#0d4f52">「${catLabel}」</strong>のご連絡は、確かに受け付けました。<br/>
                内容を丁寧に確認のうえ、サービスの改善・品質向上に向けて真摯に検討してまいります。
              </p>

              <div style="background:#f0fafa;border-left:4px solid #66c3c6;padding:14px 18px;border-radius:0 8px 8px 0;margin:20px 0">
                <p style="color:#0d4f52;font-size:13px;line-height:1.8;margin:0">
                  なお、いただいたご意見・ご提案はサービス改善の重要な参考とさせていただきますが、
                  すべてのご要望にお応えすることや、ご意見の内容がそのまま反映されることをお約束するものではございません。
                  何卒ご理解いただけますと幸いです。
                </p>
              </div>

              <p style="color:#374151;font-size:14px;line-height:1.9;margin:16px 0">
                引き続き、IPO投資の判断にお役立ていただけるよう、
                コンテンツの充実とサービス品質の向上に努めてまいります。<br/>
                今後ともどうぞよろしくお願いいたします。
              </p>

              <div style="border-top:1px solid #e2e8f0;margin-top:24px;padding-top:16px">
                <p style="color:#082b2e;font-size:13px;font-weight:700;margin:0 0 4px">大手町調査室九課</p>
                <p style="color:#64748b;font-size:12px;margin:0">IPO企業情報AI分析レポート</p>
                <a href="https://ipo-jp.vercel.app" style="color:#66c3c6;font-size:12px;text-decoration:none">ipo-jp.vercel.app</a>
              </div>

              <p style="margin-top:20px;font-size:11px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:12px;line-height:1.7">
                ※ このメールはお問い合わせフォームからの自動返信です。このメールへの返信は受け付けておりません。<br/>
                © 大手町調査室九課
              </p>
            </div>
          </div>
        `,
      });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("contact error:", e);
    return NextResponse.json({ error: "送信に失敗しました" }, { status: 500 });
  }
}