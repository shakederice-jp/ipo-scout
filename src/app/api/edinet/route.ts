import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const EDINET_KEY = process.env.EDINET_API_KEY!;

// EDINETから書類一覧を検索（会社名で検索）
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

// テキストからセクションを抽出（XBRL・HTML対応）
function extractSection(text: string, keywords: string[]): string {
  // まずXBRLタグを除去
  const plain = text
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-zA-Z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  
  for (const kw of keywords) {
    const idx = plain.indexOf(kw);
    if (idx !== -1) {
      // キーワードの前後1500文字を取得
      const start = Math.max(0, idx - 50);
      return plain.slice(start, start + 1500);
    }
  }
  return "";
}

// EDINET書類からセクションを抽出
async function fetchProspectusText(docId: string): Promise<Record<string, string>> {
  const sections: Record<string, string> = {};

  // type=5: インラインXBRL（有価証券届出書本文）
  try {
    const url = `https://disclosure.edinet-fsa.go.jp/api/v2/documents/${docId}?type=5&Subscription-Key=${EDINET_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    
    if (res.ok) {
      const contentType = res.headers.get("content-type") || "";
      let text = "";
      
      if (contentType.includes("zip") || contentType.includes("octet-stream")) {
        // ZIPの場合はスキップ（type=4で再試行）
      } else {
        text = await res.text();
      }

      if (text.length > 100) {
        const s1 = extractSection(text, ["事業の概況", "事業概況", "ビジネス"]);
        if (s1) sections["事業の概況"] = s1;

        const s2 = extractSection(text, ["リスク要因", "事業等のリスク", "投資リスク"]);
        if (s2) sections["リスク要因"] = s2;

        const s3 = extractSection(text, ["財務諸表", "財政状態", "損益計算"]);
        if (s3) sections["財務諸表"] = s3;

        const s4 = extractSection(text, ["大株主", "株主の状況", "主要株主"]);
        if (s4) sections["株主構成"] = s4;

        const s5 = extractSection(text, ["調達資金の使途", "資金の使途", "調達する資金"]);
        if (s5) sections["資金使途"] = s5;

        const s6 = extractSection(text, ["役員の状況", "経営者の概要", "取締役"]);
        if (s6) sections["経営陣"] = s6;
      }
    }
  } catch (e) {
    console.error("EDINET fetch error:", e);
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

    console.log(`EDINET docId: ${docId}, sections: ${sectionCount}`, Object.keys(sections));

    // Supabaseに保存（セクションが0でも書類IDは保存）
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
        message: `書類ID（${docId}）は確認できましたが、本文テキストの抽出に失敗しました。EDINETのXBRL形式の問題の可能性があります。`
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