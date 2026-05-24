export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

    // Step1: サマリーとスコアだけ取得
    const summaryMsg = await claude.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: "JSONのみ返してください。説明不要。",
      messages: [{
        role: "user",
        content: `企業「${company.name}」（${company.sector || "不明"}業）のIPO分析。JSON形式のみで：{"summary":"200字以内で事業内容と投資ポイントを丁寧に説明","total_score":65,"grade":"B"}`
      }]
    });

    let summary = "分析中です。しばらくお待ちください。";
    let total_score = 65;
    let grade = "B";
    try {
      const t = (summaryMsg.content[0] as any).text;
      const s = t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1);
      const parsed = JSON.parse(s);
      summary = parsed.summary || summary;
      total_score = parsed.total_score || total_score;
      grade = parsed.grade || grade;
    } catch {}

    // Step2: 各軸の分析を取得
    const axisMsg = await claude.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system: "JSONのみ返してください。説明不要。",
      messages: [{
        role: "user",
        content: `企業「${company.name}」（${company.sector || "不明"}業）の9軸IPO分析。
「〜です」「〜ます」調で丁寧に。専門用語はカッコで説明。
JSONのみ：{"ultra_short":[{"id":"float","title":"需給・ロック内容","score":65,"why_matters":"なぜ重要か60字","description":"詳細120字","verdict":"総評30字","doc_guide":"確認方法40字"},{"id":"lockup","title":"VC保有・売り圧力","score":65,"why_matters":"なぜ重要か60字","description":"詳細120字","verdict":"総評30字","doc_guide":"確認方法40字"},{"id":"timing","title":"市場環境・タイミング","score":65,"why_matters":"なぜ重要か60字","description":"詳細120字","verdict":"総評30字","doc_guide":"確認方法40字"}],"short":[{"id":"valuation","title":"バリュエーション","score":65,"why_matters":"60字","description":"120字","verdict":"30字","doc_guide":"40字"},{"id":"vc_sell","title":"ロックアップ解除後の売り圧力","score":65,"why_matters":"60字","description":"120字","verdict":"30字","doc_guide":"40字"},{"id":"growth","title":"成長性・市場規模","score":65,"why_matters":"60字","description":"120字","verdict":"30字","doc_guide":"40字"}],"long":[{"id":"management","title":"経営陣・ガバナンス","score":65,"why_matters":"60字","description":"120字","verdict":"30字","doc_guide":"40字"},{"id":"unit_econ","title":"ユニットエコノミクス","score":65,"why_matters":"60字","description":"120字","verdict":"30字","doc_guide":"40字"},{"id":"competitor","title":"競合優位性","score":65,"why_matters":"60字","description":"120字","verdict":"30字","doc_guide":"40字"}]}`
      }]
    });

    const indexMap: Record<string, string> = {
      float: "難・1", lockup: "難・2", timing: "難・3",
      valuation: "週1-1", vc_sell: "週1-2", growth: "週1-3",
      management: "長キ-1", unit_econ: "長キ-2", competitor: "長キ-3"
    };

    let axes = {
      ultra_short: [] as any[], short: [] as any[], long: [] as any[]
    };

    try {
      const t = (axisMsg.content[0] as any).text;
      const s = t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1);
      const parsed = JSON.parse(s);
      const addIndex = (arr: any[]) => arr.map((x: any) => ({
        ...x, index: indexMap[x.id] || x.id
      }));
      axes.ultra_short = addIndex(parsed.ultra_short || []);
      axes.short = addIndex(parsed.short || []);
      axes.long = addIndex(parsed.long || []);
    } catch {}

    const analysis = {
      summary,
      total_score,
      grade,
      highlight_reason: null,
      axes,
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