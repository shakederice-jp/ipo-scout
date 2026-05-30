import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const EDINET_KEY = process.env.EDINET_API_KEY!;

// EDINET縺九ｉ譖ｸ鬘樔ｸ隕ｧ繧呈､懃ｴ｢
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

// 繝・く繧ｹ繝医°繧峨そ繧ｯ繧ｷ繝ｧ繝ｳ繧呈歓蜃ｺ
function extractSection(text: string, keywords: string[]): string {
  const plain = text
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-zA-Z#0-9]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const kw of keywords) {
    const idx = plain.indexOf(kw);
    if (idx !== -1) {
      const start = Math.max(0, idx - 50);
      return plain.slice(start, start + 5000);
    }
  }
  return "";
}

// ZIP繧定ｧ｣蜃阪＠縺ｦHTML繝・く繧ｹ繝医ｒ蜿門ｾ・
async function extractTextFromZip(buffer: ArrayBuffer): Promise<string> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    let allText = "";
    const files = Object.keys(zip.files);
    
    // HTML繝輔ぃ繧､繝ｫ繧貞━蜈医＠縺ｦ隱ｭ縺ｿ霎ｼ繧
    const htmlFiles = files.filter(f => f.endsWith(".htm") || f.endsWith(".html") || f.endsWith(".xhtml"));
    const targetFiles = htmlFiles.length > 0 ? htmlFiles : files.filter(f => !zip.files[f].dir);
    
    for (const filename of targetFiles.slice(0, 5)) {
      try {
        const content = await zip.files[filename].async("string");
        if (content.length > 500) {
          allText += content + "\n";
        }
      } catch { continue; }
    }
    return allText;
  } catch (e) {
    console.error("ZIP extraction error:", e);
    return "";
  }
}

// EDINET譖ｸ鬘槭°繧峨そ繧ｯ繧ｷ繝ｧ繝ｳ繧呈歓蜃ｺ
async function fetchProspectusText(docId: string): Promise<Record<string, string>> {
  const sections: Record<string, string> = {};
  
  // type=1: 謠仙・譖ｸ鬘杙IP・医Γ繧､繝ｳ・・
  for (const docType of [1, 5]) {
    try {
      const url = `https://disclosure.edinet-fsa.go.jp/api/v2/documents/${docId}?type=${docType}&Subscription-Key=${EDINET_KEY}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
      if (!res.ok) continue;

      const contentType = res.headers.get("content-type") || "";
      const buffer = await res.arrayBuffer();
      let text = "";

      if (contentType.includes("zip") || contentType.includes("octet-stream") || buffer.byteLength > 10000) {
        // ZIP縺ｨ縺励※隗｣蜃阪ｒ隧ｦ縺ｿ繧・
        text = await extractTextFromZip(buffer);
      } else {
        text = new TextDecoder("utf-8").decode(buffer);
      }

      if (text.length < 100) continue;

      console.log(`type=${docType}: got ${text.length} chars`);

      const s1 = extractSection(text, ["莠区･ｭ縺ｮ讎よｳ・, "莠区･ｭ讎よｳ・, "繝薙ず繝阪せ縺ｮ蜀・ｮｹ"]);
      if (s1) sections["莠区･ｭ縺ｮ讎よｳ・] = s1;

      const s2 = extractSection(text, ["繝ｪ繧ｹ繧ｯ隕∝屏", "莠区･ｭ遲峨・繝ｪ繧ｹ繧ｯ", "謚戊ｳ・Μ繧ｹ繧ｯ"]);
      if (s2) sections["繝ｪ繧ｹ繧ｯ隕∝屏"] = s2;

      const s3 = extractSection(text, ["雋｡蜍呵ｫｸ陦ｨ", "雋｡謾ｿ迥ｶ諷・, "謳咲寢險育ｮ玲嶌"]);
      if (s3) sections["雋｡蜍呵ｫｸ陦ｨ"] = s3;

      const s4 = extractSection(text, ["螟ｧ譬ｪ荳ｻ", "譬ｪ荳ｻ縺ｮ迥ｶ豕・, "荳ｻ隕∵ｪ荳ｻ"]);
      if (s4) sections["譬ｪ荳ｻ讒区・"] = s4;

      const s5 = extractSection(text, ["隱ｿ驕碑ｳ・≡縺ｮ菴ｿ騾・, "雉・≡縺ｮ菴ｿ騾・, "隱ｿ驕斐☆繧玖ｳ・≡"]);
      if (s5) sections["雉・≡菴ｿ騾・] = s5;

      const s6 = extractSection(text, ["蠖ｹ蜩｡縺ｮ迥ｶ豕・, "邨悟霧閠・・讎りｦ・, "蜿也ｷ蠖ｹ"]);
      if (s6) sections["邨悟霧髯｣"] = s6;

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
          error: "EDINET縺ｫ譖ｸ鬘槭′隕九▽縺九ｊ縺ｾ縺帙ｓ縺ｧ縺励◆縲よ嶌鬘曵D繧呈焔蜍輔〒蜈･蜉帙＠縺ｦ縺上□縺輔＞縲・
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
        message: `譖ｸ鬘曵D・・{docId}・峨・遒ｺ隱阪〒縺阪∪縺励◆縺後∵悽譁・ユ繧ｭ繧ｹ繝医・謚ｽ蜃ｺ縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲Ａ
      });
    }

    return NextResponse.json({
      success: true,
      doc_id: docId,
      sections_found: Object.keys(sections),
      message: `${sectionCount}繧ｻ繧ｯ繧ｷ繝ｧ繝ｳ蜿門ｾ怜ｮ御ｺ・ｼ∝・譫舌・繝ｼ繧ｸ繧帝幕縺・※蜀咲函謌舌＠縺ｦ縺上□縺輔＞縲Ａ
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
