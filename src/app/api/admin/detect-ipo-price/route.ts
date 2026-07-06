import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";

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
} catch (e: any) {
    console.error("ZIP解析エラー:", e?.message);
    return "";
  }
}

export async function POST(req: NextRequest) {
  try {
    const { doc_id } = await req.json();
    if (!doc_id) return NextResponse.json({ error: "doc_id required" }, { status: 400 });

    let text = "";
    let lastStatus = 0;

    for (const docType of [1, 5]) {
      const url = `https://disclosure.edinet-fsa.go.jp/api/v2/documents/${doc_id}?type=${docType}`;
      const res = await fetch(url, {
        headers: { "Subscription-Key": EDINET_KEY },
        signal: AbortSignal.timeout(25000),
      });
      lastStatus = res.status;
      if (!res.ok) continue;

      const contentType = res.headers.get("content-type") || "";
      const buffer = await res.arrayBuffer();

      // データが小さすぎる場合は、ZIPではなくエラーメッセージ(JSON)の可能性が高いので飛ばす
      if (buffer.byteLength < 1000) {
        const errText = new TextDecoder("utf-8").decode(buffer);
        console.error(`type=${docType}: レスポンスが小さすぎます (${buffer.byteLength} bytes) content="${errText}"`);
        continue;
      }

      const extracted = await extractTextFromZip(buffer);
      if (extracted.length >= 100) {
        text = extracted;
        break;
      }
    }

    if (text.length < 100) {
      return NextResponse.json({ success: false, message: `本文抽出に失敗しました (status=${lastStatus})` });
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