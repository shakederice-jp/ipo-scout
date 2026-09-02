// 2026/9/2: 元々 src/app/api/competitor/route.ts に直書きされていた
// 「競合他社の財務データをEDINETから取得する」ロジックを、共有関数として切り出した。
//
// 理由は2つ:
// ① マーケットトレンドの新テーマ「IPO企業 vs 競合の決算比較」(src/lib/x-post-themes.ts)
//    からも同じ処理を呼べるようにするため。従来は管理画面の手動ボタン
//    (「🏢 競合他社財務データ取得」)を押さないと動かない仕組みだったが、
//    毎日自動生成する記事のためにその場で自動取得できるようにする必要があった。
// ② その切り出し作業中に、EDINETの誤ったホスト名(disclosure.edinet-fsa.go.jp)を
//    使っていたバグを発見した。これは過去に src/app/api/edinet/route.ts や
//    src/app/api/admin/health/route.ts で見つかったのと同じ種類のバグで、
//    正しくは api.edinet-fsa.go.jp。このタイミングで修正した。
//    (なお、以前「このバグはこの2ファイルだけ」と確認済みとしていたが、実際には
//    このファイルの元になったコードにも同じバグがあったことが今回判明している。
//    念のため src/app/api/admin/detect-ipo-price/route.ts にも同様の誤ったホストが
//    残っている可能性があるため、別途確認が必要)

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

async function findLatestAnnualReport(edinetCode: string): Promise<string | null> {
  const apiKey = process.env.EDINET_API_KEY ?? "";
  const today = new Date();
  const dates: string[] = [];
  for (let i = 0; i < 90; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const results = await Promise.all(
    dates.map(async (dateStr) => {
      try {
        const res = await fetch(
          `https://api.edinet-fsa.go.jp/api/v2/documents.json?date=${dateStr}&type=2&Subscription-Key=${apiKey}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (!res.ok) return null;
        const data = await res.json();
        const found = (data?.results ?? []).find((doc: any) =>
          doc.edinetCode === edinetCode &&
          doc.ordinanceCode === "010" &&
          doc.formCode === "030000"
        );
        return found ? found.docID : null;
      } catch { return null; }
    })
  );
  return results.find(r => r !== null) ?? null;
}

async function fetchDocumentText(docId: string): Promise<string> {
  const apiKey = process.env.EDINET_API_KEY ?? "";
  try {
    const res = await fetch(
      `https://api.edinet-fsa.go.jp/api/v2/documents/${docId}?type=1&Subscription-Key=${apiKey}`
    );
    if (!res.ok) return "";
    const buffer = await res.arrayBuffer();

    // ZIPファイルを展開してテキストを抽出
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(buffer);

    let combinedText = "";
    for (const [filename, file] of Object.entries(zip.files)) {
      if (filename.endsWith(".htm") || filename.endsWith(".html") || filename.endsWith(".txt")) {
        const content = await (file as any).async("string");
        const text = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        combinedText += text.slice(0, 10000) + "\n";
        if (combinedText.length > 25000) break;
      }
    }
    return combinedText.slice(0, 30000);
  } catch { return ""; }
}

function toFullWidth(str: string): string {
  return str.replace(/[A-Za-z0-9]/g, c =>
    String.fromCharCode(c.charCodeAt(0) + 0xFEE0)
  );
}

async function findEdinetCode(supabase: any, compName: string): Promise<string | null> {
  const codeMatch = compName.match(/[（(](\d{4})[）)]/);
  if (codeMatch) {
    const code5 = codeMatch[1] + "0";
    const { data: r1 } = await supabase
      .from("edinet_companies")
      .select("edinet_code")
      .eq("security_code", code5)
      .limit(1);
    if (r1?.[0]?.edinet_code) return r1[0].edinet_code;
  }

  const cleanName = compName
    .replace(/[（(].*[）)]/g, "")
    .replace(/株式会社|（株）|\(株\)|㈱/g, "")
    .trim();
  if (!cleanName) return null;

  const { data: r2 } = await supabase
    .from("edinet_companies")
    .select("edinet_code")
    .ilike("company_name", `%${cleanName}%`)
    .limit(1);
  if (r2?.[0]?.edinet_code) return r2[0].edinet_code;

  const fullWidthName = toFullWidth(cleanName);
  if (fullWidthName !== cleanName) {
    const { data: r3 } = await supabase
      .from("edinet_companies")
      .select("edinet_code")
      .ilike("company_name", `%${fullWidthName}%`)
      .limit(1);
    if (r3?.[0]?.edinet_code) return r3[0].edinet_code;
  }

  return null;
}

// 指定した企業(companyId)の analysis_market.competitors に登録されている競合他社について、
// EDINETから直近の有価証券報告書を取得し、Claude Haikuで財務データを抽出する。
// 結果は ipo_companies.analysis_market.competitor_financials に保存してから返す
// (毎回EDINETに問い合わせ直さなくて済むよう、一度取得した結果はキャッシュとして残す)。
export async function fetchCompetitorFinancials(companyId: string, supabase: any): Promise<any[]> {
  const { data: co, error } = await supabase
    .from("ipo_companies")
    .select("name, analysis_market")
    .eq("id", companyId)
    .single();

  if (error || !co) return [];

  const competitors: any[] = co.analysis_market?.competitors ?? [];
  if (competitors.length === 0) return [];

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

  await supabase
    .from("ipo_companies")
    .update({ analysis_market: { ...co.analysis_market, competitor_financials: results } })
    .eq("id", companyId);

  return results;
}
