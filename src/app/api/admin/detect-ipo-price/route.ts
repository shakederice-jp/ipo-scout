import { NextRequest, NextResponse } from "next/server";

const EDINET_KEY = process.env.EDINET_API_KEY!;

function cleanText(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-zA-Z#0-9]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// テキストの中から「発行価格」「公開価格」「払込金額」の近くにある金額を探す
function extractPrice(text: string): number | null {
  const plain = cleanText(text);
  const patterns = [
    /発行価格[^0-9]{0,15}([0-9,]{3,6})\s*円/,
    /公開価格[^0-9]{0,15}([0-9,]{3,6})\s*円/,
    /払込金額[^0-9]{0,15}([0-9,]{3,6})\s*円/,
    /１株につき\s*金?\s*([0-9,]{3,6})\s*円/,
  ];
  for (const pattern of patterns) {
    const m = plain.match(pattern);
    if (m) {
      const num = parseInt(m[1].replace(/,/g, ""), 10);
      if (num >= 50 && num <= 100000) return num; // 明らかにおかしい値は除外
    }
  }
  return null;
}

async function extractTextFromZip(buffer: ArrayBuffer): Promise<string> {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buffer);
    let allText = "";
    const files = Object.keys(zip.files).filter(
      (f) => f.endsWith(".htm") || f.endsWith(".html") || f.endsWith(".xhtml")
    );
    for (const filename of files) {
      try {
        const content = await zip.files[filename].async("string");
        if (content.length > 200) allText += content + "\n";
      } catch { continue; }
    }
    return allText;
  } catch {
    return "";
  }
}

export async function POST(req: NextRequest) {
  try {
    const { doc_id } = await req.json();
    if (!doc_id) return NextResponse.json({ error: "doc_id required" }, { status: 400 });

    const url = `https://disclosure.edinet-fsa.go.jp/api/v2/documents/${doc_id}?type=1`;
    const res = await fetch(url, {
      headers: { "Subscription-Key": EDINET_KEY },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) {
      return NextResponse.json({ success: false, message: `EDINET取得失敗 status=${res.status}` });
    }

    const buffer = await res.arrayBuffer();
    const text = await extractTextFromZip(buffer);
    if (text.length < 100) {
      return NextResponse.json({ success: false, message: "本文抽出に失敗しました" });
    }

    const price = extractPrice(text);
    if (price === null) {
      return NextResponse.json({ success: false, message: "価格の記載が見つかりませんでした" });
    }

    return NextResponse.json({ success: true, price });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}