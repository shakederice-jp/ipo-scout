import { NextRequest, NextResponse } from "next/server";
import { searchNewStockRegistration } from "@/lib/edinet";

// 管理画面の「EDINET書類ID(空白で自動検索)」の🔍ボタンから呼ばれる。
// 2026/10/5改修: 会社名の照合を src/lib/edinet.ts に一本化した。
//  ・EDINET側の会社名は英数字が全角(例:「株式会社ｅｓｔｉｅ」)のため、半角の銘柄名(「estie」)と
//    一致せず、英字社名の会社は書類が実在しても「見つかりませんでした」になっていた不具合を修正。
//  ・180日分を1日ずつ順番に問い合わせていたのを、10日分ずつまとめて問い合わせるようにした。
//  ・EDINETのAPIがエラーを返した場合は、「見つからない」ではなくエラーの内容を表示する。
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { company_name } = await req.json();
    if (!company_name) return NextResponse.json({ error: "company_name required" }, { status: 400 });

    const { found, daysSearched, apiErrors } = await searchNewStockRegistration(company_name, { days: 180 });
    if (found) {
      return NextResponse.json({
        success: true,
        doc_id: found.docId,
        filer_name: found.filerName,
        submit_date: found.submitDate,
      });
    }

    // 問い合わせた日の多くでEDINETがエラーを返していた場合は、検索自体ができていない
    if (apiErrors.length > 0 && apiErrors.length >= daysSearched / 2) {
      return NextResponse.json({
        error: `EDINETへの問い合わせでエラーが続いたため、検索できませんでした(${apiErrors[0].error})。時間をおいて再度お試しください。続く場合はEDINETのAPIキーの有効期限をご確認ください。`,
      }, { status: 502 });
    }
    return NextResponse.json({
      error: `「${company_name}」の有価証券届出書が直近${daysSearched}日のEDINETに見つかりませんでした` +
        (apiErrors.length ? `(うち${apiErrors.length}日分は問い合わせエラー)` : "") +
        `。社名の表記が大きく異なる可能性があります。EDINETで検索した書類ID(S100から始まる8文字)を手入力してください。`,
    }, { status: 404 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
