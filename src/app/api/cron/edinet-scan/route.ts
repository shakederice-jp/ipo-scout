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
    desc.includes("譛我ｾ｡險ｼ蛻ｸ螻雁・譖ｸ") &&
    !desc.includes("險よｭ｣") &&
    !desc.includes("蜿礼寢險ｼ蛻ｸ") &&
    !desc.includes("謚戊ｳ・ｿ｡險・) &&
    !doc.secCode  // 險ｼ蛻ｸ繧ｳ繝ｼ繝峨′譌｢縺ｫ縺ゅｋ莨夂､ｾ・域里蟄倅ｸ雁ｴ莨∵･ｭ・峨・譁ｰ隕終PO縺ｧ縺ｯ縺ｪ縺・・縺ｧ髯､螟・
  );
}

function isCorrectedProspectus(doc: any): boolean {
  const desc = doc.docDescription || "";
  return (
    doc.ordinanceCode === "010" &&
    desc.includes("譛我ｾ｡險ｼ蛻ｸ螻雁・譖ｸ") &&
    desc.includes("險よｭ｣") &&
    !desc.includes("蜿礼寢險ｼ蛻ｸ") &&
    !desc.includes("謚戊ｳ・ｿ｡險・)
  );
}

// 莨夂､ｾ蜷阪・鬘樔ｼｼ蠎ｦ繝√ぉ繝・け(驛ｨ蛻・ｸ閾ｴ繝ｻ豁｣隕丞喧)
function isNameMatch(edinetName: string, ipoName: string): boolean {
  const normalize = (s: string) => s
    .replace(/譬ｪ蠑丈ｼ夂､ｾ|繹ｱ|・域ｪ・榎\(譬ｪ\)/g, "")
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

  // 逶ｴ霑・譌･蛻・ｒ繧ｹ繧ｭ繝｣繝ｳ
  const dates: string[] = [];
  for (let i = 0; i <= 4; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  // ipo_companies縺ｮ蜈ｨ驫俶氛繧貞叙蠕・蜷榊燕繝吶・繧ｹ繝槭ャ繝√Φ繧ｰ逕ｨ)
  const { data: ipoList } = await supabase
    .from("ipo_companies")
    .select("id, name, edinet_doc_id, raw_prospectus");

  for (const date of dates) {
    const docs = await fetchEdinetDocuments(date);

    // 逶ｮ隲冶ｦ区嶌(ordinance_code=010, form_code=030000)縺ｮ縺ｿ謚ｽ蜃ｺ
    const prospectuses = docs.filter((d: any) => isProspectus(d));

    for (const doc of prospectuses) {
      const edinetCode = doc.edinetCode;
      const docId = doc.docID;
      const companyName = doc.filerName;

      if (!edinetCode || !docId) continue;

      // 竭 縺ｾ縺啼dinet_companies繝・・繝悶Ν縺ｧEDINET繧ｳ繝ｼ繝峨ｒ讀懃ｴ｢(譌｢蟄倥Ο繧ｸ繝・け)
      const { data: edinetCo } = await supabase
        .from("edinet_companies")
        .select("company_name, security_code")
        .eq("edinet_code", edinetCode)
        .single();

      let targetCompany: any = null;

      if (edinetCo) {
        // EDINET繧ｳ繝ｼ繝峨〒隕九▽縺九▲縺溷ｴ蜷・竊・ipo_companies縺ｧdocId繧呈､懃ｴ｢
        const { data: found } = await supabase
          .from("ipo_companies")
          .select("id, edinet_doc_id, raw_prospectus")
          .eq("edinet_doc_id", docId)
          .single();
        targetCompany = found;
      } else {
        // 竭｡ EDINET繧ｳ繝ｼ繝峨〒隕九▽縺九ｉ縺ｪ縺九▲縺溷ｴ蜷・竊・莨夂､ｾ蜷阪〒ipo_companies繧呈､懃ｴ｢(譁ｰ隕剰ｿｽ蜉)
        const matched = (ipoList ?? []).find(ipo => isNameMatch(companyName, ipo.name));
        if (matched) {
          // docId縺梧悴險ｭ螳・or 蛻･縺ｮdocId縺悟・縺｣縺ｦ縺・ｋ蝣ｴ蜷医・縺ｿ譖ｴ譁ｰ
          if (!matched.edinet_doc_id || matched.edinet_doc_id !== docId) {
            await supabase
              .from("ipo_companies")
              .update({ edinet_doc_id: docId })
              .eq("id", matched.id);
            results.push(`搭 譖ｸ鬘曵D閾ｪ蜍戊ｨｭ螳・ ${companyName} 竊・${docId}`);
          }
          targetCompany = matched;
        }
      }

      if (!targetCompany) {
        // 譁ｰ隕終PO蛟呵｣懊→縺励※閾ｪ蜍慕噪縺ｫipo_companies縺ｸ逋ｻ骭ｲ縺吶ｋ
        try {
          const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
          const analysisMsg = await claude.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 512,
            messages: [{
              role: "user",
              content: `IPO莨∵･ｭ縲・{companyName}縲・EDINET繧ｳ繝ｼ繝・ ${edinetCode}, EDINET謠仙・譖ｸ鬘曵D: ${docId})縺ｮ莠区･ｭ蜀・ｮｹ繧偵∽ｸ闊ｬ逧・↑遏･隴倥ｒ繧ゅ→縺ｫ謗ｨ螳壹＠縺ｦ縺上□縺輔＞縲・SON蠖｢蠑上・縺ｿ縺ｧ蝗樒ｭ斐＠縺ｦ縺上□縺輔＞・亥燕蠕後・隱ｬ譏取枚縺ｯ荳崎ｦ・ｼ峨・n\n{"sector":"讌ｭ遞ｮ蜷・,"biz_type":"莠区･ｭ蜀・ｮｹ縺ｮ荳險隱ｬ譏・,"ai_summary":"150譁・ｭ礼ｨ句ｺｦ縺ｮ莠区･ｭ讎りｦ∬ｪｬ譏・}`
            }],
          });
          const rawAnalysis = (analysisMsg.content[0] as any).text;
          const jsonMatch = rawAnalysis.match(/\{[\s\S]*\}/);
          const analysisText = jsonMatch ? jsonMatch[0] : rawAnalysis.replace(/```json|```/g, "").trim();
          let analysis: any;
          try {
            analysis = JSON.parse(analysisText);
          } catch {
            analysis = { sector: "荳肴・", biz_type: "荳肴・", ai_summary: "閾ｪ蜍墓､懷・縺ｮ縺溘ａ隧ｳ邏ｰ諠・ｱ縺ｯ蠕梧律譖ｴ譁ｰ縺輔ｌ縺ｾ縺・ };
          }

          const { error: insertError } = await supabase
            .from("ipo_companies")
            .insert({
              name: companyName,
              ticker: edinetCo?.security_code ?? null,
              exchange: "繧ｰ繝ｭ繝ｼ繧ｹ",
              sector: analysis.sector,
              biz_type: analysis.biz_type,
              ai_summary: analysis.ai_summary,
              edinet_doc_id: docId,
              status: "閾ｪ蜍墓､懷・繝ｻ隕∫｢ｺ隱・,
            });

            if (insertError) {
              results.push(`笶・譁ｰ隕冗匳骭ｲ螟ｱ謨・ ${companyName} - ${insertError.message}`);
            } else {
              results.push(`・ 譁ｰ隕終PO蛟呵｣懊→縺励※閾ｪ蜍慕匳骭ｲ: ${companyName}・・{docId}・荏);
              await notifyAdmin(
                `・ 譁ｰ隕終PO逋ｺ隕・ ${companyName}`,
                `EDINET縺ｧ譁ｰ隕丈ｸ雁ｴ蛟呵｣懊ｒ逋ｺ隕九＠縲∬・蜍慕匳骭ｲ縺励∪縺励◆縲・n\n` +
                `莨夂､ｾ蜷・ ${companyName}\n` +
                `EDINET繧ｳ繝ｼ繝・ ${edinetCode}\n` +
                `譖ｸ鬘曵D: ${docId}\n` +
                `讌ｭ遞ｮ: ${analysis.sector}\n\n` +
                `邂｡逅・判髱｢縺九ｉ竭縲懌則縺ｮ繧ｹ繝・ャ繝励ｒ螳溯｡後＠縺ｦ蛻・梵繧貞ｮ梧・縺輔○縺ｦ縺上□縺輔＞縲・n` +
                `https://ipo.finance-tower.com/admin`,
                "info"
              );

              // X騾溷ｱ謚慕ｨｿ
              if (process.env.X_AUTOPOST_ENABLED === "true") {
                try {
                  const tweetText = `縲先眠隕丈ｸ雁ｴ謇ｿ隱阪・{companyName}\n\n${analysis.biz_type ?? ""}\n\n逶ｮ隲冶ｦ区嶌縺梧署蜃ｺ縺輔ｌ縺ｾ縺励◆縲りｩｳ邏ｰ繧貞・譫舌＠縺ｦ縺・″縺ｾ縺吶・n\n隧ｳ縺励￥縺ｯ繝励Ο繝輔ぅ繝ｼ繝ｫ縺ｮ繝ｪ繝ｳ繧ｯ縺九ｉ漕\n\n#IPO #譁ｰ隕丈ｸ雁ｴ`;
                  const postResult = await postToX(tweetText.slice(0, 140));
                  if (postResult.success) {
                    results.push(`凄 X謚慕ｨｿ螳御ｺ・ ${companyName}`);
                  } else {
                    await notifyAdmin(
                      `笞・・X謚慕ｨｿ螟ｱ謨・ ${companyName}`,
                      `騾溷ｱ繝・う繝ｼ繝医・謚慕ｨｿ縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲・n\n繧ｨ繝ｩ繝ｼ: ${postResult.error}`,
                      "warn"
                    );
                  }
                } catch (e: any) {
                  await notifyAdmin(`笞・・X謚慕ｨｿ繧ｨ繝ｩ繝ｼ: ${companyName}`, String(e), "warn");
                }
              }
            }
        } catch (e: any) {
          results.push(`笶・譁ｰ隕冗匳骭ｲ繧ｨ繝ｩ繝ｼ: ${companyName} - ${String(e)}`);
        }
        continue;
      }

      // 縺吶〒縺ｫ繝・く繧ｹ繝亥叙蠕玲ｸ医∩縺ｪ繧峨せ繧ｭ繝・・
      if (targetCompany.raw_prospectus) {
        results.push(`繧ｹ繧ｭ繝・・・亥叙蠕玲ｸ医∩・・ ${companyName}`);
        continue;
      }

      // 驥阪＞繝・く繧ｹ繝亥叙蠕励・蛻・梵縺ｯ縺薙％縺ｧ縺ｯ陦後ｏ縺壹∫ｮ｡逅・判髱｢縺九ｉ謇句虚螳溯｡後＠縺ｦ繧ゅｉ縺・
      results.push(`東 譛ｪ蜃ｦ逅・≠繧奇ｼ郁ｦ∵焔蜍輔〒繝・く繧ｹ繝亥叙蠕暦ｼ・ ${companyName}・・{docId}・荏);
    }
  }

// 竭｢ 蜈ｬ蜍滉ｾ｡譬ｼ縺後∪縺譛ｪ遒ｺ螳壹・驫俶氛縺ｫ縺､縺・※縲∬ｨよｭ｣螻雁・譖ｸ縺九ｉ萓｡譬ｼ繧定・蜍募叙蠕・
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

        // visualization_data繧り・蜍墓峩譁ｰ
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
            const hyakumanMatch = str.match(/([0-9,]+(?:\.[0-9]+)?)\s*逋ｾ荳・・/);
            const okuMatch = str.match(/([0-9,]+(?:\.[0-9]+)?)\s*蜆・・/);
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
                  title: "繝舌Μ繝･繧ｨ繝ｼ繧ｷ繝ｧ繝ｳ謖・ｨ・,
                },
              },
            })
            .eq("id", matched.id);
        }

        results.push(`腸 蜈ｬ蜍滉ｾ｡譬ｼ閾ｪ蜍戊ｨｭ螳・ ${matched.name} 竊・${price}蜀・);
      } else {
        results.push(`笞・・蜈ｬ蜍滉ｾ｡譬ｼ譛ｪ讀懷・: ${matched.name}・・{priceData.message ?? "荳肴・"}・荏);
      }
    } catch {
      results.push(`笶・蜈ｬ蜍滉ｾ｡譬ｼ蜿門ｾ鈴壻ｿ｡繧ｨ繝ｩ繝ｼ: ${matched.name}`);
    }
  }
}
}

  const errors = results.filter(r => r.startsWith("笶・));
  if (errors.length > 0) {
    await notifyAdmin(
      `EDINET繧ｹ繧ｭ繝｣繝ｳ 繧ｨ繝ｩ繝ｼ縺ゅｊ・・{errors.length}莉ｶ・荏,
      `螳溯｡梧律譎・ ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}\n\n邨先棡:\n${results.join("\n")}`,
      "warn"
    );
  }


  return NextResponse.json({ success: true, results, scanned_dates: dates });
}