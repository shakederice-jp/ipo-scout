export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function extractJson(text: string): any {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) {
      try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

/* Claude Haiku: 9軸スコアのみ生成（高速・低コスト） */
async function generateAxes(name: string, sector: string) {
  const msg = await claude.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 2500,
    messages: [{
      role: "user",
      content: `IPO企業「${name}」（セクター:${sector}）の9軸投資分析をJSONのみで出力してください。前置き・説明文不要。

{"axes":[
{"id":"float","label":"需給の軽さ","score":70,"summary":"公募株数・オーバーアロットメント等の需給分析","detail":"需給に関する詳細分析を3〜4文で"},
{"id":"lockup","label":"ロックアップ","score":65,"summary":"主要株主のロックアップ状況","detail":"ロックアップ期間・解除後リスクの詳細"},
{"id":"timing","label":"上場タイミング","score":75,"summary":"市場環境・業界トレンドとの適合性","detail":"マクロ環境・セクタートレンドの詳細"},
{"id":"valuation","label":"バリュエーション","score":60,"summary":"PER・PSR等の割安・割高判断","detail":"類似企業比較・成長率考慮の詳細"},
{"id":"vc_sell","label":"VC売り圧力","score":55,"summary":"VC・PE保有比率と売り圧力リスク","detail":"主要株主構成・潜在的売り圧力の詳細"},
{"id":"growth","label":"成長性","score":80,"summary":"売上成長率・TAM・競争優位性","detail":"成長ドライバーと持続可能性の詳細"},
{"id":"management","label":"経営陣","score":70,"summary":"創業者・経営チームの実績と質","detail":"経営陣の背景・実績・報酬体系の詳細"},
{"id":"unit_econ","label":"ユニットエコノミクス","score":65,"summary":"LTV/CAC・粗利率・営業レバレッジ","detail":"収益モデルの効率性と改善余地の詳細"},
{"id":"competitor","label":"競合環境","score":60,"summary":"競合優位性と市場ポジション","detail":"競合他社比較・参入障壁の詳細"}
]}`
    }]
  });
  const raw = (msg.content[0] as any).text ?? "";
  console.log("axes_raw_preview:", raw.slice(0, 100));
  return extractJson(raw);
}

/* Claude Sonnet: 要約・インサイト・シナリオ生成（高品質） */
async function generateMeta(name: string, sector: string) {
  const msg = await claude.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: `IPO企業「${name}」（セクター:${sector}）の投資家向け分析をJSONのみで出力してください。前置き・説明文不要。

{"summary":"この企業のビジネスモデル・IPOの注目点・投資家が知るべきポイントを200字程度で","total_score":65,"grade":"B",
"insights":[
{"title":"最重要注目ポイントのタイトル","body":"2〜3文の具体的な説明"},
{"title":"第2の注目ポイント","body":"2〜3文"},
{"title":"第3の注目ポイント","body":"2〜3文"}
],
"scenarios":[
{"label":"強気シナリオ","target":"公募価格の◯倍","condition":"このシナリオが実現する具体的条件"},
{"label":"中立シナリオ","target":"公募価格±◯%","condition":"最も蓋然性の高い展開"},
{"label":"弱気シナリオ","target":"公募価格の◯倍","condition":"下振れリスクと条件"}
]}`
    }]
  });
  const raw = (msg.content[0] as any).text ?? "";
  console.log("meta_raw_preview:", raw.slice(0, 100));
  return extractJson(raw);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = createSupabaseServerClient();

    const { data: company } = await supabase
      .from("ipo_companies")
      .select("*")
      .eq("id", body.id)
      .single();

    if (!company) return NextResponse.json({ error: "not found" }, { status: 404 });

    const n   = company.name   ?? "不明";
    const sec = company.sector ?? "テクノロジー";

    /* Haiku（9軸）と Sonnet（要約・insights）を並列実行 */
    const [axesData, metaData] = await Promise.all([
      generateAxes(n, sec),
      generateMeta(n, sec),
    ]);

    const allAxes     = Array.isArray(axesData?.axes) ? axesData.axes : [];
    const ultra_short = allAxes.filter((x: any) => ["float","lockup","timing"].includes(x.id));
    const short       = allAxes.filter((x: any) => ["valuation","vc_sell","growth"].includes(x.id));
    const long        = allAxes.filter((x: any) => ["management","unit_econ","competitor"].includes(x.id));

    console.log(`axes:${allAxes.length} us:${ultra_short.length} sh:${short.length} lo:${long.length} ins:${(metaData?.insights||[]).length} scen:${(metaData?.scenarios||[]).length}`);

    const analysis = {
      summary:         metaData?.summary         ?? `${n}は${sec}分野のIPO企業です。`,
      total_score:     metaData?.total_score      ?? 65,
      grade:           metaData?.grade            ?? "B",
      insights:        Array.isArray(metaData?.insights)  ? metaData.insights.slice(0,3)  : [],
      scenarios_short: Array.isArray(metaData?.scenarios) ? metaData.scenarios.slice(0,3) : [],
      axes:            { ultra_short, short, long },
      sources: [
        { label: "東証新規上場情報",       url: "https://www.jpx.co.jp/listing/stocks/new/index.html" },
        { label: "EDINET・有価証券届出書", url: "https://disclosure2.edinet-fsa.go.jp/" },
        { label: "IPOkabu",               url: "https://ipokabu.net/" },
      ],
      generated_at: new Date().toISOString(),
    };

    await supabase
      .from("ipo_companies")
      .update({ analysis_detail: analysis })
      .eq("id", company.id);

    return NextResponse.json(analysis);
  } catch (e: any) {
    console.error("analyze error:", e?.message);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}