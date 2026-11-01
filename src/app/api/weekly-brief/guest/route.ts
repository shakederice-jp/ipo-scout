import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getServiceSupabase } from "@/lib/member-auth";
import { guestUrl, verifyGuest } from "@/lib/weekly-brief-token";

// 2026/11/1新設(集客施策2): ログイン(会員登録)なしで、メールアドレスだけでIPO週報を申し込めるようにする入り口。
// ・POST … { email, website } 申込み。確認メールを送る(本人が「登録を完了する」を押して初めて配信対象になる＝二重確認)。
//     他人のアドレスを勝手に入れられても、確認が済むまで週報は届かない。
//     登録済みか未登録かは画面に出さない(アドレスの有無を外から探れないように、常に同じ返事にする)。
//     website は人間には見えない欄(ボット対策)。入っていたら何もせず成功のふりをする。
// ・GET ?a=confirm|stop&g=<id>&t=<署名> … メールの「登録を完了する」「配信を止める」リンクの受け口。
// 保存先は weekly_brief_guests(SQLは 2026-11-01-weekly-brief-email-signup メモ参照)。
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "IPO分析レポート <noreply@finance-tower.com>";
const RESEND_COOLDOWN_MS = 10 * 60 * 1000; // 同じアドレスへの確認メールは10分に1通まで
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function page(title: string, body: string): NextResponse {
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex"/><title>${title}</title></head>
<body style="margin:0;background:#f4fbfc;font-family:'Noto Sans JP',sans-serif;color:#082b2e">
<div style="max-width:520px;margin:48px auto;padding:0 16px"><div style="background:white;border:1px solid #b3e8ea;border-radius:14px;padding:24px">
<h1 style="font-size:18px;margin:0 0 12px">${title}</h1><p style="font-size:14px;line-height:1.9;margin:0 0 16px">${body}</p>
<a href="/" style="color:#0d4f52;font-weight:700">トップページへ</a></div></div></body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" } });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.email !== "string") {
    return NextResponse.json({ error: "メールアドレスを入力してください" }, { status: 400 });
  }
  if (body.website) return NextResponse.json({ success: true }); // ボット対策(人間には見えない欄に入力があった)
  const email = body.email.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "メールアドレスの形式を確認してください" }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const { data: existing } = await supabase
    .from("weekly_brief_guests")
    .select("id, confirmed_at, last_sent_at")
    .eq("email", email)
    .maybeSingle();

  // 登録済み(確認済み)なら何も送らない。画面の返事は同じ。
  if (existing?.confirmed_at) return NextResponse.json({ success: true });
  // 確認待ちで、直近に確認メールを送っていたら送り直さない
  if (existing?.last_sent_at && Date.now() - new Date(existing.last_sent_at).getTime() < RESEND_COOLDOWN_MS) {
    return NextResponse.json({ success: true });
  }

  let id = existing?.id as string | undefined;
  if (!id) {
    const { data: ins, error } = await supabase.from("weekly_brief_guests").insert({ email }).select("id").single();
    if (error || !ins) return NextResponse.json({ error: "うまくいきませんでした。時間をおいてお試しください。" }, { status: 500 });
    id = ins.id as string;
  }

  const link = guestUrl(id, "confirm");
  const { error: mailErr } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: "【大手町調査室九課】IPO週報の登録を完了してください",
    html: `<div style="font-family:'Noto Sans JP',sans-serif;max-width:520px;margin:0 auto;color:#082b2e;line-height:1.9;font-size:14px">
<p>IPO週報(無料)のお申し込みありがとうございます。<br/>下のボタンを押すと登録が完了します。</p>
<p style="margin:24px 0"><a href="${link}" style="background:#66c3c6;color:#082b2e;font-weight:900;text-decoration:none;padding:12px 24px;border-radius:10px;display:inline-block">登録を完了する</a></p>
<p style="font-size:12px;color:#64748b">毎週金曜18時に、来週のIPO予定と今週の初値結果をお届けします。<br/>このメールに心当たりがない場合は、何もせずこのメールを破棄してください(ボタンを押さない限り、週報は届きません)。</p>
<p style="font-size:12px;color:#64748b">大手町調査室九課 / ipo.finance-tower.com</p></div>`,
  });
  if (mailErr) {
    console.error("IPO週報(メール登録)の確認メール送信エラー:", mailErr);
    return NextResponse.json({ error: "確認メールを送れませんでした。時間をおいてお試しください。" }, { status: 500 });
  }
  await supabase.from("weekly_brief_guests").update({ last_sent_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ success: true });
}

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const a = sp.get("a");
  const g = sp.get("g") ?? "";
  const t = sp.get("t") ?? "";
  if ((a !== "confirm" && a !== "stop") || !verifyGuest(g, a, t)) {
    return page("リンクが正しくありません", "このリンクは無効です。お手数ですが、もう一度お申し込みください。");
  }
  const supabase = getServiceSupabase();
  if (a === "confirm") {
    const { error } = await supabase.from("weekly_brief_guests").update({ confirmed_at: new Date().toISOString() }).eq("id", g).is("confirmed_at", null);
    if (error) return page("登録できませんでした", "時間をおいて、もう一度お試しください。");
    return page(
      "IPO週報の登録が完了しました",
      `次の金曜18時から、IPO週報をお届けします。<br/><br/>🎁 <a href="/campaign" style="color:#b91c1c;font-weight:700">無料会員登録で、有料分析が2ヶ月間読み放題(先着300名限定)</a>`
    );
  }
  const { error } = await supabase.from("weekly_brief_guests").delete().eq("id", g);
  if (error) return page("停止できませんでした", "時間をおいて、もう一度お試しください。");
  return page("IPO週報の配信を止めました", "今後、IPO週報はお送りしません。");
}
