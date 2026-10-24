import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyAdmin } from "@/lib/notify-admin";
import { generateWeeklySlides } from "@/lib/weekly-slides-store";

// 2026/10/20新設(案2): 週刊PDFスライドを、毎週金曜15時(日本時間)に自動で作る。
// 作ったあとは、管理者(自分)に確認のメールが届く。メールの「PDFを開く」で中身を見て、「公開する」を押すと会員に公開される。
// 使い方(いずれも Authorization: Bearer <CRON_SECRET> が必要。管理画面にログイン中なら、URLを開くだけでも動く):
//   /api/cron/weekly-slides            … 今週号を作る(作成済みならそのまま)
//   /api/cron/weekly-slides?force=1    … 今週号を作り直す(公開前の号だけ)
//   /api/cron/weekly-slides?dry=1      … 試作のみ。保存せず、チェック結果をJSONで返す
export const maxDuration = 120;

const SITE_URL = "https://ipo.finance-tower.com";

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sp = new URL(req.url).searchParams;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  try {
    const r = await generateWeeklySlides(supabase, { force: sp.get("force") === "1", dry: sp.get("dry") === "1" });
    if (sp.get("dry") === "1") {
      return NextResponse.json({ ok: r.ok, message: r.message, pages: r.pages, expectedPages: r.expectedPages, issues: r.issues, headline: r.data?.headline, bullets: r.data?.bullets, companies: r.data?.companies?.map((c) => `${c.name}(${c.grade ?? "評価なし"}/${c.score ?? "-"})`), market: r.data ? { toneLabel: r.data.market.toneLabel, avg: r.data.market.avg, n: r.data.market.n } : undefined, hasTrack: !!r.data?.track });
    }
    if (r.row && r.row.status === "pending" && r.message.startsWith("作成しました")) {
      const view = `${SITE_URL}/api/admin/weekly-slides?id=${r.row.id}&action=view`;
      const publish = `${SITE_URL}/api/admin/weekly-slides?id=${r.row.id}&action=publish`;
      const body = [
        `${r.row.issue_label} のPDFスライドを作成しました(${r.row.page_count}枚)。`,
        "",
        r.issues.length ? `【自動チェックで気になった点】\n・${r.issues.join("\n・")}` : "【自動チェック】問題は見つかりませんでした。",
        "",
        `1) PDFを開いて確認する(管理画面にログイン中のブラウザで開く)\n${view}`,
        "",
        `2) 問題なければ、会員に公開する\n${publish}`,
        "",
        "公開しない場合は、何もしなくて大丈夫です(確認待ちのまま会員には見えません)。",
        "金曜18時のIPO週報メールには、公開済みの場合だけ、有料会員向けにスライドのリンクが付きます。",
      ].join("\n");
      await notifyAdmin("週刊スライドの確認をお願いします", body, r.issues.length ? "warn" : "info");
    }
    return NextResponse.json({ ok: r.ok, message: r.message, status: r.row?.status, pages: r.pages, issues: r.issues });
  } catch (e: any) {
    console.error("週刊スライドの作成に失敗:", e);
    await notifyAdmin("週刊スライドの作成に失敗しました", String(e?.message ?? e), "error");
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
