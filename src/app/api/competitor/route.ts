import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const anthropic = new Anthropic();

async function findLatestAnnualReport(edinetCode: string): Promise<string | null> {
  const today = new Date();
  for (let i = 0; i < 60; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    try {
      const res = await fetch(
        `https://disclosure.edinet-fsa.go.jp/api/v2/documents.json?date=${dateStr}&type=2`
      );
      if (!res.ok) continue;
      const data = await res.json();
      const docs = data?.results ?? [];
      const found = docs.find((doc: any) =>
        doc.edinetCode === edinetCode &&
        doc.ordinanceCode === "010" &&
        doc.formCode === "030000"
      );
      if (found) return found.docID;
    } catch { continue; }
  }
  return null;
}

async function fetchDocumentText(docId: string): Promise<string> {
  try {
    const res = await fetch(
      `https://disclosure.edinet-fsa.go.jp/api/v2/documents/${docId}?type=1`
    );
    if (!res.ok) return "";
    const buffer = await res.arrayBuffer();
    const decoder = new TextDecoder("utf-8");
    return decoder.decode(buffer).slice(0, 30000);
  } catch { return ""; }
}

// EDINETコードを複数戦略で検索
async function findEdinetCode(supabase: any, compName: string): Promise<string | null> {
  // 1. 証券コードを括弧内から抽出
  const codeMatch = compName.match(/[（(](\d{4})[）)]/);
  if (codeMatch) {
    const code4 = codeMatch[1];
    const code5 = code4 + "0";

    // 5桁で検索
    const { data: r1 } = await supabase
      .from("edinet_companies")
      .select("edinet_code")
      .eq("security_code", code5)
      .maybeSingle();
    if (r1?.edinet_code) return r1.edinet_code;

    // 4桁で検索
    const { data: r2 } = await supabase
      .from("edinet_companies")
      .select("edinet_code")
      .eq("security_code", code4)
      .maybeSingle();
    if (r2?.edinet_code) return r2.edinet_code;
  }

  // 2. 社名から不要部分を除去して検索
  const cleanName = compName
    .replace(/[（(].*[）)]/g, "")  // 括弧内を削除
    .replace(/株式会社|（株）|\(株\)|㈱/g, "")  // 会社形態を削除
    .trim();

  if (!cleanName) return null;

  // 完全一致（会社形態なし）
  const { data: r3 } = await supabase
    .from("edinet_companies")
    .select("edinet_code")
    .ilike("company_name", cleanName)
    .maybeSingle();
  if (r3?.edinet_code) return r3.edinet_code;

  // 部分一致
  const { data: r4 } = await supabase
    .from("edinet_companies")
    .select("edinet_code, company_name")
    .ilike("company_name", `%${cleanName}%`)
    .limit(1);
  if (r4?.[0]?.edinet_code) return r4[0].edinet_code;

  // 3. 英語社名で検索（例：LITALICO）
  const { data: r5 } = await supabase
    .from("edinet_companies")
    .select("edinet_code")
    .ilike("company_name_en", `%${cleanName}%`)
    .limit(1);
  if (r5?.[0]?.edinet_code) return r5[0].edinet_code;

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { company_id } = await req.json();
    if (!company_id) return NextResponse.json({ error: "company_id required" }, { status: 400 });

    const supabase = getSupabase();

    const { data: co, error } = await supabase
      .from("ipo_companies")
      .select("name, analysis_market")
      .eq("id", company_id)
      .single();

    if (error || !co) return NextResponse.json({ error: "企業が見つかりません" }, { status: 404 });

    const competitors: any[] = co.analysis_market?.competitors ?? [];
    if (competitors.length === 0) {
      return NextResponse.json({ error: "競合他社情報がありません。先に⑦市場・競合情報収集を実行してください。" }, { status: 400 });
    }

    const results: any[] = [];

    for (const comp of competitors) {
      const compName = comp.name ?? "";

      const edinetCode = await findEdinetCode(supabase, compName);

      if (!edinetCode) {
        results.push({ name: compName, error: "EDINETコードが見つかりません", revenue: null, operating_profit: null, per: null, pbr: null });
        continue;
      }

      const docId = await findLatestAnnualReport(edinetCode);
      if (!docId) {
        results.push({ name: compName, error: "有価証券報告書が見つかりません", revenue: null, operating_profit: null, per: null, pbr: null });
        continue;
      }

      const text = await fetchDocumentText(docId);
      if (!text) {
        results.push({ name: compName, error: "テキスト取得失敗", revenue: null, operating_profit: null, per: null, pbr: null });
        continue;
      }

      try {
        const message = await anthropic.messages.create({
          model: "claude-haiku-4-5",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `以下の有価証券報告書テキストから財務データを抽出してください。JSONのみ返してください。

抽出項目：
- revenue: 直近期の売上高（億円、数値のみ）
- operating_profit: 直近期の営業利益（億円、数値のみ）
- net_profit: 直近期の当期純利益（億円、数値のみ）
- fiscal_year: 決算期（例：2025年3月期）
- per: PER（倍、数値のみ。記載なければnull）
- pbr: PBR（倍、数値のみ。記載なければnull）

JSON形式：{"revenue": 123.4, "operating_profit": 12.3, "net_profit": 8.5, "fiscal_year": "2025年3月期", "per": null, "pbr": null}

テキスト：
${text}`
          }]
        }, { timeout: 30000 });

        const raw = (message.content[0] as any).text;
        const clean = raw.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean);
        results.push({ name: compName, edinet_code: edinetCode, doc_id: docId, ...parsed });
      } catch {
        results.push({ name: compName, error: "財務データ抽出失敗", revenue: null, operating_profit: null, per: null, pbr: null });
      }
    }

    const { error: saveError } = await supabase
      .from("ipo_companies")
      .update({ analysis_market: { ...co.analysis_market, competitor_financials: results } })
      .eq("id", company_id);

    if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 });

    return NextResponse.json({ success: true, results });

  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}