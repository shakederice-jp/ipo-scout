import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const EDINET_KEY = process.env.EDINET_API_KEY!;

// EDINETから書類一覧を検索（会社名で検索）
async function searchEdinetDoc(companyName: string): Promise<string | null> {
  try {
    // 過去90日間を検索
    const results: string[] = [];
    const today = new Date();
    for (let i = 0; i < 90; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const url = `https://disclosure.edinet-fsa.go.jp/api/v2/documents.json?date=${dateStr}&type=2&Subscription-Key=${EDINET_KEY}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = await res.json();
      const docs = json?.results || [];
      for (const doc of docs) {
        // 有価証券届出書（formCode: 030000）かつ会社名が一致
        if (
          doc.formCode === "030000" &&
          doc.filerName?.includes(companyName.slice(0, 4))
        ) {
          return doc.docID;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

// EDINET書類からセクションを抽出
async function fetchProspectusText(docId: string): Promise<Record<string, string>> {
  try {
    // XBRLまたはCSVのインラインドキュメントを取得
    const url = `https://disclosure.edinet-fsa.go.jp/api/v2/documents/${docId}?type=5&Subscription-Key=${EDINET_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return {};
    const text = await res.text();

    // 主要セクションを抽出（簡易テキスト抽出）
    const sections: Record<string, string> = {};

    const extract = (label: string, patterns: string[]) => {
      for (const pattern of patterns) {
        const idx = text.indexOf(pattern);
        if (idx !== -1) {
          sections[label] = text.slice(idx, idx + 2000).replace(/<[^>]+>/g, "").trim();
          return;
        }
      }
    };

    extract("事業の概況", ["事業の概況", "事業概況"]);
    extract("リスク要因", ["リスク要因", "事業等のリスク"]);
    extract("財務諸表", ["財務諸表", "財政状態"]);
    extract("株主構成", ["大株主", "株主の状況"]);
    extract("資金使途", ["調達資金の使途", "資金の使途"]);
    extract("経営陣", ["役員の状況", "経営者"]);

    return sections;
  } catch {
    return {};
  }
}

export async function POST(req: NextRequest) {
  try {
    const { company_id, company_name, edinet_doc_id } = await req.json();
    const supabase = getSupabase();

    // 書類IDが指定されていない場合は自動検索
    let docId = edinet_doc_id;
    if (!docId) {
      docId = await searchEdinetDoc(company_name);
      if (!docId) {
        return NextResponse.json({ error: "EDINETに書類が見つかりませんでした。書類IDを手動で入力してください。" }, { status: 404 });
      }
    }

    // 目論見書テキスト取得
    const sections = await fetchProspectusText(docId);

    // Supabaseに保存
    await supabase.from("ipo_companies").update({
      edinet_doc_id: docId,
      raw_prospectus: sections,
      analysis_detail: null // 再分析をトリガー
    }).eq("id", company_id);

    return NextResponse.json({
      success: true,
      doc_id: docId,
      sections_found: Object.keys(sections),
      message: `${Object.keys(sections).length}セクション取得完了。分析を再実行してください。`
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}