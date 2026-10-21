import { NextResponse, after } from "next/server";
import { notifyAdmin } from "@/lib/notify-admin";

// 2026/10/21新設: 外部の定時実行サービス(cron-job.org)から、既存の定期実行APIを呼び出すための「取り次ぎ口」。
// 背景: GitHub Actionsの定時実行が、数時間遅れることがある(朝7時のXメールが9時過ぎに届いた)。
//   時刻に正確な外部サービスに切り替えたいが、cron-job.org は30秒でタイムアウトとみなす。
//   既存のAPI(auto-post・generate-x-drafts)は最大120秒かかるため、ここで「受け付けた」とすぐ返事をして、
//   本体の処理は、返事のあとに(after)続ける。
// 使い方: GET /api/cron/kick?job=<名前>  (Authorization: Bearer <CRON_SECRET> が必要)
//   job の一覧は、下の JOBS を参照。名前に無いAPIは呼べない(任意のURLを呼ばせないため)。
// 本体が失敗(200番台以外)した場合は、管理者にメールで知らせる。
export const maxDuration = 150;

const JOBS: Record<string, string> = {
  "auto-post-morning": "/api/cron/auto-post?slot=morning",
  "auto-post-evening": "/api/cron/auto-post?slot=evening",
  "generate-x-drafts": "/api/cron/generate-x-drafts",
  "daily-reminder": "/api/cron/daily-reminder",
};

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const job = url.searchParams.get("job") ?? "";
  const path = JOBS[job];
  if (!path) {
    return NextResponse.json({ error: "job が不正です", jobs: Object.keys(JOBS) }, { status: 400 });
  }

  const target = `${url.origin}${path}`;
  const startedAt = new Date().toISOString();
  after(async () => {
    try {
      const res = await fetch(target, { headers: { authorization: authHeader! }, cache: "no-store" });
      if (!res.ok) {
        const text = (await res.text().catch(() => "")).slice(0, 500);
        console.error(`kick(${job}) 本体がエラー: ${res.status} ${text}`);
        await notifyAdmin(`定期実行(${job})が失敗しました`, `状態: ${res.status}\n${text}`, "error");
      }
    } catch (e: any) {
      console.error(`kick(${job}) 呼び出し失敗:`, e);
      await notifyAdmin(`定期実行(${job})を呼び出せませんでした`, String(e?.message ?? e), "error");
    }
  });

  return NextResponse.json({ accepted: true, job, startedAt }, { status: 202 });
}
