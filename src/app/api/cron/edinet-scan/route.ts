import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyAdmin } from "@/lib/notify-admin";

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function fetchEdinetDocuments(date: string) {
  const url = `https://disclosure.edinet-fsa.go.jp/api/v2/documents.json?date=${date}&type=2`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data?.results ?? [];
}

// 会社名の類似度チェック(部分一致・正規化)
function isNameMatch(edinetName: string, ipoName: string): boolean {
  const normalize = (s: string) => s
    .replace(/株式会社|㈱|（株）|\(株\)/g, "")
    .replace(/\s+/g, "")
    .trim();
  const a = normalize(edinetName);
  const b = normalize(ipoName);
  return a === b || a.includes(b) || b.includes(a);
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const results: string[] = [];

  // 直近5日分をスキャン
  const dates: string[] = [];
  for (let i = 0; i <= 4; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  // ipo_companiesの全銘柄を取得(名前ベースマッチング用)
  const { data: ipoList } = await supabase
    .from("ipo_companies")
    .select("id, name, edinet_doc_id, raw_prospectus");

  for (const date of dates) {
    const docs = await fetchEdinetDocuments(date);

    // 目論見書(ordinance_code=010, form_code=030000)のみ抽出
    const prospectuses = docs.filter((d: any) =>
      d.ordinanceCode === "010" && d.formCode === "030000"
    );

    for (const doc of prospectuses) {
      const edinetCode = doc.edinetCode;
      const docId = doc.docID;
      const companyName = doc.filerName;

      if (!edinetCode || !docId) continue;

      // ① まずedinet_companiesテーブルでEDINETコードを検索(既存ロジック)
      const { data: edinetCo } = await supabase
        .from("edinet_companies")
        .select("company_name, security_code")
        .eq("edinet_code", edinetCode)
        .single();

      let targetCompany: any = null;

      if (edinetCo) {
        // EDINETコードで見つかった場合 → ipo_companiesでdocIdを検索
        const { data: found } = await supabase
          .from("ipo_companies")
          .select("id, edinet_doc_id, raw_prospectus")
          .eq("edinet_doc_id", docId)
          .single();
        targetCompany = found;
      } else {
        // ② EDINETコードで見つからなかった場合 → 会社名でipo_companiesを検索(新規追加)
        const matched = (ipoList ?? []).find(ipo => isNameMatch(companyName, ipo.name));
        if (matched) {
          // docIdが未設定 or 別のdocIdが入っている場合のみ更新
          if (!matched.edinet_doc_id || matched.edinet_doc_id !== docId) {
            await supabase
              .from("ipo_companies")
              .update({ edinet_doc_id: docId })
              .eq("id", matched.id);
            results.push(`📋 書類ID自動設定: ${companyName} → ${docId}`);
          }
          targetCompany = matched;
        }
      }

      if (!targetCompany) {
        results.push(`スキップ（ipo_companies未登録）: ${companyName}`);
        continue;
      }

      // すでにテキスト取得済みならスキップ
      if (targetCompany.raw_prospectus) {
        results.push(`スキップ（取得済み）: ${companyName}`);
        continue;
      }

      // ① EDINETテキスト取得を自動実行
      try {
        const edinetRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/edinet`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company_id: targetCompany.id,
            company_name: companyName,
            edinet_doc_id: docId,
          }),
        });
        const edinetData = await edinetRes.json();
        if (edinetData.error) {
          results.push(`❌ テキスト取得失敗: ${companyName} - ${edinetData.error}`);
        } else {
          results.push(`✅ テキスト取得成功: ${companyName}（${docId}）`);
          // ② 分析・ai_summary自動生成
          try {
            const analyzeRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/analyze`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: targetCompany.id }),
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

// ③ 公募価格がまだ未確定の銘柄について、訂正届出書から価格を自動取得
const { data: pendingPriceList } = await supabase
.from("ipo_companies")
.select("id, name")
.is("ipo_price", null);

if (pendingPriceList && pendingPriceList.length > 0) {
for (const date of dates) {
  const docs = await fetchEdinetDocuments(date);
  const corrections = docs.filter((d: any) =>
    d.ordinanceCode === "010" && d.formCode === "030001"
  );

  for (const doc of corrections) {
    const companyName = doc.filerName;
    const matched = pendingPriceList.find((c) => isNameMatch(companyName, c.name));
    if (!matched) continue;

    try {
      const priceRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/admin/detect-ipo-price`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc_id: doc.docID }),
      });
      const priceData = await priceRes.json();

      if (priceData.success && priceData.price) {
        await supabase
          .from("ipo_companies")
          .update({ ipo_price: priceData.price })
          .eq("id", matched.id);
        results.push(`💰 公募価格自動設定: ${matched.name} → ${priceData.price}円`);
      } else {
        results.push(`⚠️ 公募価格未検出: ${matched.name}（${priceData.message ?? "不明"}）`);
      }
    } catch {
      results.push(`❌ 公募価格取得通信エラー: ${matched.name}`);
    }
  }
}
}

  const errors = results.filter(r => r.startsWith("❌"));
  if (errors.length > 0) {
    await notifyAdmin(
      `EDINETスキャン エラーあり（${errors.length}件）`,
      `実行日時: ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}\n\n結果:\n${results.join("\n")}`,
      "warn"
    );
  }


  return NextResponse.json({ success: true, results, scanned_dates: dates });
}