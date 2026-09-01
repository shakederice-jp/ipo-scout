export const maxDuration = 90;
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notifyAdmin } from "@/lib/notify-admin";
import { createInfographic } from "@/lib/infographic";
import { buildIpoIntroText } from "@/lib/ipo-intro-text";
import { buildRevenueChartData, formatKeyMetricsTrend } from "@/lib/ipo-revenue-chart";
import { computeAxisGroupScores } from "@/lib/ipo-axis-scores";
import { fetchMarketSnapshotContext } from "@/lib/market-snapshot";

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
        // 2026/8/29、「まずここに注目」に600〜800字のappeal_narrative(トレンド記事用の
        // 紹介文)を追加した際、既存の3インサイト分(title/body/detail)+tweet_summaryだけで
        // 2000トークンの上限にほぼ達しており、追加分がトークン上限で強制的に途中で
        // 打ち切られる(＝文が完結しないまま終わる)リスクがあったため、余裕を持たせて4000に引き上げた。
        max_tokens: 4000,
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
    // 2026/8/30、トレンド記事本文とインフォグラフィック画像で売上高の数字が食い違う不具合の
    // 恒久対策として、AIの自由記述(financials.revenue_trend/profit_trend)ではなく、
    // インフォグラフィックのグラフと同じ情報源(key_metrics)から売上・利益推移の文章を組み立てる。
    // key_metricsが無い(古いデータ等の)場合のみ、従来通りAIの自由記述にフォールバックする。
    const { revenueTrend, profitTrend } = formatKeyMetricsTrend(d.key_metrics);
    const ctx = [
      `事業:${(d.business_summary??"").slice(0,200)}`,
      `売上推移:${revenueTrend ?? d.financials?.revenue_trend ?? "不明"}`,
      `利益推移(経常利益):${profitTrend ?? d.financials?.profit_trend ?? "不明"}`,
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

function scorePrompt(co: any, dataNote: string, marketNote: string = "") {
  const n = co.name ?? "unknown", sc = co.sector ?? "tech", ld = co.listing_date ?? "2026", ex = co.exchange ?? "グロース";
  // 2026/9/1追加: 週次で調査している市場テーマ・地合い情報(src/lib/market-snapshot.ts)。
  // 個別銘柄の実データとは別枠の一般的な参考情報のため、影響範囲を超短期の評価に限定する
  // 指示を明記し、data_citations等の実データ引用ルールには使わせないようにしている。
  const marketNoteBlock = marketNote
    ? `\n${marketNote}\n【上記・市場テーマ地合い情報の扱い方】この情報は個別銘柄の実データではなく、市場全体の週次調査に基づく一般的な参考情報です。断定的な根拠として使わず、需給・地合いの観点から、超短期（ultra_short_grade・axes_scores.float/lockup/timing・grade_reason.ultra_short）の評価にのみ補助的に反映してください。total_score・grade・short_grade・long_grade・data_citations・missing_data_pointsには使わないでください。\n`
    : "";
  return `あなたは日本のIPO投資アナリストです。
${n}（${sc}、${ex}市場、上場予定${ld}）のIPOを総合評価してください。
JSONのみで返答してください。マークダウン・コードブロック・余分なテキスト一切不要。文章はすべて「ですます調」で記述すること。

${dataNote}
${marketNoteBlock}
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

function insightsPrompt(co: any, dataNote: string, marketNote: string = "") {
  const n = co.name ?? "unknown";
  // 2026/9/1追加: appeal_narrative(マーケットトレンドページ「新規IPO紹介」記事の本文)に
  // 直近の注目テーマとの関連を軽く盛り込めるようにするための参考情報。
  const marketNoteBlock = marketNote
    ? `\n${marketNote}\n【上記・市場テーマ地合い情報の扱い方】これは市場全体の週次調査に基づく一般的な参考情報です。この銘柄の事業・セクターが上記の注目テーマと関連する場合は、appeal_narrative（客寄せ文）の中で「直近こういうテーマに関心が集まっている」といった形で軽く触れてもよいですが、断定的な株価予測や投資助言にはしないでください。関連が薄い場合は無理に触れなくて構いません。insightsやtweet_summaryには使わないでください。\n`
    : "";
  return `あなたは日本のIPO投資アナリストです。
${n}のIPOについて、「まずここに注目！」というコーナー用のインサイトを3つ作成してください。
JSONのみで返答してください。マークダウン・コードブロック・余分なテキスト一切不要。文章はすべて「ですます調」で記述すること。

${dataNote}
${marketNoteBlock}
【絶対ルール】
1. 数値・事実は必ず上記【実データ】から引用すること。データにない数値は絶対に作らない
2. 3つは「強み」「懸念点」「注目すべき構造・戦略」など、視点が重ならないよう選ぶこと
3. tweet_summaryは、3つのインサイトのうち最も注目度が高いもの1つを選び、40字以内で要約すること（Xへの投稿に使うため、文字数を厳守すること）
4. bodyは「カードを開かせる・続きを読ませる」ための短いフック文であり、detailのような淡々とした分析要約ではない。心理学・行動経済学の知見を意識し、以下を満たすこと:
   - 実データの中から最もインパクトのある対比・数値(急成長率、赤字幅、シェア等)を文頭付近に置き、一瞬で目を引く
   - 「しかし」「一方で」等を使い、意外性・ギャップ(良い面と気になる面のコントラスト)を作る
   - 結論を言い切らず、最後は「その理由は」「その裏にあるのは」等、続き(detail)を読みたくなる余白(オープンループ)を残して終える
   - 断定的な投資助言(「買うべき」「今が買い時」等)や、実データに無い誇張・煽り文句は禁止。あくまで事実ベースで、書き方・見せ方でフックを作ること
   - detailは従来通り、根拠を丁寧に説明する分析文体を維持すること(bodyだけがフック調で良い)
5. appeal_narrativeは、X投稿・マーケットトレンドページ用の「無料で読める客寄せ文」であり、bodyとは全く別の独立した文章として作成すること。600〜800字程度。**この文章の目的は分析ページの内容を要約して伝えることではなく、分析ページを読みたいと思わせることである点に注意し、以下を満たすこと**:
   - これは記事単体として完結した読み物であり、この後に別ページ(分析ページ)へのリンクを添えるだけなので、bodyのように文の途中や「その理由は、」のような言いかけで終えてはならない。必ず主語・述語のそろった文で締めくくり、最後まで書き切ること(ただし後述の通り、文としては完結させつつ、内容としての「答え」までは明かさない)
   - 開示してよい具体的な実データは、最もインパクトのある1〜2点(急成長率や赤字幅、シェア等)に絞ること。財務指標を何点も列挙したり、複数の数値の根拠・背景・要因を詳しく説明したりしないこと(それは有料の分析ページの役割であり、ここで詳しく説明してしまうと分析ページを読む理由が無くなってしまう)
   - 「なぜそうなっているのか」「今後どうなるのか」「投資判断上どう考えるべきか」といった、実際の分析ページの中身にあたる理由・背景・評価は、具体的な答えを書かずに、問いかけのまま読者に投げかけて終えること(例:「その裏には何があるのでしょうか」「これを強みと見るか、懸念と見るかは分かれるところです」等)
   - 600〜800字の分量は、詳しい説明を増やして稼ぐのではなく、読者に語りかける疑問形・問いかけ・共感を誘う一言・想像を促す描写などで確保すること。「〜だと思いませんか」「〜と感じた方も多いのではないでしょうか」「あなたなら、この数字をどう見るでしょうか」等、読み手に語りかける口調を積極的に使ってよい
   - 断定的な投資助言(「買うべき」「今が買い時」等)や、実データに無い誇張・煽り文句は禁止。あくまで事実ベースで、書き方・問いかけでフックを作ること
   - 文字数は600〜800字を目安とし、この範囲に収まるよう最後まで書き切ってから終えること(文字数超過を避けるために文を切り詰めて終えるのではなく、全体の分量を調整すること)

【出力形式】必ず以下の構造のみで完結させること:
{
  "insights": [
    {"title": "インサイトタイトル1（20字以内）", "body": "カード折りたたみ時に見える短いフック文（100字以内）。上記ルール4の書き方で。ですます調", "detail": "カードを開いた時に表示する詳しい解説。200〜350字程度。1文目で結論・要点を端的に述べ、そのあと改行(\\n\\n)を1つ挟んでから、実データの数値を交えた背景・理由の説明、さらに改行(\\n\\n)を挟んで投資判断への影響、という2〜3段落構成にすること。ですます調"},
    {"title": "インサイトタイトル2（20字以内）", "body": "同上（100字以内、ルール4のフック調）。ですます調", "detail": "同上の形式で200〜350字程度。ですます調"},
    {"title": "インサイトタイトル3（20字以内）", "body": "同上（100字以内、ルール4のフック調）。ですます調", "detail": "同上の形式で200〜350字程度。ですます調"}
  ],
  "tweet_summary": "40字以内の要約文（ですます調）",
  "appeal_narrative": "600〜800字程度の客寄せ文。上記ルール5の通り、開示する具体的データは1〜2点に絞り、理由・背景・評価は問いかけのまま残し、文自体は完結させること。ですます調"
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
        // X投稿・マーケットトレンドページ用の紹介文(600〜800字、完結した文章)。
        // 2026/8/29追加。以前はinsights[0].body(analysis画面のカード用の短いフック文、
        // わざと文の途中で終わるオープンループ形式)をそのまま流用していたが、リンク先の
        // 分析ページにその「続き」が実際には存在せず、記事が尻切れに見える問題があったため、
        // 独立した完結する紹介文として分けた。
        appeal_narrative:  r.appeal_narrative ?? "",
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

          // 文章の組み立ては src/lib/ipo-intro-text.ts に共通化してある
          // (過去銘柄向けの管理画面ツールからも同じ文章を組み立てられるようにするため)。
          // 2026/8/29、appeal_narrative(600〜800字の完結した紹介文)を優先的に使うよう変更。
          // 万一AIが省略した場合のみ、従来通りinsights[0].bodyにフォールバックする。
          function buildTweetText(titleLabel: string) {
            const body = summary.appeal_narrative || summary.insights[0].body;
            return buildIpoIntroText(co as any, body, titleLabel);
          }

          const initialText = buildTweetText("新規IPO承認");

          // インフォグラフィック画像を生成(X投稿専用のフック画像。
          // 2026/8/29、スコア+ひとことインサイトの引用文デザインから、
          // STEP3で抽出済みの財務データを使った「売上高の推移」棒グラフ中心のデザインに変更。
          // 失敗しても投稿自体は続行する)
          const chartData = buildRevenueChartData((co as any).structured_data?.key_metrics);
          const hookText = (r.ai_summary || summary.insights[0].body || "").slice(0, 60);
          // 超短期・短期・長期の投資家向けスコア。STEP5(9軸詳細分析)が未実行の場合は
          // co.analysis_axes_short/mid/longがすべて空のため、3つともnullになる
          // (このSTEP4の時点ではSTEP5がまだ実行されていないことが多く、その場合は
          // インフォグラフィック側でこの項目自体を表示しない)。
          const axisScores = computeAxisGroupScores(
            (co as any).analysis_axes_short,
            (co as any).analysis_axes_mid,
            (co as any).analysis_axes_long
          );
          let imageUrl: string | null = null;
          try {
            imageUrl = await createInfographic({
              companyId: co.id,
              companyName: co.name,
              sector: co.sector ?? "",
              grade: summary.grade || "C",
              score: summary.total_score ?? 65,
              chartData,
              hook: hookText,
              axisScores,
            });
          } catch (e: any) {
            console.error("インフォグラフィック生成失敗:", e?.message);
          }

          // 管理画面での確認・過去銘柄分の手動X投稿用にipo_companies側にも保存しておく
          // (サイトの分析ページには表示しない。2026/8/29、表示は行わない方針に変更)
          if (imageUrl) {
            const { error: imgSaveError } = await supabaseAdmin
              .from("ipo_companies")
              .update({ infographic_url: imageUrl })
              .eq("id", co.id);
            if (imgSaveError) {
              console.error("infographic_url保存失敗:", imgSaveError.message);
            }
          }

          // マーケットトレンドページの「新規IPO紹介」カテゴリーに表示するための記事を保存
          // (2026/8/29追加)。文章は当初X投稿用の文章(項目の羅列)をそのまま流用していたが、
          // 「本文はこの銘柄の魅力をコンパクトにまとめた文章にしてほしい」という要望を受け、
          // STEP4のスコア生成時に既に作られているai_summary(トップページ掲載用・120字以内、
          // この銘柄の最大の魅力を核心から語る文章)を流用する形に変更した。
          // (新たにAI呼び出しを増やさずに済むよう、既存の生成物を再利用している)
          // external_idで一意にしているため、同じ銘柄が再分析された場合は
          // insertではなくupsertで上書きする(重複記事にならないように)。
          // 失敗した場合はadmin画面のSTEP4結果表示(xDraftDebug)にも理由を出す
          // (Vercelのログを見られないユーザーでも原因が分かるようにするため)。
          const analysisUrl = `https://ipo.finance-tower.com/analysis/${co.id}`;
          // 本文はX投稿でも使っている「上場日・市場・コード・売上・利益・主幹事+AIの一言」の
          // 詳しい紹介文(initialText)をそのまま使う。2026/8/29、ai_summaryだけの短い文章に
          // 変更したところ「文字数が減って冷たい感じになった」とのフィードバックを受け、
          // Xの競合対策で作った文章に戻し、末尾に分析ページへのリンクを付けた。
          const trendsContent = `${initialText}\n\n${analysisUrl}`;
          let trendsDebug = "";
          try {
            const { error: trendsError } = await supabaseAdmin.from("market_trends").upsert({
              source: "IPO分析システム",
              title: `新規IPO紹介(${co.name})`,
              url: analysisUrl,
              summary: null,
              sector: co.sector || "その他",
              sector_score: 8,
              ai_comment: null,
              is_featured: true,
              is_theme_article: true,
              content: trendsContent,
              image_url: imageUrl,
              source_links: [
                { title: `${co.name}の詳細分析ページ`, url: `https://ipo.finance-tower.com/analysis/${co.id}`, source: "自社分析" },
              ],
              fetched_at: new Date().toISOString(),
              external_id: `new-ipo-intro-${co.id}`,
            }, { onConflict: "external_id" });
            if (trendsError) {
              trendsDebug = `トレンド記事保存失敗: ${trendsError.message}`;
              console.error("market_trends(新規IPO紹介)保存失敗:", trendsError.message);
            }
          } catch (e: any) {
            trendsDebug = `トレンド記事保存エラー: ${e?.message}`;
            console.error("market_trends(新規IPO紹介)保存エラー:", e?.message);
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
          xDraftDebug = (imageUrl ? "success(画像あり)" : "success(画像なし)") + (trendsDebug ? ` / ${trendsDebug}` : "");
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
    // 2026/9/1追加: 週次マーケット地合い・大化けテーマ調査(src/lib/market-snapshot.ts)。
    // scenariosには使わず、超短期の評価(score)とマーケットトレンド紹介文(insights)にのみ渡す。
    const marketNote = (part === "insights" || part === "score")
      ? (await fetchMarketSnapshotContext(supabase)).text
      : "";
    const prompt =
      part === "insights"  ? insightsPrompt(co, dataNote, marketNote) :
      part === "scenarios" ? scenariosPrompt(co, dataNote) :
      scorePrompt(co, dataNote, marketNote);

    const msg = await callClaudeWithRetry(prompt);
    const raw2 = (msg.content[0] as any).text ?? "";
    let parsed = repairJson('{' + raw2);

    if (!parsed) {
      console.warn(`analyze(${part}) parse failed, retrying once...`);
      await sleep(5000);
      try {
        const retryMsg = await claude.messages.create({
          model: "claude-sonnet-4-5",
          max_tokens: 4000,
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