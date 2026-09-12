import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyAdmin } from "@/lib/notify-admin";

// 2026/9/12追加: 「有料の9軸分析が、他の業者やAIに丸ごと拾われて有料サイトの価値が
// 失われてしまうのでは」というユーザーからの相談を受けて追加した早期警告バッチ。
// robots.txtでのAIクローラー遮断や、有料コンテンツ自体をサーバー側で無権限者に
// 送らない既存の設計だけでは、「正規のログイン・課金アカウントを使って
// スクリプトで大量に自動取得する」パターンは防げない。そこで、
// src/app/analysis/[id]/page.tsx・[id]/beginner/page.tsxで有料コンテンツへの
// アクセスが発生するたびに書き込まれるpaid_access_logsを日次で集計し、
// 以下いずれかに該当するアカウントを管理者(notifyAdmin)にメールで知らせる。
//
// ・DAILY_THRESHOLD: 過去24時間で閲覧した「異なる銘柄数」がこれ以上
// ・BURST_THRESHOLD / BURST_WINDOW_MS: 過去24時間のどこかで、この時間幅の中に
//   これだけのアクセスが集中している(人間が読むペースでは考えにくい速さ)
//
// あくまで「早期警告」であり、誤検知(閲覧意欲の高い正規会員)の可能性があるため、
// このバッチ自体はアカウント停止等は一切行わない。対応するかどうかは管理者の
// 判断に委ねる設計。GitHub Actions(.github/workflows/cron.yml)から1日1回呼び出す
// (Vercel Hobbyプランのcron頻度制限を避けるため、他のバッチと同じくGitHub Actions経由)。
export const maxDuration = 60;

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DAILY_THRESHOLD = 15;
const BURST_THRESHOLD = 6;
const BURST_WINDOW_MS = 20 * 60 * 1000; // 20分

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: logs, error } = await supabase
    .from("paid_access_logs")
    .select("user_id, company_id, accessed_at")
    .gte("accessed_at", since)
    .order("accessed_at", { ascending: true });

  if (error) {
    console.error("detect-scraping: ログ取得エラー", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 古いログの削除(7日以上前)。集計後に実行し、テーブルの肥大化を防ぐ。
  await supabase
    .from("paid_access_logs")
    .delete()
    .lt("accessed_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  if (!logs || logs.length === 0) {
    return NextResponse.json({ message: "対象ログなし", flagged: 0 });
  }

  const byUser = new Map<string, { company_id: string; accessed_at: string }[]>();
  for (const row of logs as any[]) {
    const arr = byUser.get(row.user_id) ?? [];
    arr.push({ company_id: row.company_id, accessed_at: row.accessed_at });
    byUser.set(row.user_id, arr);
  }

  const flagged: { user_id: string; distinctCount: number; maxBurst: number }[] = [];

  for (const [userId, rows] of byUser.entries()) {
    const distinctCompanies = new Set(rows.map(r => r.company_id)).size;
    const times = rows.map(r => new Date(r.accessed_at).getTime()).sort((a, b) => a - b);

    // 20分の窓をスライドさせ、その中に何件アクセスが集中しているかの最大値を求める
    let maxBurst = 0;
    let start = 0;
    for (let end = 0; end < times.length; end++) {
      while (times[end] - times[start] > BURST_WINDOW_MS) start++;
      maxBurst = Math.max(maxBurst, end - start + 1);
    }

    if (distinctCompanies >= DAILY_THRESHOLD || maxBurst >= BURST_THRESHOLD) {
      flagged.push({ user_id: userId, distinctCount: distinctCompanies, maxBurst });
    }
  }

  if (flagged.length > 0) {
    const userIds = flagged.map(f => f.user_id);
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("id, email")
      .in("id", userIds);
    const emailById = new Map((profiles ?? []).map((p: any) => [p.id, p.email]));

    const body = flagged
      .map(f =>
        `ユーザー: ${emailById.get(f.user_id) ?? f.user_id}\n過去24時間の閲覧銘柄数: ${f.distinctCount}\n20分以内の最大連続アクセス数: ${f.maxBurst}`
      )
      .join("\n\n");

    await notifyAdmin(
      "有料コンテンツの異常な高頻度アクセスを検知",
      `以下のアカウントで、通常の閲覧では考えにくいパターンのアクセスを検知しました。\nスクレイピング(自動取得)の可能性がありますが、閲覧意欲の高い正規会員の可能性もあるため、\n内容をご確認のうえ、必要に応じてご対応ください（自動での利用停止等は行っていません）。\n\n${body}`,
      "warn"
    );
  }

  return NextResponse.json({ checked_users: byUser.size, flagged: flagged.length });
}
