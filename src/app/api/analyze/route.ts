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

// サマリー用（オブジェクト返却）
const callSummary = (name: string, sector: string) =>
  claude.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    system: "JSONのみ返答。",
    messages: [
      { role: "user", content: `「${name}」（${sector}業）のIPO分析。「〜です・〜ます」調で丁寧に。` },
      { role: "assistant", content: `{"summary":"` }
    ]
  });

// 軸分析用（配列返却）- プリフィルで[を先頭に強制
const callAxes = (name: string, sector: string, type: string, ids: string[]) =>
  claude.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1000,
    system: "JSONのみ返答。",
    messages: [
      {
        role: "user",
        content: `「${name}」（${sector}業）の${type}投資分析。「〜です・〜ます」調で丁寧に、専門用語はカッコで説明。\n対象項目：${ids.join("、")}\n各項目を以下キーで分析：id, title, score(50-80), why_matters(60字), description(120字以上), verdict(30字), doc_guide(40字)`
      },
      { role: "assistant", content: "[" }
    ]
  });

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
      callSummary(name, sector),
      callAxes(name, sector, "超短期IPO", ["float（需給・ロック内容）", "lockup（VC保有・売り圧力）", "timing（市場環境・タイミング）"]),
      callAxes(name, sector, "短期IPO", ["valuation（バリュエーション）", "vc_sell（ロックアップ解除後の売り圧力）", "growth（成長性・市場規模）"]),
      callAxes(name, sector, "長期IPO", ["management（経営陣・ガバナンス）", "unit_econ（ユニットエコノミクス）", "competitor（競合優位性）"])
    ]);

    // サマリーパース（{"summary":"...で始まるプリフィル済み）
    let summary = `${name}は${sector}分野のIPO企業です。`;
    let total_score = 65, grade = "B";
    try {
      const raw = `{"summary":"` + (summaryMsg.content[0] as any).text;
      const p = JSON.parse(raw);
      summary = p.summary || summary;
      total_score = p.total_score || total_score;
      grade = p.grade || grade;
    } catch {}

    // 軸パース（[で始まるプリフィル済み）
    const parseArr = (msg: any): any[] => {
      try {
        const raw = "[" + (msg.content[0] as any).text;
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length > 0)
          return arr.map((x: any) => ({ ...x, index: indexMap[x.id] || x.id }));
        return [];
      } catch { return []; }
    };

    const ultra_short = parseArr(usMsg);
    const short = parseArr(shMsg);
    const long = parseArr(loMsg);

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