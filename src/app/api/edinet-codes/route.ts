import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = (await createSupabaseServerClient())!;

  try {
    // EDINETコードリストCSVをダウンロード
    const url = "https://disclosure2.edinet-fsa.go.jp/EKW0EZ0015.aspx";
    const formData = new URLSearchParams();
    formData.append("lgKbn", "2");
    formData.append("dflg", "0");
    formData.append("iflg", "0");
    formData.append("dispkbn", "1");

    const res = await fetch(
      "https://disclosure2dl.edinet-fsa.go.jp/searchdocument/codelist/Edinetcode_JP.zip",
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );

    if (!res.ok) {
      return NextResponse.json({ error: `ダウンロード失敗: ${res.status}` }, { status: 500 });
    }

    // ZIPを展開してCSVを取得
    const buffer = await res.arrayBuffer();
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(buffer);

    // CSVファイルを探す
    const csvFile = Object.values(zip.files).find(f => f.name.endsWith(".csv") && !f.dir);
    if (!csvFile) {
      return NextResponse.json({ error: "CSV not found in ZIP" }, { status: 500 });
    }

    const csvText = await csvFile.async("string");
    const lines = csvText.split("\n");

    // 2行目がヘッダー、3行目以降がデータ
    const records: any[] = [];
    for (let i = 2; i < lines.length; i++) {
      const cols = lines[i].split(",").map(c => c.replace(/^"|"$/g, "").trim());
      if (!cols[0] || !cols[0].startsWith("E")) continue;

      records.push({
        edinet_code: cols[0],
        company_name: cols[6] || null,
        company_name_en: cols[7] || null,
        security_code: cols[11] || null,
        industry: cols[10] || null,
        listing_status: cols[2] || null,
        updated_at: new Date().toISOString(),
      });
    }

    if (records.length === 0) {
      return NextResponse.json({ error: "パースできたレコードが0件です" }, { status: 500 });
    }

    // Supabaseにupsert（1000件ずつバッチ処理）
    const BATCH = 1000;
    let upserted = 0;
    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH);
      const { error } = await supabase
        .from("edinet_companies")
        .upsert(batch, { onConflict: "edinet_code" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      upserted += batch.length;
    }

    return NextResponse.json({ success: true, total: upserted });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}