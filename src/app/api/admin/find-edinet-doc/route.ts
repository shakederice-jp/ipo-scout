import { NextRequest, NextResponse } from "next/server";

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
      const normalize = (s: string) => s.replace(/株式会社|㈱/g, "").replace(/\s+/g, "").trim();
      const exact = docs.find((doc: any) => doc.formCode === "030000" && doc.filerName === companyName);
      if (exact) return exact.docID;
      const partial = docs.find((doc: any) => doc.formCode === "030000" && (
        doc.filerName?.includes(normalize(companyName)) ||
        normalize(doc.filerName ?? "").includes(normalize(companyName))
      ));
      if (partial) return partial.docID;
    } catch { continue; }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { company_name } = await req.json();
    if (!company_name) return NextResponse.json({ error: "company_name required" }, { status: 400 });
    const docId = await searchEdinetDoc(company_name);
    if (!docId) return NextResponse.json({ error: `「${company_name}」の目論見書が直近180日のEDINETに見つかりませんでした` }, { status: 404 });
    return NextResponse.json({ success: true, doc_id: docId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
