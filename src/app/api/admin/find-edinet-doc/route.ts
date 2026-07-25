import { NextRequest, NextResponse } from "next/server";

const EDINET_KEY = process.env.EDINET_API_KEY!;

function normalize(s: string): string {
  return s
    .replace(/株式会社|㈱|\(株\)|（株）|合同会社|有限会社/g, "")
    .replace(/[　\s]/g, "")
    .trim();
}

function isMatch(filerName: string, companyName: string): boolean {
  const a = normalize(filerName);
  const b = normalize(companyName);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) && b.length >= 4) return true;
  if (b.includes(a) && a.length >= 4) return true;
  return false;
}

async function searchEdinetDoc(companyName: string): Promise<{docId: string; filerName: string} | null> {
  const today = new Date();
  for (let i = 0; i < 180; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    try {
      const url = `https://api.edinet-fsa.go.jp/api/v2/documents.json?date=${dateStr}&type=2&Subscription-Key=${EDINET_KEY}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        if (i === 0) {
          const errText = await res.text();
          console.error(`[EDINET検索] ${dateStr} エラー status=${res.status} body=${errText.slice(0, 300)}`);
        }
        continue;
      }
      const json = await res.json();
      const docs = json?.results || [];
      const exact = docs.find((doc: any) =>
        doc.formCode === "030000" && normalize(doc.filerName) === normalize(companyName)
      );
      if (exact) return { docId: exact.docID, filerName: exact.filerName };
      const partial = docs.find((doc: any) =>
        doc.formCode === "030000" && isMatch(doc.filerName ?? "", companyName)
      );
      if (partial) return { docId: partial.docID, filerName: partial.filerName };
    } catch (e: any) {
      if (i === 0) {
        console.error(`[EDINET検索] fetch自体が失敗 error=${e?.message || e}`);
      }
      continue;
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { company_name } = await req.json();
    if (!company_name) return NextResponse.json({ error: "company_name required" }, { status: 400 });
    const result = await searchEdinetDoc(company_name);
    if (!result) return NextResponse.json({
      error: `「${company_name}」の目論見書が直近180日のEDINETに見つかりませんでした`
    }, { status: 404 });
    return NextResponse.json({ success: true, doc_id: result.docId, filer_name: result.filerName });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}