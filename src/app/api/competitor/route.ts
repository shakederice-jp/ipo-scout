import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const anthropic = new Anthropic();

// EDINETから最新の有価証券報告書を検索
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
        doc.formCode === "030000" // 有価証券報告書
      );
      if (found) return found.docID;
    } catch { continue; }
  }
  return null;
}

// EDINETから書類テキストを取得
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

export async function POST(req: NextRequest) {
  try {
    const { company_id } = await req.json();
    if (!company_id) return NextResponse.json({ error: "company_id required" }, { status: 400 });

    const supabase = getSupabase();

    // ipo_companiesからanalysis_marketを取得
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
      // 証券コードを括弧内から抽出（例："幼児活動研究会（2152）"→"2152"）
      const codeMatch = compName.match(/[（(](\d{4})[）)]/);
      const secCode = codeMatch ? codeMatch[1] + "0" : null; // 末尾に0を追加（例:2152→21520）

      // edinet_companiesからEDINETコードを検索
      let edinetCode: string | null = null;
      if (secCode) {
        const { data: edinetCo } = await supabase
          .from("edinet_companies")
          .select("edinet_code, company_name")
          .eq("security_code", secCode)
          .single();
        if (edinetCo) edinetCode = edinetCo.edinet_code;
      }

      // 名前で検索（証券コードで見つからない場合）
      if (!edinetCode) {
        const cleanName = compName.replace(/[（(].*[）)]/g, "").trim();
        const { data: edinetCo } = await supabase
          .from("edinet_companies")
          .select("edinet_code, company_name")
          .ilike("company_name", `%${cleanName}%`)
          .limit(1)
          .single();
        if (edinetCo) edinetCode = edinetCo.edinet_code;
      }

      if (!edinetCode) {
        results.push({ name: compName, error: "EDINETコードが見つかりません", revenue: null, operating_profit: null, per: null, pbr: null });
        continue;
      }

      // 最新の有価証券報告書を検索
      const docId = await findLatestAnnualReport(edinetCode);
      if (!docId) {
        results.push({ name: compName, error: "有価証券報告書が見つかりません", revenue: null, operating_profit: null, per: null, pbr: null });
        continue;
      }

      // テキストを取得
      const text = await fetchDocumentText(docId);
      if (!text) {
        results.push({ name: compName, error: "テキスト取得失敗", revenue: null, operating_profit: null, per: null, pbr: null });
        continue;
      }

      // Claudeで財務データを抽出
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

    // 結果をSupabaseに保存
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