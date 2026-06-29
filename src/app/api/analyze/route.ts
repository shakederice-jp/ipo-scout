export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notifyAdmin } from "@/lib/notify-admin";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callClaudeWithRetry(
  claude: Anthropic,
  prompt: string,
  maxRetries: number = 2
): Promise<any> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const msg = await claude.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 3500,
        messages: [
          { role: "user", content: prompt },
          { role: "assistant", content: '{' }
        ]
      });
      return msg;
    } catch (e: any) {
      lastError = e;
      console.error(`Claude API attempt ${attempt} failed:`, e?.message);
      if (attempt <= maxRetries) {
        console.log(`Retrying in 30s... (attempt ${attempt + 1}/${maxRetries + 1})`);
        await sleep(30000);
      }
    }
  }
  throw lastError;
}

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
    const marketInfo = co.analysis_market
    ? `\n【市場・競合情報】主幹事:${co.analysis_market.lead_underwriter ?? ""}・競合:${(co.analysis_market.competitors ?? []).map((c: any) => c.name).join("、")}・業界PER:${co.analysis_market.industry_per ?? ""}・市場動向:${co.analysis_market.market_trend ?? ""}`
    : "";
    const dataNote = dataContext
      ? `【実データ - 必ず具体的数値を引用すること】\n${dataContext}${marketInfo}`
      : `実データ未取得。${n}(${sc})の一般情報で分析。${marketInfo}`;

      const prompt = `あなたは日本のIPO投資アナリストです。
      ${n}（${sc}、${ex}市場、上場予定${ld}）のIPOを総合評価してください。
      JSONのみで返答してください。マークダウン・コードブロック・余分なテキスト一切不要。
      
      ${dataNote}
      
      【絶対ルール - 必ず守ること】
      1. 数値・事実は必ず上記【実データ】から引用すること。データにない数値は絶対に作らない
      2. データに記載のない情報は「不明」または「目論見書参照」と記載する
      3. summaryには必ず実データから引用した具体的数値を最低2つ含める
      4. スコアはデータの裏付けがある項目のみ根拠をもとに算出する
      5. 実データと矛盾する記述は絶対にしない
      
      【出力形式】必ず以下の構造で、全フィールドを完結させること:
      {
        "summary": "300字以内。必ず実データの具体的数値を2つ以上引用して記述。例：売上○億円・利益率○%など",
        "data_citations": ["引用した実データの根拠1（例：売上高2,855,346千円（2025年8月期））", "引用根拠2", "引用根拠3"],
        "data_confidence": "high（実データあり）/ medium（一部推定）/ low（データ不足）のいずれか",
  "ai_summary": "トップページ掲載用・120字以内。この銘柄の最大の魅力・独自ポジション・成長の根拠を核心から語り、読んだ人が『もっと深く知りたい』と感じさせる文章。事実の羅列ではなく、なぜ今注目なのかという視点で書くこと",
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

const msg = await callClaudeWithRetry(claude, prompt);
const raw2 = (msg.content[0] as any).text ?? "";
    const text = '{' + raw2;

    let parsed = repairJson(text);

    // パース失敗時は1回だけ再試行
    if (!parsed) {
      console.warn("③ parse failed, retrying once...");
      await sleep(10000);
      try {
        const retryMsg = await claude.messages.create({
          model: "claude-sonnet-4-5",
          max_tokens: 3500,
          messages: [
            { role: "user", content: prompt },
            { role: "assistant", content: '{' }
          ]
        });
        const retryRaw = '{' + ((retryMsg.content[0] as any).text ?? "");
        parsed = repairJson(retryRaw);
      } catch (retryErr) {
        console.error("③ retry also failed:", retryErr);
      }
    }

    if (!parsed) {
      console.error("③ parse failed after retry:", text.slice(0, 400));
      await notifyAdmin(
        "分析JSONパース失敗（リトライ後も失敗）",
        `銘柄: ${co.name ?? "不明"}\n出力の先頭: ${text.slice(0, 300)}`,
        'error'
      );
      return NextResponse.json({ error: "parse failed" }, { status: 500 });
    }

    const summary = {
      summary:           parsed.summary ?? `${n}IPO分析`,
      data_citations:    Array.isArray(parsed.data_citations) ? parsed.data_citations : [],
      data_confidence:   parsed.data_confidence ?? "low",
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
      },
      ...(parsed.ai_summary ? { ai_summary: parsed.ai_summary } : {}),
    }).eq("id", co.id);

    return NextResponse.json(summary);
  } catch (e: any) {
    console.error("③ analyze error:", e?.message);
    await notifyAdmin(
      `分析生成エラー`,
      `エラー: ${e?.message ?? "unknown"}\n\n${e?.stack ?? ""}`,
      'error'
    );
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}