import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SLIDES_BUCKET, setSlideStatus } from "@/lib/weekly-slides-store";

// 2026/10/20新設(案2): 管理者用。週刊スライドの確認・公開・非公開。
// このAPIは src/proxy.ts により、管理画面にログイン中でなければ動かない(/api/admin/ 配下は全部そうなる)。
//   GET ?action=list                 … 一覧(JSON)
//   GET ?id=…&action=view            … PDFを開く(状態に関係なく見られる)
//   GET ?id=…&action=publish         … 会員に公開する
//   GET ?id=…&action=unpublish       … 公開をやめて、確認待ちに戻す
//   GET ?id=…&action=reject          … 見送り(公開しない)
export const maxDuration = 30;

const page = (title: string, body: string) =>
  new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
     <body style="font-family:sans-serif;max-width:560px;margin:60px auto;padding:0 20px;color:#082b2e;line-height:1.8">
     <h2 style="color:#0d4f52">${title}</h2>${body}</body>`,
    { headers: { "content-type": "text/html; charset=utf-8" } }
  );

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const action = sp.get("action") ?? "list";
  const id = sp.get("id");
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  if (action === "list") {
    const { data } = await supabase.from("weekly_slides").select("*").order("issue_date", { ascending: false }).limit(30);
    return NextResponse.json({ slides: data ?? [] });
  }
  if (!id) return NextResponse.json({ error: "id が必要です" }, { status: 400 });

  const { data: row } = await supabase.from("weekly_slides").select("*").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "該当する号が見つかりません" }, { status: 404 });

  if (action === "view") {
    const { data: signed, error } = await supabase.storage.from(SLIDES_BUCKET).createSignedUrl(row.file_path, 120);
    if (error || !signed) return NextResponse.json({ error: error?.message ?? "PDFを開けませんでした" }, { status: 500 });
    return NextResponse.redirect(signed.signedUrl);
  }

  try {
    if (action === "publish") {
      if (row.check_ok === false) {
        // 自動チェックで引っかかった号は、中身を見たうえで公開する(メールの注意書きを確認済みとみなす)
      }
      await setSlideStatus(supabase, id, "published");
      return page("公開しました", `<p>${row.issue_label} を、会員向けに公開しました。</p><p>有料会員は、マイページの「週刊スライド」から読めます。金曜18時のIPO週報メールにも、リンクが付きます。</p><p><a href="/api/admin/weekly-slides?id=${id}&action=unpublish">公開をやめる</a></p>`);
    }
    if (action === "unpublish") {
      await setSlideStatus(supabase, id, "pending");
      return page("公開をやめました", `<p>${row.issue_label} を確認待ちに戻しました。会員には見えません。</p>`);
    }
    if (action === "reject") {
      await setSlideStatus(supabase, id, "rejected");
      return page("見送りにしました", `<p>${row.issue_label} は公開しません。作り直すときは、/api/cron/weekly-slides?force=1 を開いてください。</p>`);
    }
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
  return NextResponse.json({ error: "action が不正です" }, { status: 400 });
}
