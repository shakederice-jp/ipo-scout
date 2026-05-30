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

const AXES_PROMPT = (n: string, sec: string, ctx: string) => `あなたはIPO投資の専門アナリストです。${ctx ? "以下の有価証券届出書の実データを根拠に" : `${n}（${sec}）について`}9軸分析をJSONのみで出力してください。前置き不要。${ctx ? `\n\n【有価証券届出書（抜粋）】\n${ctx.slice(0, 7000)}\n\n` : ""}各軸のwhy_matters・description・verdict・doc_guideは具体的な内容を記載してください。

{"axes":[
{"id":"float","label":"需給の軽さ","score":70,"why_matters":"この軸がIPO投資で重要な理由を2文で","description":"実データに基づく詳細分析を3〜4文で","verdict":"総合的な評価を1〜2文で","doc_guide":"確認すべき書類・データ"},
{"id":"lockup","label":"ロックアップ","score":65,"why_matters":"重要な理由","description":"詳細分析","verdict":"総評","doc_guide":"確認書類"},
{"id":"timing","label":"上場タイミング","score":75,"why_matters":"重要な理由","description":"詳細分析","verdict":"総評","doc_guide":"確認書類"},
{"id":"valuation","label":"バリュエーション","score":60,"why_matters":"重要な理由","description":"詳細分析","verdict":"総評","doc_guide":"確認書類"},
{"id":"vc_sell","label":"VC売り圧力","score":55,"why_matters":"重要な理由","description":"詳細分析","verdict":"総評","doc_guide":"確認書類"},
{"id":"growth","label":"成長性","score":80,"why_matters":"重要な理由","description":"詳細分析","verdict":"総評","doc_guide":"確認書類"},
{"id":"management","label":"経営陣","score":70,"why_matters":"重要な理由","description":"詳細分析","verdict":"総評","doc_guide":"確認書類"},
{"id":"unit_econ","label":"ユニットエコノミクス","score":65,"why_matters":"重要な理由","description":"詳細分析","verdict":"総評","doc_guide":"確認書類"},
{"id":"competitor","label":"競合環境","score":60,"why_matters":"重要な理由","description":"詳細分析","verdict":"総評","doc_guide":"確認書類"}
]}`;

const META_PROMPT = (n: string, sec: string, ctx: string) => `あなたはIPO投資の専門アナリストです。${ctx ? "以下の有価証券届出書の実データを根拠に" : `${n}（${sec}）について`}分析し、JSONのみで出力してください。前置き不要。${ctx ? `\n\n【有価証券届出書（抜粋）】\n${ctx.slice(0, 6000)}\n\n` : ""}

{"summary":"200字の分析サマリー","total_score":65,"grade":"B","insights":[{"title":"最重要注目ポイント","body":"根拠ある2〜3文"},{"title":"第2の注目点","body":"説明"},{"title":"第3の注目点","body":"説明"}],"scenarios":[{"label":"強気","target":"公募価格の◯倍","condition":"実現条件"},{"label":"中立","target":"公募価格±◯%","condition":"条件"},{"label":"弱気","target":"公募価格の◯倍","condition":"条件"}]}`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = createSupabaseServerClient();
    if (!supabase) return NextResponse.json({ error: "db error" }, { status: 500 });

    const { data: company } = await supabase
      .from("ipo_companies")
      .select("*")
      .eq("id", body.id)
      .single();

    if (!company) return NextResponse.json({ error: "not found" }, { status: 404 });

    const n   = company.name   ?? "不明";
    const sec = company.sector ?? "テクノロジー";

    const raw = company.raw_prospectus;
    const hasEdinet = raw && Object.keys(raw).length > 0;
    const ctx = hasEdinet
      ? Object.entries(raw).map(([k, v]) => `【${k}】\n${v}`).join('\n\n')
      : "";

    console.log(`mode:${hasEdinet ? "EDINET実データ" : "知識ベース"} company:${n}`);

    const [axesMsg, metaMsg] = await Promise.all([
      claude.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 3000,
        messages: [{ role: "user", content: AXES_PROMPT(n, sec, ctx) }]
      }),
      claude.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [{ role: "user", content: META_PROMPT(n, sec, ctx) }]
      }),
    ]);

    const axesData = extractJson((axesMsg.content[0] as any).text ?? "");
    const metaData = extractJson((metaMsg.content[0] as any).text ?? "");

    const allAxes     = Array.isArray(axesData?.axes) ? axesData.axes : [];
    const ultra_short = allAxes.filter((x: any) => ["float","lockup","timing"].includes(x.id));
    const short       = allAxes.filter((x: any) => ["valuation","vc_sell","growth"].includes(x.id));
    const long        = allAxes.filter((x: any) => ["management","unit_econ","competitor"].includes(x.id));

    console.log(`axes:${allAxes.length} us:${ultra_short.length} sh:${short.length} lo:${long.length} ins:${(metaData?.insights||[]).length}`);

    const analysis = {
      summary:         metaData?.summary         ?? `${n}は${sec}分野のIPO企業です。`,
      total_score:     metaData?.total_score      ?? 65,
      grade:           metaData?.grade            ?? "B",
      insights:        Array.isArray(metaData?.insights)  ? metaData.insights.slice(0,3)  : [],
      scenarios_short: Array.isArray(metaData?.scenarios) ? metaData.scenarios.slice(0,3) : [],
      axes:            { ultra_short, short, long },
      data_source:     hasEdinet ? "EDINET有価証券届出書" : "AI知識ベース",
      sources: [
        { label: "東証新規上場情報",       url: "https://www.jpx.co.jp/listing/stocks/new/index.html" },
        { label: "EDINET・有価証券届出書", url: "https://disclosure2.edinet-fsa.go.jp/" },
        { label: "IPOkabu",               url: "https://ipokabu.net/" },
      ],
      generated_at: new Date().toISOString(),
    };

    await supabase.from("ipo_companies").update({ analysis_detail: analysis }).eq("id", company.id);
    return NextResponse.json(analysis);
  } catch (e: any) {
    console.error("analyze error:", e?.message);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
