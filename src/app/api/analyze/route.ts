export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function repairJson(text: string): any {
  try { return JSON.parse(text); } catch {}
  const t = text.trimEnd();
  for (let i = t.length - 1; i > t.length - 500; i--) {
    if (t[i] === '}') {
      const candidate = t.slice(0, i + 1);
      for (const suffix of ['', '}', ']}', '}}', '}]}', '}}]}', '}}}']) {
        try {
          const result = JSON.parse(candidate + suffix);
          if (result?.summary) return result;
        } catch {}
      }
    }
  }
  return null;
}

function buildDataContext(structured: any, raw: any): { ctx: string; source: string } {
  if (structured && Object.keys(structured).length > 0) {
    const d = structured;
    const ctx = [
      `事業:${(d.business_summary??"").slice(0,200)}`,
      `売上推移:${d.financials?.revenue_trend??"不明"}`,
      `利益推移:${d.financials?.profit_trend??"不明"}`,
      `利益率:${d.financials?.profit_margin??"不明"}`,
      `CF:${d.financials?.cash_flow??"不明"}`,
      `発行済株式:${d.ipo_details?.total_shares??"不明"}`,
      `公募売出株数:${d.ipo_details?.public_shares??"不明"}`,
      `流通比率:${d.ipo_details?.float_ratio??"不明"}`,
      `調達金額:${d.ipo_details?.fundraising_amount??"不明"}`,
      `資金使途:${(d.ipo_details?.use_of_proceeds??"").slice(0,150)}`,
      `ロックアップ期間:${d.ipo_details?.lockup_period??"不明"}`,
      `ロックアップ対象:${(d.ipo_details?.lockup_targets??"").slice(0,150)}`,
      `OA:${d.ipo_details?.overallotment??"不明"}`,
      `主要株主:${JSON.stringify(d.shareholders??[]).slice(0,500)}`,
      `主なリスク:${JSON.stringify((d.risks??[]).slice(0,6)).slice(0,500)}`,
      `経営陣:${(d.management??"").slice(0,200)}`,
      `成長要因:${(d.growth_drivers??"").slice(0,200)}`,
      `懸念点:${(d.concerns??"").slice(0,200)}`,
    ].join("\n");
    return { ctx: ctx.slice(0, 2500), source: "EDINET+Claude(7step)" };
  }
  if (raw && Object.keys(raw).length > 0) {
    const ctx = Object.entries(raw as Record<string,string>)
      .map(([k,v]) => `[${k}]${String(v).slice(0,500)}`)
      .join("\n");
    return { ctx: ctx.slice(0, 2500), source: "EDINET+Claude" };
  }
  return { ctx: "", source: "AI" };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = createSupabaseServerClient();
    if (!supabase) return NextResponse.json({ error: "db" }, { status: 500 });

    const { data: co } = await supabase
      .from("ipo_companies")
      .select("*")
      .eq("id", body.id)
      .single();
    if (!co) return NextResponse.json({ error: "not found" }, { status: 404 });

    const n  = co.name ?? "unknown";
    const sc = co.sector ?? "tech";
    const ld = co.listing_date ?? "2026";
    const ex = co.exchange ?? "グロース";

    const { ctx: dataContext, source: dataSource } = buildDataContext(
      co.structured_data, co.raw_prospectus
    );

    const dataNote = dataContext
      ? `【実データ - 必ず具体的数値を引用すること】\n${dataContext}`
      : `実データ未取得。${n}(${sc})の一般情報で分析。`;

    const prompt = `あなたは日本のIPO投資アナリストです。
${n}（${sc}、${ex}市場、上場予定${ld}）のIPOを総合評価してください。
JSONのみで返答してください。マークダウン・コードブロック・余分なテキスト一切不要。

${dataNote}

【出力形式】必ず以下の構造で、全フィールドを完結させること:
{
  "summary": "300字以内の総合評価。具体的数値を必ず含める",
  "total_score": 65,
  "grade": "B",
  "ultra_short_grade": "B",
  "short_grade": "C",
  "long_grade": "B",
  "grade_reason": {
    "ultra_short": "超短期（初値〜当日）の判定理由。100字以内",
    "short": "短期（1〜3ヶ月）の判定理由。100字以内",
    "long": "長期（数年〜）の判定理由。100字以内"
  },
  "insights": [
    {"title": "インサイトタイトル1（20字以内）", "body": "内容（100字以内）"},
    {"title": "インサイトタイトル2（20字以内）", "body": "内容（100字以内）"},
    {"title": "インサイトタイトル3（20字以内）", "body": "内容（100字以内）"}
  ],
  "scenarios_short": [
    {"id": "A", "verdict": "強気", "name": "短期強気シナリオ名", "vsIpo": "公募価格の1.8倍", "prob": "25%", "positives": ["好材料1", "好材料2"], "negatives": ["リスク1"], "conclusion": "短期（〜6ヶ月）の要点を50字以内で"},
    {"id": "B", "verdict": "中立", "name": "短期中立シナリオ名", "vsIpo": "公募価格±10%", "prob": "45%", "positives": ["好材料1"], "negatives": ["リスク1", "リスク2"], "conclusion": "短期（〜6ヶ月）の要点を50字以内で"},
    {"id": "C", "verdict": "弱気", "name": "短期弱気シナリオ名", "vsIpo": "公募価格の0.8倍", "prob": "30%", "positives": ["好材料1"], "negatives": ["リスク1", "リスク2"], "conclusion": "短期（〜6ヶ月）の要点を50字以内で"}
  ],
  "scenarios_long": [
    {"id": "A", "verdict": "強気", "name": "長期強気シナリオ名", "vsIpo": "+200〜500%", "prob": "25%", "positives": ["好材料1", "好材料2"], "negatives": ["リスク1"], "conclusion": "長期（5〜10年）の要点を50字以内で"},
    {"id": "B", "verdict": "中立", "name": "長期中立シナリオ名", "vsIpo": "+50〜150%", "prob": "45%", "positives": ["好材料1"], "negatives": ["リスク1", "リスク2"], "conclusion": "長期（5〜10年）の要点を50字以内で"},
    {"id": "C", "verdict": "弱気", "name": "長期弱気シナリオ名", "vsIpo": "▲20〜50%", "prob": "30%", "positives": ["好材料1"], "negatives": ["リスク1", "リスク2"], "conclusion": "長期（5〜10年）の要点を50字以内で"}
  ],
  "axes_scores": {
    "float": 65,
    "lockup": 60,
    "timing": 70,
    "valuation": 55,
    "vc_sell": 50,
    "growth": 75,
    "management": 65,
    "unit_econ": 60,
    "competitor": 55
  },
  "data_source": "${dataSource}"
}

グレードはA〜Eの5段階:
A=強気（上位20%）, B=やや強気, C=中立, D=やや弱気, E=弱気（下位20%）`;

    const msg = await claude.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 3500,
      messages: [
        { role: "user", content: prompt },
        { role: "assistant", content: '{' }
      ]
    });

    const raw2 = (msg.content[0] as any).text ?? "";
    const text = '{' + raw2;

    const parsed = repairJson(text);
    if (!parsed) {
      console.error("③ parse failed:", text.slice(0, 400));
      return NextResponse.json({ error: "parse failed" }, { status: 500 });
    }

    const summary = {
      summary:           parsed.summary ?? `${n}IPO分析`,
      total_score:       parsed.total_score ?? 65,
      grade:             parsed.grade ?? "C",
      ultra_short_grade: parsed.ultra_short_grade ?? "C",
      short_grade:       parsed.short_grade ?? "C",
      long_grade:        parsed.long_grade ?? "C",
      grade_reason:      parsed.grade_reason ?? {},
      insights:          Array.isArray(parsed.insights) ? parsed.insights.slice(0,3) : [],
      scenarios_short:   Array.isArray(parsed.scenarios_short) ? parsed.scenarios_short.slice(0,3) : [],
      scenarios_long:    Array.isArray(parsed.scenarios_long) ? parsed.scenarios_long.slice(0,3) : [],
      axes_scores:       parsed.axes_scores ?? {},
      data_source:       dataSource,
      sources: [
        { label:"東証新規上場情報", url:"https://www.jpx.co.jp/listing/stocks/new/index.html" },
        { label:"EDINET・有価証券届出書", url:"https://disclosure2.edinet-fsa.go.jp/" },
        { label:"IPOkabu", url:"https://ipokabu.net/" },
      ],
      generated_at: new Date().toISOString(),
    };

    await supabase.from("ipo_companies").update({
      analysis_summary: summary,
      analysis_detail: {
        ...summary,
        axes: { ultra_short: [], short: [], long: [] },
      }
    }).eq("id", co.id);

    return NextResponse.json(summary);
  } catch (e: any) {
    console.error("③ analyze error:", e?.message);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}