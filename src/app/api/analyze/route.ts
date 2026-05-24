export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const indexMap: Record<string, string> = {
  float: "難・1", lockup: "難・2", timing: "難・3",
  valuation: "週1-1", vc_sell: "週1-2", growth: "週1-3",
  management: "長キ-1", unit_econ: "長キ-2", competitor: "長キ-3"
};

const parseArr = (msg: any) => {
  try {
    const t = (msg.content[0] as any).text;
    // [ ] で囲まれた配列を探す
    const start = t.indexOf('[');
    const end = t.lastIndexOf(']');
    if (start === -1 || end === -1) return [];
    return JSON.parse(t.slice(start, end + 1))
      .map((x: any) => ({ ...x, index: indexMap[x.id] || x.id }));
  } catch { return []; }
};

const callHaiku = (content: string, max_tokens = 800) =>
  claude.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens,
    system: "JSONのみ返してください。余計な説明不要。",
    messages: [{ role: "user", content }]
  });

export async function POST(req: NextRequest) {
  try {
    const company = await req.json();
    const supabase = createSupabaseServerClient();

    if (supabase) {
      const { data } = await supabase
        .from("ipo_companies")
        .select("analysis_detail")
        .eq("id", company.id)
        .single();
      if (data?.analysis_detail) {
        const detail = data.analysis_detail as any;
        const generatedAt = new Date(detail.generated_at || 0);
        const hoursSince = (Date.now() - generatedAt.getTime()) / 3600000;
        if (hoursSince < 48) return NextResponse.json(detail);
      }
    }

    const name = company.name;
    const sector = company.sector || "不明";
    const tone = "「〜です」「〜ます」調で丁寧に。専門用語はカッコで説明。";

    // 4つを同時並行で実行（合計25秒程度で完了）
    const [summaryMsg, usMsg, shMsg, loMsg] = await Promise.all([
      callHaiku(`「${name}」（${sector}業）IPO分析。${tone}JSONのみ：{"summary":"200字で事業内容と投資ポイントを丁寧に説明","total_score":65,"grade":"B"}`, 500),
      callHaiku(`「${name}」（${sector}業）超短期IPO分析。${tone}JSONのみ：[{"id":"float","title":"需給・ロック内容","score":65,"why_matters":"なぜ重要か説明","description":"120字以上の詳細分析","verdict":"総評","doc_guide":"確認方法"},{"id":"lockup","title":"VC保有・売り圧力","score":65,"why_matters":"なぜ重要か説明","description":"120字以上の詳細分析","verdict":"総評","doc_guide":"確認方法"},{"id":"timing","title":"市場環境・タイミング","score":65,"why_matters":"なぜ重要か説明","description":"120字以上の詳細分析","verdict":"総評","doc_guide":"確認方法"}]`),
      callHaiku(`「${name}」（${sector}業）短期IPO分析。${tone}JSONのみ：[{"id":"valuation","title":"バリュエーション","score":65,"why_matters":"なぜ重要か説明","description":"120字以上の詳細分析","verdict":"総評","doc_guide":"確認方法"},{"id":"vc_sell","title":"ロックアップ解除後の売り圧力","score":65,"why_matters":"なぜ重要か説明","description":"120字以上の詳細分析","verdict":"総評","doc_guide":"確認方法"},{"id":"growth","title":"成長性・市場規模","score":65,"why_matters":"なぜ重要か説明","description":"120字以上の詳細分析","verdict":"総評","doc_guide":"確認方法"}]`),
      callHaiku(`「${name}」（${sector}業）長期IPO分析。${tone}JSONのみ：[{"id":"management","title":"経営陣・ガバナンス","score":65,"why_matters":"なぜ重要か説明","description":"120字以上の詳細分析","verdict":"総評","doc_guide":"確認方法"},{"id":"unit_econ","title":"ユニットエコノミクス","score":65,"why_matters":"なぜ重要か説明","description":"120字以上の詳細分析","verdict":"総評","doc_guide":"確認方法"},{"id":"competitor","title":"競合優位性","score":65,"why_matters":"なぜ重要か説明","description":"120字以上の詳細分析","verdict":"総評","doc_guide":"確認方法"}]`)
    ]);

    let summary = `${name}は${sector}分野のIPO企業です。`;
    let total_score = 65;
    let grade = "B";
    try {
      const t = (summaryMsg.content[0] as any).text;
      const s = t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1);
      const p = JSON.parse(s);
      summary = p.summary || summary;
      total_score = p.total_score || total_score;
      grade = p.grade || grade;
    } catch {}

    const analysis = {
      summary, total_score, grade,
      highlight_reason: null,
      axes: {
        ultra_short: parseArr(usMsg),
        short: parseArr(shMsg),
        long: parseArr(loMsg)
      },
      sources: [
        { label: "東証新規上場情報", url: "https://www.jpx.co.jp/listing/stocks/new/index.html" },
        { label: "EDINET・有価証券届出書", url: "https://disclosure2.edinet-fsa.go.jp/" },
        { label: "IPOkabu", url: "https://ipokabu.net/" }
      ],
      generated_at: new Date().toISOString()
    };

    if (supabase) {
      await supabase.from("ipo_companies").update({ analysis_detail: analysis }).eq("id", company.id);
    }

    return NextResponse.json(analysis);
  } catch (error: any) {
    console.error("analyze error:", error?.message);
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}