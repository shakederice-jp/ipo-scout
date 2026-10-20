import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/member-auth";
import { verifyUnsubscribe } from "@/lib/weekly-brief-token";

// 2026/10/20新設(案2): IPO週報のメールにある「配信を止める」リンクの受け口。
// ログインしていなくても、メールに付いた署名つきのリンクなら本人として止められる。
// (リンクを開いただけで止まる。メールソフトの先読みで止まる場合に備え、止めた後の画面に「再開」の案内を出す)
function page(title: string, body: string): NextResponse {
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex"/><title>${title}</title></head>
<body style="margin:0;background:#f4fbfc;font-family:'Noto Sans JP',sans-serif;color:#082b2e">
<div style="max-width:520px;margin:48px auto;padding:0 16px"><div style="background:white;border:1px solid #b3e8ea;border-radius:14px;padding:24px">
<h1 style="font-size:18px;margin:0 0 12px">${title}</h1><p style="font-size:14px;line-height:1.9;margin:0 0 16px">${body}</p>
<a href="/" style="color:#0d4f52;font-weight:700">トップページへ</a></div></div></body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" } });
}

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const u = sp.get("u") ?? "";
  const t = sp.get("t") ?? "";
  if (!verifyUnsubscribe(u, t)) {
    return page("リンクが正しくありません", "このリンクは無効です。マイページの「IPO週報」から、配信の停止ができます。");
  }
  const supabase = getServiceSupabase();
  const { error } = await supabase.from("weekly_brief_subscribers").delete().eq("user_id", u);
  if (error) {
    return page("停止できませんでした", "時間をおいて、もう一度お試しください。マイページの「IPO週報」からも停止できます。");
  }
  return page("IPO週報の配信を止めました", "今後、IPO週報はお送りしません。再開したいときは、マイページの「IPO週報」から設定できます。");
}
