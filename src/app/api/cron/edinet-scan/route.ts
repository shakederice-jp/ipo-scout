import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyAdmin } from "@/lib/notify-admin";
import { postToX } from "@/lib/post-to-x";
import Anthropic from "@anthropic-ai/sdk";

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const EDINET_KEY = process.env.EDINET_API_KEY!;

async function fetchEdinetDocuments(date: string) {
  const url = `https://api.edinet-fsa.go.jp/api/v2/documents.json?date=${date}&type=2&Subscription-Key=${EDINET_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data?.results ?? [];
}

function isProspectus(doc: any): boolean {
  const desc = doc.docDescription || "";
  return (
    doc.ordinanceCode === "010" &&
    desc.includes("有価証券届出書") &&
    !desc.includes("訂正") &&
    !desc.includes("受益証券") &&
    !desc.includes("投資信託") &&
    !doc.secCode  // 証券コードが既にある会社（既存上場企業）は新規IPOではないので除外
  );
}

function isCorrectedProspectus(doc: any): boolean {
  const desc = doc.docDescription || "";
  return (
    doc.ordinanceCode === "010" &&
    desc.includes("有価証券届出書") &&
    desc.includes("訂正") &&
    !desc.includes("受益証券") &&
    !desc.includes("投資信託")
  );
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
    const prospectuses = docs.filter((d: any) => isProspectus(d));

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
        // 新規IPO候補として自動的にipo_companiesへ登録する
        try {
          const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
          const analysisMsg = await claude.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 512,
            messages: [{
              role: "user",
              content: `IPO企業「${companyName}」(EDINETコード: ${edinetCode}, EDINET提出書類ID: ${docId})の事業内容を、一般的な知識をもとに推定してください。JSON形式のみで回答してください（前後の説明文は不要）。\n\n{"sector":"業種名","biz_type":"事業内容の一言説明","ai_summary":"150文字程度の事業概要説明"}`
            }],
          });
          const rawAnalysis = (analysisMsg.content[0] as any).text;
          const jsonMatch = rawAnalysis.match(/\{[\s\S]*\}/);
          const analysisText = jsonMatch ? jsonMatch[0] : rawAnalysis.replace(/```json|```/g, "").trim();
          let analysis: any;
          try {
            analysis = JSON.parse(analysisText);
          } catch {
            analysis = { sector: "不明", biz_type: "不明", ai_summary: "自動検出のため詳細情報は後日更新されます" };
          }

          const { error: insertError } = await supabase
            .from("ipo_companies")
            .insert({
              name: companyName,
              ticker: edinetCo?.security_code ?? null,
              exchange: "グロース",
              sector: analysis.sector,
              biz_type: analysis.biz_type,
              ai_summary: analysis.ai_summary,
              edinet_doc_id: docId,
              status: "自動検出・要確認",
            });

            if (insertError) {
              results.push(`❌ 新規登録失敗: ${companyName} - ${insertError.message}`);
            } else {
              results.push(`🆕 新規IPO候補として自動登録: ${companyName}（${docId}）`);
              await notifyAdmin(
                `🆕 新規IPO発見: ${companyName}`,
                `EDINETで新規上場候補を発見し、自動登録しました。\n\n` +
                `会社名: ${companyName}\n` +
                `EDINETコード: ${edinetCode}\n` +
                `書類ID: ${docId}\n` +
                `業種: ${analysis.sector}\n\n` +
                `管理画面から①〜⑥のステップを実行して分析を完成させてください。\n` +
                `https://ipo.finance-tower.com/admin`,
                "info"
              );

              // X速報投稿
              if (process.env.X_AUTOPOST_ENABLED === "true") {
                try {
                  const tweetText = `【新規上場承認】${companyName}\n\n${analysis.biz_type ?? ""}\n\n目論見書が提出されました。詳細を分析していきます。\n\n詳しくはプロフィールのリンクから👆\n\n#IPO #新規上場`;
                  const postResult = await postToX(tweetText.slice(0, 140));
                  if (postResult.success) {
                    results.push(`🐦 X投稿完了: ${companyName}`);
                  } else {
                    await notifyAdmin(
                      `⚠️ X投稿失敗: ${companyName}`,
                      `速報ツイートの投稿に失敗しました。\n\nエラー: ${postResult.error}`,
                      "warn"
                    );
                  }
                } catch (e: any) {
                  await notifyAdmin(`⚠️ X投稿エラー: ${companyName}`, String(e), "warn");
                }
              }
            }
        } catch (e: any) {
          results.push(`❌ 新規登録エラー: ${companyName} - ${String(e)}`);
        }
        continue;
      }

      // すでにテキスト取得済みならスキップ
      if (targetCompany.raw_prospectus) {
        results.push(`スキップ（取得済み）: ${companyName}`);
        continue;
      }

      // 重いテキスト取得・分析はここでは行わず、管理画面から手動実行してもらう
      results.push(`📌 未処理あり（要手動でテキスト取得）: ${companyName}（${docId}）`);
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
  const corrections = docs.filter((d: any) => isCorrectedProspectus(d));

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
        const price = priceData.price;
        await supabase
          .from("ipo_companies")
          .update({ ipo_price: price })
          .eq("id", matched.id);

        // visualization_dataも自動更新
        const { data: companyData } = await supabase
          .from("ipo_companies")
          .select("structured_data, visualization_data")
          .eq("id", matched.id)
          .single();

        if (companyData) {
          const structured = companyData.structured_data;
          const vizData = companyData.visualization_data ?? {};
          const totalShares = structured?.ipo_details?.total_shares
            ? Number(String(structured.ipo_details.total_shares).replace(/[^0-9]/g, ""))
            : null;
            const marketCap = totalShares && price
            ? Math.round((totalShares * price) / 1000000)
            : null;
          const rawFundraising = structured?.ipo_details?.fundraising_amount ?? null;
          let fundraising = null;
          if (rawFundraising) {
            const str = String(rawFundraising);
            const hyakumanMatch = str.match(/([0-9,]+(?:\.[0-9]+)?)\s*百万円/);
            const okuMatch = str.match(/([0-9,]+(?:\.[0-9]+)?)\s*億円/);
            if (hyakumanMatch) {
              fundraising = Math.round(parseFloat(hyakumanMatch[1].replace(/,/g, "")));
            } else if (okuMatch) {
              fundraising = Math.round(parseFloat(okuMatch[1].replace(/,/g, "")) * 100);
            } else {
              const numMatch = str.match(/([0-9,]+)/);
              if (numMatch) fundraising = Math.round(parseFloat(numMatch[1].replace(/,/g, "")));
            }
          }
          await supabase
            .from("ipo_companies")
            .update({
              visualization_data: {
                ...vizData,
                valuation_table: {
                  ...(vizData?.valuation_table ?? {}),
                  available: true,
                  ipo_price: price,
                  market_cap: marketCap,
                  float_ratio: structured?.ipo_details?.float_ratio ?? null,
                  fundraising: fundraising,
                  title: "バリュエーション指標",
                },
              },
            })
            .eq("id", matched.id);
        }

        results.push(`💰 公募価格自動設定: ${matched.name} → ${price}円`);
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