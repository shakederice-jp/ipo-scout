import { NextResponse } from "next/server";

// 2026/9/19追加: 管理画面から、cronの時刻を待たずにX自動投稿(3回/日)をその場で1回試すための
// プロキシ。send-notify/route.tsと同じパターン(追加認証なし・内部でCRON_SECRETを付けて
// /api/cron/auto-postを叩くだけ)。
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const slot = body?.slot;
    if (slot !== "morning" && slot !== "noon" && slot !== "evening") {
      return NextResponse.json({ error: "slotが不正です" }, { status: 400 });
    }
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://ipo.finance-tower.com";
    // force=1: 管理画面からの手動実行は、時間帯ガード(src/lib/x-auto-post.ts)を無視して即実行する
    const res = await fetch(`${baseUrl}/api/cron/auto-post?slot=${slot}&force=1`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${process.env.CRON_SECRET}`,
      },
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
