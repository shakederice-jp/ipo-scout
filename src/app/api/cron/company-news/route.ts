import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { runCompanyNews } from "@/lib/company-news";

// 2026/10/24新設(束D・⑦): 分析ページの「この銘柄の最新情報」欄のための、新情報の収集。
// 毎日2回(vercel.json)。調べる銘柄は、上場からの経過に応じた頻度で、期限が来たものから最大5社。
// 手動で試すとき(管理画面にログインした状態で開く):
//   ?dry=1          … どの銘柄を調べる予定かだけを表示(検索は行わない)
//   ?company=<ID>   … 指定した銘柄だけを、頻度に関係なく今すぐ調べる
//   ?limit=2        … 1回に調べる社数を指定(最大5)
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const limitRaw = Number(sp.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 5) : undefined;
  const report = await runCompanyNews({ limit, onlyId: sp.get("company") || undefined, dry: sp.get("dry") === "1" });
  return NextResponse.json(report);
}
