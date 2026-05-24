export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const indexMap: Record<string, string> = {
  float: "難・1", lockup: "難・2", timing: "難・3",
  valuation: "週1-1", vc_sell: "週1-2", growth: "週1-3",
  management: "長キ-1", unit_econ: "長キ-2", competitor: "長キ-3"
};

const parseArr = (text: string): any[] => {
  try {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end === -1) return [];
    const arr = JSON.parse(text.slice(start, end + 1));
    if (Array.isArray(arr) && arr.length > 0)
      return arr.map((x: any) => ({ ...x, index: indexMap[x.id] || x.id }));
    return [];
  } catch { return []; }
};

export async function POST(req: NextRequest) {
  try {
    const company = await req.json();
    const supabase = getSupabase();

    const { data } = await supabase
      .from("ipo_companies")
      .select("analysis_detail")
      .eq("id", company.id)
      .single();

    if (data?.analysis_detail) {
      const detail = data.analysis_detail as any;
      const hasAxes = (detail.axes?.ultra_short?.length || 0) > 0;
      const hoursSince = (Date.now() - new Date(detail.generated_at || 0).getTime()) / 3600000;
      if (hoursSince < 48 && hasAxes) return NextResponse.json(detail);
    }

    const name = company.name;
    const sector = company.sector || "不明";
    const instruction = `「〜です」「〜ます」調で丁寧に。専門用語はカッコで説明。JSONのみ返答（前置き不要）。`;

    const axisPrompt = (items: {id: string, title: string}[]) =>
      `「${name}」（${sector}業）のIPO分析。${instruction}
以下の形式のJSON配列のみで回答してください：
[
${items.map(({id, title}) => `  {"id":"${id}","title":"${title}","score":65,"why_matters":"この指標が重要な理由を60字で説明","description":"詳細な分析を120字以上で丁寧に説明","verdict":"総評を30字で","doc_guide":"目論見書の確認箇所を40字で"}`).join(',\n')}
]`;

    const [summaryMsg, usMsg, shMsg, loMsg] = await Promise.all([
      // サマリー：Haiku（高速）
      claude.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: "JSONのみ返答。",
        messages: [{ role: "user", content: `「${name}」（${sector}業）IPO分析。${instruction} {"summary":"事業内容と投資ポイントを200字で丁寧に説明","total_score":65,"grade":"B"}` }]
      }),
      // 超短期：Sonnet（高品質JSON）
      claude.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: "JSONのみ返答。",
        messages: [{ role: "user", content: axisPrompt([
          {id: "float", title: "需給・ロック内容"},
          {id: "lockup", title: "VC保有・売り圧力"},
          {id: "timing", title: "市場環境・タイミング"}
        ])}]
      }),
      // 短期：Sonnet
      claude.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: "JSONのみ返答。",
        messages: [{ role: "user", content: axisPrompt([
          {id: "valuation", title: "バリュエーション"},
          {id: "vc_sell", title: "ロックアップ解除後の売り圧力"},
          {id: "growth", title: "成長性・市場規模"}
        ])}]
      }),
      // 長期：Sonnet
      claude.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: "JSONのみ返答。",
        messages: [{ role: "user", content: axisPrompt([
          {id: "management", title: "経営陣・ガバナンス"},
          {id: "unit_econ", title: "ユニットエコノミクス"},
          {id: "competitor", title: "競合優位性"}
        ])}]
      })
    ]);

    let summary = `${name}は${sector}分野のIPO企業です。`;
    let total_score = 65, grade = "B";
    try {
      const t = (summaryMsg.content[0] as any).text;
      const p = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
      summary = p.summary || summary;
      total_score = p.total_score || total_score;
      grade = p.grade || grade;
    } catch {}

    const ultra_short = parseArr((usMsg.content[0] as any).text);
    const short = parseArr((shMsg.content[0] as any).text);
    const long = parseArr((loMsg.content[0] as any).text);

    console.log("axes lengths:", ultra_short.length, short.length, long.length);

    const analysis = {
      summary, total_score, grade, highlight_reason: null,
      axes: { ultra_short, short, long },
      sources: [
        { label: "東証新規上場情報", url: "https://www.jpx.co.jp/listing/stocks/new/index.html" },
        { label: "EDINET・有価証券届出書", url: "https://disclosure2.edinet-fsa.go.jp/" },
        { label: "IPOkabu", url: "https://ipokabu.net/" }
      ],
      generated_at: new Date().toISOString()
    };

    await supabase.from("ipo_companies").update({ analysis_detail: analysis }).eq("id", company.id);
    console.log("saved OK");

    return NextResponse.json(analysis);
  } catch (error: any) {
    console.error("error:", error?.message);
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}