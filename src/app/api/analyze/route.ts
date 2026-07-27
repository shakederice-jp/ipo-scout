export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notifyAdmin } from "@/lib/notify-admin";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callClaudeWithRetry(prompt: string, maxRetries: number = 1): Promise<any> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const msg = await claude.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 2000,
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
        await sleep(5000);
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
          if (result) return result;
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

function buildDataNote(co: any) {
  const { ctx: dataContext, source: dataSource } = buildDataContext(co.structured_data, co.raw_prospectus);
  const marketInfo = co.analysis_market
    ? `\n【市場・競合情報】主幹事:${co.analysis_market.lead_underwriter ?? ""}・競合:${(co.analysis_market.competitors ?? []).map((c: any) => c.name).join("、")}・業界PER:${co.analysis_market.industry_per ?? ""}・市場動向:${co.analysis_market.market_trend ?? ""}`
    : "";
  const n = co.name ?? "unknown";
  const sc = co.sector ?? "tech";
  const dataNote = dataContext
    ? `【実データ - 必ず具体的数値を引用すること】\n${dataContext}${marketInfo}`
    : `実データ未取得。${n}(${sc})の一般情報で分析。${marketInfo}`;
  return { dataNote, dataSource };
}

function scorePrompt(co: any, dataNote: string) {
  const n = co.name ?? "unknown", sc = co.sector ?? "tech", ld = co.listing_date ?? "2026", ex = co.exchange ?? "グロース";
  return `あなたは日本のIPO投資アナリストです。
${n}（${sc}、${ex}市場、上場予定${ld}）のIPOを総合評価してください。
JSONのみで返答してください。マークダウン・コードブロック・余分なテキスト一切不要。文章はすべて「ですます調」で記述すること。

${dataNote}

【絶対ルール】
1. 数値・事実は必ず上記【実データ】から引用すること。データにない数値は絶対に作らない
2. データに記載のない情報は「不明」または「目論見書参照」と記載する
3. summaryには必ず実データから引用した具体的数値を最低2つ含める
4. missing_data_pointsには、IPO投資判断において通常あるべき以下のような項目のうち、上記【実データ】に記載がなかった、または「不明」「目論見書参照」となっていたものだけを具体的に列挙すること（記載があった項目は含めない）:
   業績予想（次期見通し）／配当方針／株主別の具体的な保有比率／流通株式比率の具体的な数値／主幹事証券会社名／類似他社との詳細な比較データ／黒字化・収益化の見込み時期／代表者の同業界での実績年数
   ※このリストは例示であり、他にも実データに記載がなく投資判断上重要と思われる項目があれば追加してよい
5. 記載がなかった項目が無い場合はmissing_data_pointsを空配列[]にすること

【出力形式】必ず以下の構造のみで完結させること:
{
  "summary": "300字以内。必ず実データの具体的数値を2つ以上引用して記述。ですます調",
  "data_citations": ["引用根拠1", "引用根拠2", "引用根拠3"],
  "data_confidence": "high（実データあり）/ medium（一部推定）/ low（データ不足）のいずれか",
  "missing_data_points": ["記載がなかった項目1（15字以内、体言止め）", "記載がなかった項目2（15字以内、体言止め）"],
  "ai_summary": "トップページ掲載用・120字以内。この銘柄の最大の魅力・独自ポジション・成長の根拠を核心から語る文章。ですます調",
  "total_score": 65,
  "grade": "B",
  "ultra_short_grade": "B",
  "short_grade": "C",
  "long_grade": "B",
  "grade_reason": {
    "ultra_short": "超短期（初値〜当日）の判定理由。100字以内。ですます調",
    "short": "短期（1〜3ヶ月）の判定理由。100字以内。ですます調",
    "long": "長期（数年〜）の判定理由。100字以内。ですます調"
  },
  "axes_scores": {
    "float": 65, "lockup": 60, "timing": 70, "valuation": 55, "vc_sell": 50,
    "growth": 75, "management": 65, "unit_econ": 60, "competitor": 55
  }
}
グレードはA〜Eの5段階（A=強気(上位20%) 〜 E=弱気(下位20%)）`;
}

function insightsPrompt(co: any, dataNote: string) {
  const n = co.name ?? "unknown";
  return `あなたは日本のIPO投資アナリストです。
${n}のIPOについて、「まずここに注目！」というコーナー用のインサイトを3つ作成してください。
JSONのみで返答してください。マークダウン・コードブロック・余分なテキスト一切不要。文章はすべて「ですます調」で記述すること。

${dataNote}

【絶対ルール】
1. 数値・事実は必ず上記【実データ】から引用すること。データにない数値は絶対に作らない
2. 3つは「強み」「懸念点」「注目すべき構造・戦略」など、視点が重ならないよう選ぶこと

【出力形式】必ず以下の構造のみで完結させること:
{
  "insights": [
    {"title": "インサイトタイトル1（20字以内）", "body": "カード折りたたみ時に見える短い要約（100字以内）。ですます調", "detail": "カードを開いた時に表示する詳しい解説。200〜350字程度。なぜこれが注目ポイントなのか、実データの数値を交えながら背景・理由・投資判断への影響を丁寧に説明する。ですます調"},
    {"title": "インサイトタイトル2（20字以内）", "body": "同上（100字以内）。ですます調", "detail": "同上の形式で200〜350字程度。ですます調"},
    {"title": "インサイトタイトル3（20字以内）", "body": "同上（100字以内）。ですます調", "detail": "同上の形式で200〜350字程度。ですます調"}
  ]
}`;
}

function scenariosPrompt(co: any, dataNote: string) {
  const n = co.name ?? "unknown";
  return `あなたは日本のIPO投資アナリストです。
${n}のIPOについて、短期（〜6ヶ月）と長期（5〜10年）の株価シナリオをそれぞれ3パターン（強気・中立・弱気）作成してください。
JSONのみで返答してください。マークダウン・コードブロック・余分なテキスト一切不要。文章はすべて「ですます調」で記述すること。

${dataNote}

【絶対ルール】
1. 数値・事実は必ず上記【実データ】から引用すること。データにない数値は絶対に作らない
2. 確率(prob)は3パターン合計がおおよそ100%になるようにすること

【出力形式】必ず以下の構造のみで完結させること:
{
  "scenarios_short": [
    {"id": "A", "verdict": "強気", "name": "短期強気シナリオ名", "vsIpo": "公募価格の1.8倍", "prob": "25%", "positives": ["好材料1", "好材料2"], "negatives": ["リスク1"], "conclusion": "短期（〜6ヶ月）の要点を50字以内で。ですます調"},
    {"id": "B", "verdict": "中立", "name": "短期中立シナリオ名", "vsIpo": "公募価格±10%", "prob": "45%", "positives": ["好材料1"], "negatives": ["リスク1", "リスク2"], "conclusion": "同上。ですます調"},
    {"id": "C", "verdict": "弱気", "name": "短期弱気シナリオ名", "vsIpo": "公募価格の0.8倍", "prob": "30%", "positives": ["好材料1"], "negatives": ["リスク1", "リスク2"], "conclusion": "同上。ですます調"}
  ],
  "scenarios_long": [
    {"id": "A", "verdict": "強気", "name": "長期強気シナリオ名", "vsIpo": "+200〜500%", "prob": "25%", "positives": ["好材料1", "好材料2"], "negatives": ["リスク1"], "conclusion": "長期（5〜10年）の要点を50字以内で。ですます調"},
    {"id": "B", "verdict": "中立", "name": "長期中立シナリオ名", "vsIpo": "+50〜150%", "prob": "45%", "positives": ["好材料1"], "negatives": ["リスク1", "リスク2"], "conclusion": "同上。ですます調"},
    {"id": "C", "verdict": "弱気", "name": "長期弱気シナリオ名", "vsIpo": "▲20〜50%", "prob": "30%", "positives": ["好材料1"], "negatives": ["リスク1", "リスク2"], "conclusion": "同上。ですます調"}
  ]
}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = createSupabaseServerClient();
    if (!supabase) return NextResponse.json({ error: "db" }, { status: 500 });
    const { data: co } = await supabase.from("ipo_companies").select("*").eq("id", body.id).single();
    if (!co) return NextResponse.json({ error: "not found" }, { status: 404 });

    // ===== 最終保存（3パートの結果をまとめてDBに書き込む） =====
    if (body.save_results) {
      const r = body.save_results;
      const summary = {
        summary:             r.summary ?? `${co.name}IPO分析`,
        data_citations:      Array.isArray(r.data_citations) ? r.data_citations : [],
        data_confidence:     r.data_confidence ?? "low",
        missing_data_points: Array.isArray(r.missing_data_points) ? r.missing_data_points.slice(0,8) : [],
        total_score:       r.total_score ?? 65,
        grade:             r.grade ?? "C",
        ultra_short_grade: r.ultra_short_grade ?? "C",
        short_grade:       r.short_grade ?? "C",
        long_grade:        r.long_grade ?? "C",
        grade_reason:      r.grade_reason ?? {},
        insights:          Array.isArray(r.insights) ? r.insights.slice(0,3) : [],
        scenarios_short:   Array.isArray(r.scenarios_short) ? r.scenarios_short.slice(0,3) : [],
        scenarios_long:    Array.isArray(r.scenarios_long) ? r.scenarios_long.slice(0,3) : [],
        axes_scores:       r.axes_scores ?? {},
        data_source:       r.data_source ?? "AI",
        sources: [
          { label:"東証新規上場情報", url:"https://www.jpx.co.jp/listing/stocks/new/index.html" },
          { label:"EDINET・有価証券届出書", url:"https://disclosure2.edinet-fsa.go.jp/" },
          { label:"IPOkabu", url:"https://ipokabu.net/" },
        ],
        generated_at: new Date().toISOString(),
      };
      await supabase.from("ipo_companies").update({
        analysis_summary: summary,
        analysis_detail: { ...summary, axes: { ultra_short: [], short: [], long: [] } },
        ...(r.ai_summary ? { ai_summary: r.ai_summary } : {}),
      }).eq("id", co.id);
      return NextResponse.json({ success: true });
    }

    // ===== 個別パートの生成 =====
    const part = body.part ?? "score";
    const { dataNote, dataSource } = buildDataNote(co);
    const prompt =
      part === "insights"  ? insightsPrompt(co, dataNote) :
      part === "scenarios" ? scenariosPrompt(co, dataNote) :
      scorePrompt(co, dataNote);

    const msg = await callClaudeWithRetry(prompt);
    const raw2 = (msg.content[0] as any).text ?? "";
    let parsed = repairJson('{' + raw2);

    if (!parsed) {
      console.warn(`analyze(${part}) parse failed, retrying once...`);
      await sleep(5000);
      try {
        const retryMsg = await claude.messages.create({
          model: "claude-sonnet-4-5",
          max_tokens: 2000,
          messages: [{ role: "user", content: prompt }, { role: "assistant", content: '{' }],
        });
        parsed = repairJson('{' + ((retryMsg.content[0] as any).text ?? ""));
      } catch (e) {
        console.error(`analyze(${part}) retry failed:`, e);
      }
    }

    if (!parsed) {
      await notifyAdmin(
        `分析JSONパース失敗（${part}／リトライ後も失敗）`,
        `銘柄: ${co.name ?? "不明"}`,
        'error'
      );
      return NextResponse.json({ error: `parse failed (${part})` }, { status: 500 });
    }

    return NextResponse.json({ ...parsed, data_source: dataSource });
  } catch (e: any) {
    console.error("analyze error:", e?.message);
    await notifyAdmin(`分析生成エラー`, `エラー: ${e?.message ?? "unknown"}\n\n${e?.stack ?? ""}`, 'error');
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}