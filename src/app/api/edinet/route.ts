import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";

export const maxDuration = 60;

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const EDINET_KEY = process.env.EDINET_API_KEY!;

async function searchEdinetDoc(companyName: string): Promise<string | null> {
  const today = new Date();
  for (let i = 0; i < 180; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    try {
      const url = `https://disclosure.edinet-fsa.go.jp/api/v2/documents.json?date=${dateStr}&type=2&Subscription-Key=${EDINET_KEY}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const json = await res.json();
      const docs = json?.results || [];
      const exact = docs.find((doc: any) => doc.formCode === "030000" && doc.filerName === companyName);
      if (exact) return exact.docID;
      const partial = docs.find((doc: any) => doc.formCode === "030000" && doc.filerName?.includes(companyName));
      if (partial) return partial.docID;
    } catch {
      continue;
    }
  }
  return null;
}

function cleanText(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-zA-Z#0-9]+;/g, " ")
    .replace(/[a-z_]+:[A-Za-z][A-Za-z0-9_]*\s+[A-Z][0-9A-Z-]+\s+[\d-]+\s*[\d-]*/g, " ")
    .replace(/E\d{5}-\d{3}/g, " ")
    .replace(/jpcrp_cor:[A-Za-z]+/g, " ")
    .replace(/jppfs_cor:[A-Za-z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSection(text: string, keywords: string[], maxLen = 3000, useLast = false): string {
  const plain = cleanText(text);
  for (const kw of keywords) {
    const idx = useLast ? plain.lastIndexOf(kw) : plain.indexOf(kw);
    if (idx !== -1) {
      const start = Math.max(0, idx - 50);
      return plain.slice(start, start + maxLen);
    }
  }
  return "";
}

// 表紙の【会社名】タグから、書類の本当の提出者名を取り出す
function extractCoverCompanyName(text: string): string {
  const plain = cleanText(text);
  const idx = plain.indexOf("【会社名】");
  if (idx === -1) return "";
  return plain.slice(idx + 6, idx + 60).trim();
}

async function extractTextFromZip(buffer: ArrayBuffer): Promise<string> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    let allText = "";
    const files = Object.keys(zip.files);
    const htmlFiles = files.filter(f =>
      f.endsWith(".htm") || f.endsWith(".html") || f.endsWith(".xhtml")
    );
    const sorted = htmlFiles.sort((a, b) => {
      const priority = (f: string) => {
        if (f.includes("jpcrp") || f.includes("0101")) return 0;
        if (f.includes("jpfr") || f.includes("0201")) return 1;
        return 2;
      };
      return priority(a) - priority(b);
    });
    const targetFiles = sorted.length > 0 ? sorted : files.filter(f => !zip.files[f].dir);
    for (const filename of targetFiles) {
      try {
        const content = await zip.files[filename].async("string");
        if (content.length > 500) {
          allText += content + "\n";
          console.log(`  file: ${filename} len=${content.length}`);
        }
      } catch { continue; }
    }
    return allText;
  } catch (e) {
    console.error("ZIP extraction error:", e);
    return "";
  }
}

async function fetchProspectusText(docId: string): Promise<{ sections: Record<string, string>; coverCompanyName: string }> {
  const sections: Record<string, string> = {};
  let coverCompanyName = "";

  for (const docType of [1, 5]) {
    try {
      const url = `https://disclosure.edinet-fsa.go.jp/api/v2/documents/${docId}?type=${docType}&Subscription-Key=${EDINET_KEY}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
      if (!res.ok) continue;

      const contentType = res.headers.get("content-type") || "";
      const buffer = await res.arrayBuffer();
      let text = "";

      if (contentType.includes("zip") || contentType.includes("octet-stream") || buffer.byteLength > 10000) {
        text = await extractTextFromZip(buffer);
      } else {
        text = new TextDecoder("utf-8").decode(buffer);
      }

      console.log(`type=${docType}: got ${text.length} chars, content="${text.slice(0, 300)}"`);
      if (text.length < 100) continue;
      if (!coverCompanyName) {
        coverCompanyName = extractCoverCompanyName(text);
      }

      const s0 = extractSection(text, [
        "主要な経営指標等の推移", "経営指標等の推移", "主要経営指標",
        "経営成績等の状況", "業績の推移"
      ], 4000);
      if (s0) sections["主要経営指標"] = s0;

      const s1 = extractSection(text, [
        "事業の概況", "事業概況", "事業の内容",
        "当社の事業", "サービスの概要"
      ], 2500);
      if (s1) sections["事業の概況"] = s1;

      const s2 = extractSection(text, [
        "リスク要因", "事業等のリスク", "投資リスク",
        "リスクファクター", "事業上のリスク", "主なリスク",
        "投資者が判断するうえで"
      ], 3500);
      if (s2) sections["リスク要因"] = s2;

    const s4 = extractSection(text, [
      "第４ 【提出会社の状況】",
      "提出会社の状況",
      "１ 【株式等の状況】",
      "株式等の状況",
      "大株主の状況",
      "発行済株式総数に対する所有株式数の割合",
    ], 22000);
    if (s4) sections["株主構成"] = s4;

     const s5 = extractSection(text, [
      "新規発行株式",
      "募集要項",
      "売出株式（引受人の買取引受による売出し）",
      "売出株式",
      "募集又は売出しの概要", "売出しの概要", "募集の概要",
      "オーバーアロットメント", "引受人の買取引受"
    ], 18000);
    if (s5) sections["売出し情報"] = s5;

      const s6 = extractSection(text, [
        "募集又は売出しに関する特別記載事項",
        "ロックアップについて",
        "継続所有等の確約",
        "ロックアップ", "lock-up", "lockup",
        "売却制限", "継続所有", "180日"
      ], 6000, true);
      if (s6) sections["ロックアップ"] = s6;

      const s7 = extractSection(text, [
        "株式の分布状況", "所有者別株式分布",
        "発行済株式総数", "流通株式", "上場時発行済株式数",
        "株式の総数", "単元株式数"
      ], 2500);
      if (s7) sections["株式分布"] = s7;

      const s8 = extractSection(text, [
        "調達資金の使途", "資金の使途", "調達する資金",
        "手取金の使途", "調達資金"
      ], 2000);
      if (s8) sections["資金使途"] = s8;

      const s9 = extractSection(text, [
        "役員の状況", "取締役", "経営者の概要",
        "役員一覧", "代表取締役"
      ], 2000);
      if (s9) sections["経営陣"] = s9;

      if (Object.keys(sections).length < 3) {
        const plain = cleanText(text);
        const total = plain.length;
        if (total > 10000) {
          sections["本文前半"] = plain.slice(Math.floor(total * 0.1), Math.floor(total * 0.1) + 3000);
          sections["本文中盤"] = plain.slice(Math.floor(total * 0.4), Math.floor(total * 0.4) + 3000);
          sections["本文後半"] = plain.slice(Math.floor(total * 0.7), Math.floor(total * 0.7) + 3000);
        }
      }

      if (Object.keys(sections).length > 0) break;
    } catch (e) {
      console.error(`type=${docType} error:`, e);
      continue;
    }
  }

  return { sections, coverCompanyName };
}

export async function POST(req: NextRequest) {
  try {
    const { company_id, company_name, edinet_doc_id } = await req.json();
    const supabase = getSupabase();

    let docId = edinet_doc_id;
    if (!docId) {
      docId = await searchEdinetDoc(company_name);
      if (!docId) {
        return NextResponse.json({
          error: "EDINETに書類が見つかりませんでした。書類IDを手動で入力してください。"
        }, { status: 404 });
      }
    }

    const { sections, coverCompanyName } = await fetchProspectusText(docId);
    const sectionCount = Object.keys(sections).length;
    console.log(`EDINET ${docId}: ${sectionCount}sections, cover="${coverCompanyName}"`, Object.keys(sections));

    // 🛡 安全チェック：表紙の【会社名】が、指定企業名と一致するか検証
    if (sectionCount > 0 && company_name) {
      const nameCore = company_name.replace(/株式会社|㈱/g, "").trim();
      if (coverCompanyName) {
        // 表紙情報が取れた場合は、これを最優先で照合
        if (nameCore && !coverCompanyName.includes(nameCore)) {
          return NextResponse.json({
            error: `取得した書類（docID: ${docId}）の表紙に記載された会社名「${coverCompanyName}」が、指定企業「${company_name}」と一致しません。異なる企業の書類を誤って取得した可能性があるため、保存を中止しました。`,
            doc_id: docId,
          }, { status: 422 });
        }
      } else {
        // 表紙情報が取れなかった場合のみ、本文全体からの照合にフォールバック
        const allText = Object.values(sections).join(" ");
        if (nameCore && !allText.includes(nameCore)) {
          return NextResponse.json({
            error: `取得した書類（docID: ${docId}）の本文に企業名「${company_name}」が見つかりませんでした。異なる企業の書類を誤って取得した可能性があるため、保存を中止しました。書類IDを確認のうえ、手動で正しいdocIDを入力してください。`,
            doc_id: docId,
          }, { status: 422 });
        }
      }
    }

    await supabase.from("ipo_companies").update({
      edinet_doc_id: docId,
      raw_prospectus: sectionCount > 0 ? sections : null,
    }).eq("id", company_id);

    if (sectionCount === 0) {
      return NextResponse.json({
        success: false,
        doc_id: docId,
        sections_found: [],
        message: `書類ID（${docId}）は確認できましたが、本文テキストの抽出に失敗しました。`
      });
    }

    return NextResponse.json({
      success: true,
      doc_id: docId,
      sections_found: Object.keys(sections),
      message: `✅ ${sectionCount}セクション取得完了！次に「②で構造化」を実行してください。`
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}