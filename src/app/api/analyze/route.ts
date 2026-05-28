export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function extractJson(text: string): string {
  const start = text.indexOf('{');
  if (start === -1) return text;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return text.slice(start);
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

    const n   = company.name ?? "不明";
    const sec = company.sector ?? "テクノロジー";

    const msg = await claude.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{
        role: "user",
        content: `あなたはIPO分析の専門アナリストです。以下の企業のIPO分析を行い、必ずJSON形式のみで回答してください（前置き・説明文・コードブロック記号は不要）。

企業名: ${n}
セクター: ${sec}

{
  "summary": "この企業の特徴・ビジネスモデル・IPOの注目点を200字程度で説明",
  "total_score": 65,
  "grade": "B",
  "insights": [
    {"title": "注目ポイントのタイトル", "body": "2〜3文の説明"},
    {"title": "注目ポイントのタイトル", "body": "2〜3文の説明"},
    {"title": "注目ポイントのタイトル", "body": "2〜3文の説明"}
  ],
  "scenarios": [
    {"label": "強気シナリオ", "target": "公募価格の◯倍", "condition": "実現条件"},
    {"label": "中立シナリオ", "target": "公募価格±◯%", "condition": "実現条件"},
    {"label": "弱気シナリオ", "target": "公募価格の◯倍", "condition": "実現条件"}
  ],
  "axes": [
    {"id": "float", "label": "需給の軽さ", "score": 70, "summary": "1〜2文の要点", "detail": "3〜4文の詳細分析"},
    {"id": "lockup", "label": "ロックアップ", "score": 65, "summary": "1〜2文の要点", "detail": "3〜4文の詳細分析"},
    {"id": "timing", "label": "上場タイミング", "score": 75, "summary": "1〜2文の要点", "detail": "3〜4文の詳細分析"},
    {"id": "valuation", "label": "バリュエーション", "score": 60, "summary": "1〜2文の要点", "detail": "3〜4文の詳細分析"},
    {"id": "vc_sell", "label": "VC売り圧力", "score": 55, "summary": "1〜2文の要点", "detail": "3〜4文の詳細分析"},
    {"id": "growth", "label": "成長性", "score": 80, "summary": "1〜2文の要点", "detail": "3〜4文の詳細分析"},
    {"id": "management", "label": "経営陣", "score": 70, "summary": "1〜2文の要点", "detail": "3〜4文の詳細分析"},
    {"id": "unit_econ", "label": "ユニットエコノミクス", "score": 65, "summary": "1〜2文の要点", "detail": "3〜4文の詳細分析"},
    {"id": "competitor", "label": "競合環境", "score": 60, "summary": "1〜2文の要点", "detail": "3〜4文の詳細分析"}
  ]
}`
      }]
    });

    const raw  = (msg.content[0] as any).text ?? "";
    let parsed: any = {};
    try {
      parsed = JSON.parse(extractJson(raw));
    } catch {
      parsed = {};
    }

    const allAxes     = Array.isArray(parsed.axes) ? parsed.axes : [];
    const ultra_short = allAxes.filter((x: any) => ["float","lockup","timing"].includes(x.id));
    const short       = allAxes.filter((x: any) => ["valuation","vc_sell","growth"].includes(x.id));
    const long        = allAxes.filter((x: any) => ["management","unit_econ","competitor"].includes(x.id));

    console.log(`axes:${allAxes.length} us:${ultra_short.length} sh:${short.length} lo:${long.length} ins:${(parsed.insights||[]).length} scen:${(parsed.scenarios||[]).length}`);

    const analysis = {
      summary:         parsed.summary         ?? `${n}は${sec}分野のIPO企業です。`,
      total_score:     parsed.total_score      ?? 65,
      grade:           parsed.grade            ?? "B",
      insights:        Array.isArray(parsed.insights)  ? parsed.insights.slice(0,3)  : [],
      scenarios_short: Array.isArray(parsed.scenarios) ? parsed.scenarios.slice(0,3) : [],
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