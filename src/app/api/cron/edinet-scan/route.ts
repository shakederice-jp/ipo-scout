import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyAdmin } from "@/lib/notify-admin";

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// EDINET APIから当日提出された目論見書一覧を取得
async function fetchEdinetDocuments(date: string) {
  const url = `https://disclosure.edinet-fsa.go.jp/api/v2/documents.json?date=${date}&type=2`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data?.results ?? [];
}

export async function GET(req: NextRequest) {
 // Vercel Cronからの正規リクエストかチェック
 const authHeader = req.headers.get("authorization");
 if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

  const supabase = getSupabase();
  const results: string[] = [];

  // 直近7日分をスキャン（月・木の2回実行なので最大4日前まで）
  const dates: string[] = [];
  for (let i = 0; i <= 4; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  for (const date of dates) {
    const docs = await fetchEdinetDocuments(date);

    // 目論見書（ordinance_code=010, form_code=030000）のみ抽出
    const prospectuses = docs.filter((d: any) =>
      d.ordinanceCode === "010" && d.formCode === "030000"
    );

    for (const doc of prospectuses) {
      const edinetCode = doc.edinetCode;
      const docId = doc.docID;
      const companyName = doc.filerName;

      if (!edinetCode || !docId) continue;

      // edinet_companiesテーブルでEDINETコードを検索
      const { data: edinetCo } = await supabase
        .from("edinet_companies")
        .select("company_name, security_code")
        .eq("edinet_code", edinetCode)
        .single();

      if (!edinetCo) continue;

      // ipo_companiesにすでに登録済みかチェック
      const { data: existing } = await supabase
        .from("ipo_companies")
        .select("id, edinet_doc_id, raw_prospectus")
        .eq("edinet_doc_id", docId)
        .single();

      if (!existing) {
        results.push(`スキップ（ipo_companies未登録）: ${companyName}`);
        continue;
      }

      // すでにテキスト取得済みならスキップ
      if (existing.raw_prospectus) {
        results.push(`スキップ（取得済み）: ${companyName}`);
        continue;
      }

      // ①EDINETテキスト取得を自動実行
      try {
        const edinetRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/edinet`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company_id: existing.id,
            company_name: companyName,
            edinet_doc_id: docId,
          }),
        });
        const edinetData = await edinetRes.json();
        if (edinetData.error) {
          results.push(`❌ テキスト取得失敗: ${companyName} - ${edinetData.error}`);
        } else {
          results.push(`✅ テキスト取得成功: ${companyName}（${docId}）`);
          // ②分析・ai_summary自動生成
          try {
            const analyzeRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/analyze`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: existing.id }),
            });
            const analyzeData = await analyzeRes.json();
            if (analyzeData.error) {
              results.push(`⚠️ 分析失敗: ${companyName} - ${analyzeData.error}`);
            } else {
              results.push(`✅ 分析・ai_summary生成完了: ${companyName}`);
            }
          } catch (e) {
            results.push(`⚠️ 分析通信エラー: ${companyName}`);
          }
        }
      } catch (e) {
        results.push(`❌ 通信エラー: ${companyName}`);
      }
    }
  }

  // エラーが1件以上あれば管理者通知
  const errors = results.filter(r => r.startsWith('❌'));
  if (errors.length > 0) {
    await notifyAdmin(
      `EDINETスキャン エラーあり（${errors.length}件）`,
      `実行日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}\n\n` +
      `結果サマリー:\n${results.join('\n')}`,
      'warn'
    );
  }

  return NextResponse.json({ success: true, results, scanned_dates: dates });
}