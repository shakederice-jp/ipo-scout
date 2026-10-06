import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { searchNewStockRegistration } from "@/lib/edinet";

// 管理画面の「EDINET書類ID(空白で自動検索)」の🔍ボタンから呼ばれる。
// 2026/10/5改修: 会社名の照合を src/lib/edinet.ts に一本化した。
//  ・EDINET側の会社名は英数字が全角(例:「株式会社ｅｓｔｉｅ」)のため、半角の銘柄名(「estie」)と
//    一致せず、英字社名の会社は書類が実在しても「見つかりませんでした」になっていた不具合を修正。
//  ・180日分を1日ずつ順番に問い合わせていたのを、10日分ずつまとめて問い合わせるようにした。
//  ・EDINETのAPIがエラーを返した場合は、「見つからない」ではなくエラーの内容を表示する。
// 2026/10/6改修: 10日分を同時に問い合わせるとEDINETの回数制限(429)にかかったため、同時問い合わせを
//  2日分までに減らし、回数制限時は待って再試行する。さらに、銘柄の上場日をDBから調べ、
//  「上場日の75日前〜上場日」だけを探すようにした(問い合わせ回数を大幅に減らすため)。
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { company_name, listing_date } = await req.json();
    if (!company_name) return NextResponse.json({ error: "company_name required" }, { status: 400 });

    // 上場日・証券コード(DBから調べる。上場日は画面から渡されればそれを使う)
    let listingDate: string | null = listing_date ?? null;
    let ticker: string | null = null;
    try {
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
      const { data } = await supabase.from("ipo_companies").select("listing_date, ticker").eq("name", company_name).limit(1);
      listingDate = listingDate ?? data?.[0]?.listing_date ?? null;
      ticker = data?.[0]?.ticker ?? null;
    } catch {
      // 調べられなければ直近180日を社名だけで探す
    }

    const { found, daysSearched, apiErrors, seen } = await searchNewStockRegistration(company_name, { days: 180, listingDate, ticker });
    if (found) {
      return NextResponse.json({
        success: true,
        doc_id: found.docId,
        filer_name: found.filerName,
        submit_date: found.submitDate,
        matched_by: found.matchedBy,
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
        `。社名の表記が大きく異なる可能性があります。EDINETで検索した書類ID(S100から始まる8文字)を手入力してください。` +
        // 原因調査用: 検索期間中に見かけた有価証券届出書(最大5件)を添える
        (seen.length
          ? `【参考: 期間中の有価証券届出書】` + seen.slice(0, 5).map((d) => `${d.date} ${d.filerName}(${d.docId}・${d.secCode || "コードなし"})`).join(" / ")
          : `【参考: 期間中に有価証券届出書は1件も見つかりませんでした】`),
      seen,
    }, { status: 404 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
