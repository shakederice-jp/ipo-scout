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

const AXIS_DEFS = [
  {id:"float",    label:"需給の軽さ"},
  {id:"lockup",   label:"ロックアップ"},
  {id:"timing",   label:"上場タイミング"},
  {id:"valuation",label:"バリュエーション"},
  {id:"vc_sell",  label:"VC売り圧力"},
  {id:"growth",   label:"成長性"},
  {id:"management",label:"経営陣"},
  {id:"unit_econ",label:"ユニットエコノミクス"},
  {id:"competitor",label:"競合環境"},
];

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
      ? Object.entries(raw as Record<string,string>).map(([k,v]) => `[${k}]\n${String(v).slice(0,800)}`).join('\n\n').slice(0,5000)
      : "";

    console.log(`mode:${hasEdinet ? "EDINET" : "knowledge"} company:${n}`);

    const axisTemplate = AXIS_DEFS.map(a =>
      `{"id":"${a.id}","label":"${a.label}","score":65,"why_matters":"なぜこの軸がIPO投資で重要かを2文で","description":"${n}の${a.label}について具体的な分析を3〜4文で","verdict":"総合評価を1〜2文で","doc_guide":"確認すべき書類・情報"}`
    ).join(',\n');

    const axesPrompt = `あなたはIPO専門アナリストです。${hasEdinet ? `以下の有価証券届出書データを根拠に` : ""}「${n}」（${sec}）のIPO9軸分析を行ってください。${hasEdinet ? `\n\n<有価証券届出書>\n${ctx}\n</有価証券届出書>\n\n上記の実データに基づき、` : ""}各軸について具体的かつ詳細な日本語で分析してください。JSONのみ出力（前置き不要）：\n{"axes":[\n${axisTemplate}\n]}`;

    const metaPrompt = `あなたはIPO専門アナリストです。${hasEdinet ? `以下の有価証券届出書データを根拠に` : ""}「${n}」（${sec}）について投資家向け分析を行ってください。${hasEdinet ? `\n\n<有価証券届出書>\n${ctx}\n</有価証券届出書>\n\n実データに基づき、` : ""}具体的かつ詳細な日本語で記述してください。JSONのみ出力（前置き不要）：\n{"summary":"200字程度の分析サマリー","total_score":65,"grade":"B","insights":[{"title":"最重要注目ポイント","body":"具体的な説明2〜3文"},{"title":"第2の注目点","body":"説明"},{"title":"第3の注目点","body":"説明"}],"scenarios":[{"label":"強気シナリオ","target":"公募価格の1.5倍","condition":"実現条件を具体的に"},{"label":"中立シナリオ","target":"公募価格±10%","condition":"最も蓋然性の高い展開"},{"label":"弱気シナリオ","target":"公募価格の0.8倍","condition":"下振れリスクと条件"}]}`;

    const [axesMsg, metaMsg] = await Promise.all([
      claude.messages.create({ model: "claude-haiku-4-5", max_tokens: 3000, messages: [{ role: "user", content: axesPrompt }] }),
      claude.messages.create({ model: "claude-sonnet-4-6", max_tokens: 2000, messages: [{ role: "user", content: metaPrompt }] }),
    ]);

    const axesRaw = (axesMsg.content[0] as any).text ?? "";
    const metaRaw = (metaMsg.content[0] as any).text ?? "";
    const axesData = extractJson(axesRaw);
    const metaData = extractJson(metaRaw);

    const allAxes     = Array.isArray(axesData?.axes) ? axesData.axes : [];
    const ultra_short = allAxes.filter((x: any) => ["float","lockup","timing"].includes(x.id));
    const short       = allAxes.filter((x: any) => ["valuation","vc_sell","growth"].includes(x.id));
    const long        = allAxes.filter((x: any) => ["management","unit_econ","competitor"].includes(x.id));

    console.log(`axes:${allAxes.length} us:${ultra_short.length} sh:${short.length} lo:${long.length} ins:${(metaData?.insights||[]).length} scen:${(metaData?.scenarios||[]).length}`);

    const analysis = {
      summary:         metaData?.summary         ?? `${n}のIPO分析`,
      total_score:     metaData?.total_score      ?? 65,
      grade:           metaData?.grade            ?? "B",
      insights:        Array.isArray(metaData?.insights)  ? metaData.insights.slice(0,3)  : [],
      scenarios_short: Array.isArray(metaData?.scenarios) ? metaData.scenarios.slice(0,3) : [],
      axes:            { ultra_short, short, long },
      data_source:     hasEdinet ? "EDINET有価証券届出書" : "AI知識ベース",
      sources: [
        { label: "東証新規上場情報", url: "https://www.jpx.co.jp/listing/stocks/new/index.html" },
        { label: "EDINET・有価証券届出書", url: "https://disclosure2.edinet-fsa.go.jp/" },
        { label: "IPOkabu", url: "https://ipokabu.net/" },
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
