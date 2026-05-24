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

const callHaiku = (content: string, max_tokens = 900) =>
  claude.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens,
    system: "JSONのみ返してください。余計な説明不要。",
    messages: [{ role: "user", content }]
  });

const parseItems = (msg: any) => {
  try {
    const t = (msg.content[0] as any).text;
    // まずオブジェクト形式で試す
    const objStart = t.indexOf('{');
    const objEnd = t.lastIndexOf('}');
    if (objStart !== -1 && objEnd !== -1) {
      const obj = JSON.parse(t.slice(objStart, objEnd + 1));
      const arr = obj.items || obj.axes || obj.data || Object.values(obj).find(Array.isArray);
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.map((x: any) => ({ ...x, index: indexMap[x.id] || x.id }));
      }
    }
    // 配列形式で試す
    const arrStart = t.indexOf('[');
    const arrEnd = t.lastIndexOf(']');
    if (arrStart !== -1 && arrEnd !== -1) {
      const arr = JSON.parse(t.slice(arrStart, arrEnd + 1));
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.map((x: any) => ({ ...x, index: indexMap[x.id] || x.id }));
      }
    }
    return [];
  } catch { return []; }
};

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
        const axes = detail.axes || {};
        const hasAxes = (axes.ultra_short?.length || 0) > 0;
        const generatedAt = new Date(detail.generated_at || 0);
        const hoursSince = (Date.now() - generatedAt.getTime()) / 3600000;
        if (hoursSince < 48 && hasAxes) return NextResponse.json(detail);
      }
    }

    const name = company.name;
    const sector = company.sector || "不明";
    const tone = "「〜です」「〜ます」調で丁寧に。専門用語はカッコで説明。";

    const axisPrompt = (type: string, items: string) =>
      `「${name}」（${sector}業）の${type}IPO分析。${tone}以下のJSON形式で返答：{"items":[${items}]}`;

    const item = (id: string, title: string) =>
      `{"id":"${id}","title":"${title}","score":65,"why_matters":"なぜ重要か説明","description":"120字以上の詳細分析","verdict":"総評","doc_guide":"確認方法"}`;

    const [summaryMsg, usMsg, shMsg, loMsg] = await Promise.all([
      callHaiku(`「${name}」（${sector}業）IPO分析。${tone}JSON：{"summary":"200字で事業内容と投資ポイントを丁寧に説明","total_score":65,"grade":"B"}`, 500),
      callHaiku(axisPrompt("超短期", [
        item("float", "需給・ロック内容"),
        item("lockup", "VC保有・売り圧力"),
        item("timing", "市場環境・タイミング")
      ].join(","))),
      callHaiku(axisPrompt("短期", [
        item("valuation", "バリュエーション"),
        item("vc_sell", "ロックアップ解除後の売り圧力"),
        item("growth", "成長性・市場規模")
      ].join(","))),
      callHaiku(axisPrompt("長期", [
        item("management", "経営陣・ガバナンス"),
        item("unit_econ", "ユニットエコノミクス"),
        item("competitor", "競合優位性")
      ].join(",")))
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

    const debug_us = (usMsg.content[0] as any).text.substring(0, 300);
    const analysis = {
      summary, total_score, grade,
      debug_us,
      highlight_reason: null,
      axes: {
        ultra_short: parseItems(usMsg),
        short: parseItems(shMsg),
        long: parseItems(loMsg)
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