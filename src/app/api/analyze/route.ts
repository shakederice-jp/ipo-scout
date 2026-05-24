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

const callHaiku = (content: string, max_tokens = 1000) =>
  claude.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens,
    system: "あなたはIPO分析の専門家です。必ずJSONのみで回答してください。",
    messages: [{ role: "user", content }]
  });

const parseItems = (msg: any): any[] => {
  try {
    const t = (msg.content[0] as any).text;
    // [ から始まる配列を探す
    const match = t.match(/\[[\s\S]*\]/);
    if (match) {
      const arr = JSON.parse(match[0]);
      if (Array.isArray(arr) && arr.length > 0)
        return arr.map((x: any) => ({ ...x, index: indexMap[x.id] || x.id }));
    }
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

    const [summaryMsg, usMsg, shMsg, loMsg] = await Promise.all([
      callHaiku(
        `「${name}」（${sector}業）のIPOを分析してください。「〜です・〜ます」調で丁寧に書いてください。\n{"summary":"この会社の事業内容と投資ポイントを200字で説明","total_score":65,"grade":"B"}`,
        500
      ),
      callHaiku(
        `「${name}」（${sector}業）の超短期IPO投資観点を3点分析してください。「〜です・〜ます」調で丁寧に、専門用語はカッコで説明してください。\n以下のJSON配列形式で回答：\n[\n{"id":"float","title":"需給・ロック内容","score":70,"why_matters":"重要な理由を説明してください","description":"詳細分析を120字以上で説明してください","verdict":"総評を書いてください","doc_guide":"目論見書のどこを確認すべきか書いてください"},\n{"id":"lockup","title":"VC保有・売り圧力","score":65,"why_matters":"重要な理由","description":"詳細分析120字以上","verdict":"総評","doc_guide":"確認箇所"},\n{"id":"timing","title":"市場環境・タイミング","score":60,"why_matters":"重要な理由","description":"詳細分析120字以上","verdict":"総評","doc_guide":"確認箇所"}\n]`
      ),
      callHaiku(
        `「${name}」（${sector}業）の短期IPO投資観点を3点分析してください。「〜です・〜ます」調で丁寧に。\n[\n{"id":"valuation","title":"バリュエーション","score":65,"why_matters":"重要な理由","description":"詳細分析120字以上","verdict":"総評","doc_guide":"確認箇所"},\n{"id":"vc_sell","title":"ロックアップ解除後の売り圧力","score":60,"why_matters":"重要な理由","description":"詳細分析120字以上","verdict":"総評","doc_guide":"確認箇所"},\n{"id":"growth","title":"成長性・市場規模","score":65,"why_matters":"重要な理由","description":"詳細分析120字以上","verdict":"総評","doc_guide":"確認箇所"}\n]`
      ),
      callHaiku(
        `「${name}」（${sector}業）の長期IPO投資観点を3点分析してください。「〜です・〜ます」調で丁寧に。\n[\n{"id":"management","title":"経営陣・ガバナンス","score":70,"why_matters":"重要な理由","description":"詳細分析120字以上","verdict":"総評","doc_guide":"確認箇所"},\n{"id":"unit_econ","title":"ユニットエコノミクス","score":60,"why_matters":"重要な理由","description":"詳細分析120字以上","verdict":"総評","doc_guide":"確認箇所"},\n{"id":"competitor","title":"競合優位性","score":65,"why_matters":"重要な理由","description":"詳細分析120字以上","verdict":"総評","doc_guide":"確認箇所"}\n]`
      )
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

    const ultra_short = parseItems(usMsg);
    const short = parseItems(shMsg);
    const long = parseItems(loMsg);

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

    return NextResponse.json(analysis);
  } catch (error: any) {
    console.error("error:", error?.message);
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}