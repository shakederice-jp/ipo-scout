import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const EDINET_KEY = process.env.EDINET_API_KEY!;

async function searchEdinetDoc(companyName: string): Promise<string | null> {
  try {
    const today = new Date();
    const name4 = companyName.slice(0, 4);
    for (let i = 0; i < 90; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const url = `https://disclosure.edinet-fsa.go.jp/api/v2/documents.json?date=${dateStr}&type=2&Subscription-Key=${EDINET_KEY}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) continue;
      const json = await res.json();
      const docs = json?.results || [];
      for (const doc of docs) {
        if (doc.formCode === "030000" && doc.filerName?.includes(name4)) {
          return doc.docID;
        }
      }
    }
    return null;
  } catch { return null; }
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

function extractSection(text: string, keywords: string[], maxLen = 3000): string {
  const plain = cleanText(text);
  for (const kw of keywords) {
    const idx = plain.indexOf(kw);
    if (idx !== -1) {
      const start = Math.max(0, idx - 50);
      return plain.slice(start, start + maxLen);
    }
  }
  return "";
}

async function extractTextFromZip(buffer: ArrayBuffer): Promise<string> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    let allText = "";
    const files = Object.keys(zip.files);
    const htmlFiles = files.filter(f => f.endsWith(".htm") || f.endsWith(".html") || f.endsWith(".xhtml"));
    const targetFiles = htmlFiles.length > 0 ? htmlFiles : files.filter(f => !zip.files[f].dir);
    for (const filename of targetFiles.slice(0, 5)) {
      try {
        const content = await zip.files[filename].async("string");
        if (content.length > 500) allText += content + "\n";
      } catch { continue; }
    }
    return allText;
  } catch (e) {
    console.error("ZIP extraction error:", e);
    return "";
  }
}

async function fetchProspectusText(docId: string): Promise<Record<string, string>> {
  const sections: Record<string, string> = {};

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

      if (text.length < 100) continue;
      console.log(`type=${docType}: got ${text.length} chars`);

      // 主要経営指標（売上高・利益が含まれる最重要セクション）
      const s0 = extractSection(text, ["主要な経営指標等の推移", "経営指標等の推移", "主要経営指標"], 4000);
      if (s0) sections["主要経営指標"] = s0;

      const s1 = extractSection(text, ["事業の概況", "事業概況", "ビジネスの内容"], 2000);
      if (s1) sections["事業の概況"] = s1;

      const s2 = extractSection(text, ["リスク要因", "事業等のリスク", "投資リスク"], 3000);
      if (s2) sections["リスク要因"] = s2;

      const s3 = extractSection(text, ["損益計算書", "売上高", "営業利益"], 3000);
      if (s3) sections["損益計算書"] = s3;

      const s4 = extractSection(text, ["大株主", "株主の状況", "主要株主"], 2000);
      if (s4) sections["株主構成"] = s4;

      const s5 = extractSection(text, ["調達資金の使途", "資金の使途", "調達する資金"], 2000);
      if (s5) sections["資金使途"] = s5;

      const s6 = extractSection(text, ["役員の状況", "経営者の概要", "取締役"], 2000);
      if (s6) sections["経営陣"] = s6;

      if (Object.keys(sections).length > 0) break;
    } catch (e) {
      console.error(`type=${docType} error:`, e);
      continue;
    }
  }

  return sections;
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

    const sections = await fetchProspectusText(docId);
    const sectionCount = Object.keys(sections).length;
    console.log(`EDINET ${docId}: ${sectionCount}sections`, Object.keys(sections));

    await supabase.from("ipo_companies").update({
      edinet_doc_id: docId,
      raw_prospectus: sectionCount > 0 ? sections : null,
      analysis_detail: null
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
      message: `${sectionCount}セクション取得完了！分析ページを開いて再生成してください。`
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}