export const maxDuration = 90;
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notifyAdmin } from "@/lib/notify-admin";
import { createInfographic } from "@/lib/infographic";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// x_post_drafts / scheduled_posts へのinsertはRLS(行レベルセキュリティ)で
// 保護されており、通常のanonキー(createSupabaseServerClient)からは書き込めない。
// generate-x-drafts等の既存の書き込み処理と同じく、ここだけservice roleキーを使う。
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
  "summary": "300字以内。必ず実データの具体的数値を2つ以上引用して記述。1文目で結論を端的に述べ、改行(\\n\\n)を1つ挟んでから詳細説明を続ける2段落構成にすること。ですます調",
  "summary_beginner": "同じ内容を、投資初心者にも分かるように書き直したもの。300〜400字程度。専門用語（経常利益率、営業CF、流通比率など）が出てきたら都度かんたんな説明を一言添えること。1文目で結論、改行(\\n\\n)を挟んで詳細、という2段落構成。ですます調",
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
3. tweet_summaryは、3つのインサイトのうち最も注目度が高いもの1つを選び、40字以内で要約すること（Xへの投稿に使うため、文字数を厳守すること）

【出力形式】必ず以下の構造のみで完結させること:
{
  "insights": [
    {"title": "インサイトタイトル1（20字以内）", "body": "カード折りたたみ時に見える短い要約（100字以内）。ですます調", "detail": "カードを開いた時に表示する詳しい解説。200〜350字程度。1文目で結論・要点を端的に述べ、そのあと改行(\\n\\n)を1つ挟んでから、実データの数値を交えた背景・理由の説明、さらに改行(\\n\\n)を挟んで投資判断への影響、という2〜3段落構成にすること。ですます調"},
    {"title": "インサイトタイトル2（20字以内）", "body": "同上（100字以内）。ですます調", "detail": "同上の形式で200〜350字程度。ですます調"},
    {"title": "インサイトタイトル3（20字以内）", "body": "同上（100字以内）。ですます調", "detail": "同上の形式で200〜350字程度。ですます調"}
  ],
  "tweet_summary": "40字以内の要約文（ですます調）"
}`;
}

function insightsBeginnerPrompt(insights: any[]): string {
  const list = insights.map((ins: any, i: number) => `${i+1}. タイトル:${ins.title}\n本文:${ins.detail ?? ins.body ?? ""}`).join("\n\n");
  return `以下は日本のIPO投資に関する3つの解説です。それぞれを、投資初心者にも分かるように書き直してください。
JSONのみで返答してください。マークダウン・コードブロック・余分なテキスト一切不要。

【元の解説】
${list}

【書き直しのルール】
1. 専門用語には都度かんたんな説明を添えること
2. 250〜400字程度、段落ごとに改行(\\n\\n)を入れること
3. ですます調で記述すること
4. 元の数値・事実は省略せずそのまま引用すること

【出力形式】必ず以下の構造のみで完結させること:
{
  "details_beginner": ["1つ目の書き直し文", "2つ目の書き直し文", "3つ目の書き直し文"]
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
        summary_beginner:    r.summary_beginner ?? "",
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
        tweet_summary:     r.tweet_summary ?? "",
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

      // X投稿ドラフトを作成 + 2営業日後・4営業日後の再掲を予約
      // ↓ なぜ動いた/動かなかったのかをadmin画面で見えるようにするための診断メモ
      let xDraftDebug = "";
      if (process.env.X_AUTOPOST_ENABLED === "true" && summary.insights?.[0]) {
        try {
          const revenue = (co as any).structured_data?.financials?.revenue_trend ?? "不明";
          const profit  = (co as any).structured_data?.financials?.profit_trend ?? "不明";
          const underwriter = (co as any).analysis_market?.lead_underwriter ?? "未定";

          function addBusinessDays(start: Date, days: number): Date {
            const result = new Date(start);
            let added = 0;
            while (added < days) {
              result.setDate(result.getDate() + 1);
              const dow = result.getDay();
              if (dow !== 0 && dow !== 6) added++;
            }
            return result;
          }
          const toDateStr = (d: Date) => d.toISOString().slice(0, 10);

          function buildTweetText(titleLabel: string) {
            return `【${titleLabel}】\n${co.name}\n\n` +
              `・上場日：${co.listing_date ?? "未定"}\n` +
              `・市場：${co.exchange ?? "不明"}\n` +
              `・コード：${(co as any).ticker ?? "未定"}\n` +
              `・売上：${revenue}\n` +
              `・利益：${profit}\n` +
              `・主幹事：${underwriter}\n\n` +
              `${summary.insights[0].body}\n\n` +
              `続きは分析アプリで👆\n\n#IPO #新規上場`;
          }

          const initialText = buildTweetText("新規IPO承認");

          // インフォグラフィック画像を生成(客観的データのみ・失敗しても投稿自体は続行する)
          let imageUrl: string | null = null;
          try {
            imageUrl = await createInfographic({
              companyId: co.id,
              companyName: co.name,
              listingDate: co.listing_date ?? "未定",
              exchange: co.exchange ?? "不明",
              ticker: (co as any).ticker ?? "未定",
              revenue,
              profit,
              underwriter,
            });
          } catch (e: any) {
            console.error("インフォグラフィック生成失敗:", e?.message);
          }

          // 初回分をX投稿ドラフトに追加(次回の朝メールにまとめて含まれる)
          // 注意: supabase-jsのinsert()は失敗してもthrowしない(エラーはerrorに入るだけ)ため、
          // 必ず{error}を確認して手動でthrowする(でないと失敗が握りつぶされて気づけない)
          const { error: draftError } = await supabaseAdmin.from("x_post_drafts").insert({
            theme_number: 0,
            theme_label: "新規IPO承認",
            content: initialText,
            image_url: imageUrl,
            source_note: `IPO分析システム由来(${co.name})`,
          });
          if (draftError) {
            throw new Error(`x_post_drafts insert失敗: ${draftError.message} (code: ${draftError.code ?? "unknown"})`);
          }

          // 2営業日後・4営業日後の再掲を予約(当日の朝ドラフト生成時に自動でx_post_draftsへ追加される)
          const followupText = buildTweetText("IPO再掲");
          const day2 = toDateStr(addBusinessDays(new Date(), 2));
          const day4 = toDateStr(addBusinessDays(new Date(), 4));

          const { error: scheduledError } = await supabaseAdmin.from("scheduled_posts").insert([
            { company_id: co.id, scheduled_date: day2, tweet_text: followupText, posted: false },
            { company_id: co.id, scheduled_date: day4, tweet_text: followupText, posted: false },
          ]);
          if (scheduledError) {
            throw new Error(`scheduled_posts insert失敗: ${scheduledError.message} (code: ${scheduledError.code ?? "unknown"})`);
          }
          xDraftDebug = imageUrl ? "success(画像あり)" : "success(画像なし)";
        } catch (e: any) {
          xDraftDebug = `error: ${e?.message ?? String(e)}`;
          await notifyAdmin(`⚠️ Xドラフト作成エラー: ${co.name}（分析系）`, String(e), "warn");
        }
      } else {
        xDraftDebug = `skipped(ENABLED=${process.env.X_AUTOPOST_ENABLED ?? "未設定"} / insights件数=${summary.insights?.length ?? 0})`;
      }

      return NextResponse.json({ success: true, x_draft_debug: xDraftDebug });
    }

    // ===== 個別パートの生成 =====
    const part = body.part ?? "score";

    if (part === "insights_beginner") {
      const insights = body.insights ?? [];
      const prompt = insightsBeginnerPrompt(insights);
      const msg = await callClaudeWithRetry(prompt);
      const raw2 = (msg.content[0] as any).text ?? "";
      const parsed = repairJson('{' + raw2);
      if (!parsed) {
        return NextResponse.json({ error: "parse failed (insights_beginner)" }, { status: 500 });
      }
      return NextResponse.json(parsed);
    }

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