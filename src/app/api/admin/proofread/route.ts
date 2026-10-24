export const maxDuration = 120;
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { generateJsonWithGemini } from "@/lib/gemini";
import { collectFields, applyFields } from "@/lib/proofread";

// 2026/10/24新設(日本版): 日本語の分析文を、原文(有価証券届出書・目論見書)と照らし合わせて校正する。
//   action=check : Gemini(別会社のAI)が、間違い・根拠のない数字の候補を挙げる
//   action=fix   : Sonnetが原文を読み直し、本当に間違いのときだけ該当箇所を書き直す
//   action=load  : 「校正だけやり直す」ボタン用。保存済みの分析文を取り出す(scope: summary / ultra_short / short / long)
//   action=save  : 「校正だけやり直す」ボタン用。直した文章を保存する
// /api/admin/... は proxy.ts の門番を通るため、管理画面にログインした人だけが呼べる。
// 米国版(ipo-scout-us)の仕組みを、日本語の原文向けに作り直したもの。

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const SONNET_MODEL = "claude-sonnet-5-5";
let thinkingControlWorks = true;

type Issue = { field: string; quote: string; kind: string; problem: string; source_quote?: string };

// 日本語の原文は、同じ文字数でもAIにとって重い(時間・料金に響く)ため、AIに渡す原文は4万5千文字までに絞る。
// 照合に重要な部分(経営指標・株主・売出し・ロックアップ・資金使途)を先に入れ、残りで埋める。
const SOURCE_LIMIT = 45000;
const SECTION_LIMIT = 6000;
const PRIORITY_SECTIONS = ["主要経営指標", "株主構成", "売出し情報", "ロックアップ", "株式分布", "資金使途", "経営陣", "事業の概況", "リスク要因"];

const AXIS_COLUMN: Record<string, string> = { ultra_short: "analysis_axes_short", short: "analysis_axes_mid", long: "analysis_axes_long" };

function supa() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function sourceOf(co: any): string {
  const s = (co.raw_prospectus ?? {}) as Record<string, string>;
  const keys = [...PRIORITY_SECTIONS.filter(k => k in s), ...Object.keys(s).filter(k => !PRIORITY_SECTIONS.includes(k))];
  let out = "";
  for (const k of keys) {
    const block = `【${k}】\n${String(s[k] ?? "").slice(0, SECTION_LIMIT)}\n\n`;
    if (out.length + block.length > SOURCE_LIMIT) { out += block.slice(0, Math.max(0, SOURCE_LIMIT - out.length)); break; }
    out += block;
  }
  return out;
}

function factsOf(co: any): string {
  const sched = [
    `上場予定日: ${co.listing_date ?? "未定"}`,
    `ロックアップ解除日(90日): ${co.lockup_90_date ?? "記載なし"}`,
    `ロックアップ解除日(180日): ${co.lockup_180_date ?? "記載なし"}`,
    `公募価格・想定価格: ${co.ipo_price ?? "未定"}`,
    `仮条件: ${co.price_range_min ?? "未定"}〜${co.price_range_max ?? "未定"}`,
  ].join("\n");
  const sd = co.structured_data ? JSON.stringify(co.structured_data).slice(0, 7000) : "";
  // STEP2で集めた市場・競合情報(競合の社名・業界PERなど)も、分析文の根拠として使われている
  const mk = co.analysis_market ? `\n【市場・競合情報(STEP2で収集)】${JSON.stringify(co.analysis_market).slice(0, 3000)}` : "";
  return `${sched}\n${sd}${mk}`;
}

const norm = (t: string) => t.toLowerCase().replace(/[‘’“”"'`]/g, "").replace(/[‐-―−-]/g, "-").replace(/\s+/g, " ");

// 日本語側の数字が、原文や整理済みデータのどこにも無いものを、Geminiへのヒントとして拾う(機械チェック)
// ※「1,234,567千円」→「約12億円」のような単位換算では一致しないので、あくまで候補として扱う
function numberHints(fields: Record<string, string>, haystackRaw: string): string[] {
  const hay = haystackRaw.replace(/(\d),(?=\d{3})/g, "$1");
  const hints: string[] = [];
  const re = /(\d[\d,]*(?:\.\d+)?)\s*(%|％|日|か月|ヶ月|ヵ月|カ月|年|倍|百万円|千円|万円|億円|円|万株|千株|株|名|社)?/g;
  for (const [field, text] of Object.entries(fields)) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const core = m[1].replace(/,/g, "");
      if (core.length <= 1 && !m[2]) continue;
      if (/^\d{1,2}$/.test(core) && !m[2]) continue;
      if (!hay.includes(core)) hints.push(`${field}: 「${m[0].trim()}」`);
      if (hints.length >= 40) return hints;
    }
  }
  return hints;
}

// 文章の書き方ルール(日本版の他のAI生成と同じ方針。書き直した文にも守らせる)
const STYLE_NOTE = `
【書き直す文の書き方】
- 文末は「ですます調」。
- 読点「、」は1文につき1回まで。2回以上必要なときは、文を分ける。1文は短く(目安60字以内)。
- 項目を並べるときは、「、」を連ねず「・」でつなぐ。
- 資料(原文・整理済みデータ)に書かれている数字・事実だけを使う。
- 煽る表現や、値上がりを断定する表現は使わない。`;

function checkPrompt(co: any, fields: Record<string, string>, source: string, facts: string, hints: string[], ignore: Issue[]) {
  const list = Object.entries(fields).map(([k, v]) => `[${k}]\n${v}`).join("\n\n");
  return `あなたは、有価証券届出書・目論見書(日本のIPOの提出書類)の原文と、日本語の分析文を照らし合わせる校閲者です。
${co.name}のIPOについて書かれた分析文に、原文と食い違う記述がないかを確認してください。

【見つけてほしいもの】
- contradiction: 原文や整理済みデータと明らかに食い違う数字・日付・期間・名称・条件(例:原文は180日なのに90日と書いてある)。金額の単位の取り違え(千円と百万円、億円など)も含む
- unsupported: 原文にも整理済みデータにも根拠が見当たらない、具体的な数字・固有名詞・事実(作り話の疑いがあるもの)
- overstated: 「確実」「必ず」「絶対」「業界No.1」など、利益の保証や断定にあたる言い過ぎ

【見つけなくてよいもの】
- 見通し・評価・意見(「〜と考えられます」など)。数字や事実が間違っていなければ指摘しない
- 原文の抜粋に載っていないだけで、数字や固有名詞の誤りと言えないもの
- 言い回しや読みやすさ(文体の好みは指摘しない)
- この銘柄についての事実の主張ではない、一般的な説明・投資のやり方の助言(例:「ロックアップ解除後は売りが出やすい」)
- 日程(上場予定日・ロックアップ解除日)は【整理済みデータ・日程】にあるものが正しい
- 原文の数字を、単位をそろえたり四捨五入したりして書き直した値(例:1,234,567千円→約12億円、「約」を付けた概数)。換算が合っていれば指摘しない。換算結果が違うときだけ contradiction とする
- 原文や整理済みデータの数字から計算できる値(時価総額＝株価×株数、比率、合計など)は、計算が合っていれば指摘しない。計算結果が違うときだけ contradiction とする
- 競合企業の名前・業界PER・主幹事など、【整理済みデータ・日程】の「市場・競合情報」にあるものは、根拠があるものとして扱う
- フック文(insights.*.body)は、続きを読ませるために文を言い切らずに終えることがある。それ自体は誤りではない。数字や事実の誤りだけを指摘する
- 原文の抜粋は一部だけなので、「抜粋にない」だけでは unsupported にしない。具体的な数字や固有名詞が、抜粋・整理済みデータのどちらにも見当たらず、作り話の疑いが強いときだけ指摘する
指摘は、確信があるものに絞り、迷うものは含めないでください。

【原文(目論見書の抜粋)】
${source}

【整理済みデータ・日程(原文から作成済み。参考)】
${facts}

【機械チェックの参考(分析文側の数字で、原文に同じ数字が見つからなかったもの。単位換算や言い換えの可能性もあるので、候補として扱う)】
${hints.length ? hints.join("\n") : "なし"}

【編集者が原文を確認し、問題なしと判断した箇所(再び指摘しないこと)】
${ignore.length ? ignore.map(i => `[${i.field}]「${i.quote}」`).join("\n") : "なし"}

【確認する分析文】
${list}

【出力形式】JSONのみ。指摘がなければ {"issues": []} とすること:
{"issues":[{"field":"上の[ ]内のキー名そのまま","quote":"その文章の中の、問題のある部分をそのまま抜き出したもの(60字以内・一字一句同じ)","kind":"contradiction / unsupported / overstated のいずれか","problem":"何が問題か。60字以内の日本語","source_quote":"根拠となる原文を、そのまま引用(contradictionのときは必須。短く)"}]}`;
}

async function callSonnet(prompt: string): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const params: any = { model: SONNET_MODEL, max_tokens: 4000, messages: [{ role: "user", content: prompt }] };
      if (thinkingControlWorks) params.thinking = { type: "between_tools" };
      const msg: any = await claude.messages.create(params);
      const blocks = Array.isArray(msg?.content) ? msg.content : [];
      return blocks.filter((b: any) => b?.type === "text").map((b: any) => b.text ?? "").join("");
    } catch (e: any) {
      if (/thinking/i.test(String(e?.message ?? ""))) { thinkingControlWorks = false; continue; }
      throw e;
    }
  }
  throw new Error("Sonnet呼び出しに失敗しました");
}

function parseJson(text: string): any {
  const i = text.indexOf("{"), j = text.lastIndexOf("}");
  if (i === -1 || j <= i) return null;
  try { return JSON.parse(text.slice(i, j + 1)); } catch { return null; }
}

// Sonnetが示した原文の引用が、本当に原文にあるかを確かめる(日本語版)。
//  まず、そのままの形で原文にあるかを見る。表の崩れや改行の違いで見つからないときは、
//  引用の中の数字がすべて原文にあり、かつ、引用の文字の8割以上が原文の中に出てくることを条件にする。
function evidenceFound(evidence: string, source: string): boolean {
  const s = norm(source).replace(/\s+/g, "");
  const parts = evidence.split(/\.\.\.|…/).map(p => norm(p).replace(/\s+/g, "")).filter(p => p.length >= 6);
  if (parts.length === 0) return false;
  if (parts.every(p => s.includes(p))) return true;
  const sNum = s.replace(/(\d),(?=\d{3})/g, "$1");
  const ev = norm(evidence).replace(/\s+/g, "").replace(/(\d),(?=\d{3})/g, "$1");
  if (ev.length < 8) return false;
  const nums = ev.match(/\d+(?:\.\d+)?/g) ?? [];
  if (!nums.every(n => sNum.includes(n))) return false;
  // 3文字ずつの並びが、原文にどれだけ出てくるか
  let total = 0, hit = 0;
  for (let i = 0; i + 3 <= ev.length; i++) { total++; if (sNum.includes(ev.slice(i, i + 3))) hit++; }
  return total > 0 && hit / total >= 0.8;
}

// 問題の箇所(quote)を含む「1文」の範囲を返す(。や改行で区切る)
function sentenceRange(text: string, quote: string): [number, number] | null {
  const idx = text.indexOf(quote);
  if (idx < 0) return null;
  let start = 0;
  for (let i = idx - 1; i >= 0; i--) { if (text[i] === "。" || text[i] === "\n") { start = i + 1; break; } }
  let end = text.length;
  for (let i = idx + quote.length - 1; i < text.length; i++) {
    if (text[i] === "。") { end = i + 1; break; }
    if (text[i] === "\n") { end = i; break; }
  }
  return [start, end];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const { company_id, action } = body;
    const fields: Record<string, string> = body.fields && typeof body.fields === "object" ? body.fields : {};
    if (!company_id || !action) return NextResponse.json({ error: "company_id と action が必要です" }, { status: 400 });

    const { data: co } = await supa().from("ipo_companies").select("*").eq("id", company_id).single();
    if (!co) return NextResponse.json({ error: "企業が見つかりません" }, { status: 404 });

    // ===== 「校正だけやり直す」用: 保存済みの分析文を取り出す =====
    if (action === "load") {
      const scope = String(body.scope ?? "");
      if (scope === "summary") {
        return NextResponse.json({ fields: collectFields(co.analysis_summary ?? {}) });
      }
      const col = AXIS_COLUMN[scope];
      if (!col) return NextResponse.json({ error: "scope が不正です" }, { status: 400 });
      const items = Object.values((co as any)[col] ?? {}) as any[];
      const out: Record<string, string> = {};
      items.forEach((a, i) => { if (typeof a?.report === "string" && a.report.trim()) out[`axis${i}`] = a.report; });
      return NextResponse.json({ fields: out });
    }

    // ===== 「校正だけやり直す」用: 直した文章を保存する =====
    if (action === "save") {
      const scope = String(body.scope ?? "");
      if (scope === "summary") {
        const summary = JSON.parse(JSON.stringify(co.analysis_summary ?? {}));
        applyFields(summary, fields);
        const detail = JSON.parse(JSON.stringify(co.analysis_detail ?? {}));
        applyFields(detail, fields);
        const upd: any = { analysis_summary: summary, analysis_detail: detail };
        if (typeof fields.ai_summary === "string") upd.ai_summary = fields.ai_summary;
        const { error } = await supa().from("ipo_companies").update(upd).eq("id", company_id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
      }
      const col = AXIS_COLUMN[scope];
      if (!col) return NextResponse.json({ error: "scope が不正です" }, { status: 400 });
      const obj = JSON.parse(JSON.stringify((co as any)[col] ?? {}));
      const ids = Object.keys(obj);
      ids.forEach((id, i) => { if (typeof fields[`axis${i}`] === "string") obj[id].report = fields[`axis${i}`]; });
      const detail = JSON.parse(JSON.stringify(co.analysis_detail ?? {}));
      const axes = detail.axes ?? { ultra_short: [], short: [], long: [] };
      axes[scope] = Object.values(obj);
      const { error } = await supa().from("ipo_companies").update({ [col]: obj, analysis_detail: { ...detail, axes } }).eq("id", company_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    const source = sourceOf(co);
    if (!source) return NextResponse.json({ error: "原文(raw_prospectus)がないため照合できません" }, { status: 400 });
    const facts = factsOf(co);

    // ===== Geminiによる照合 =====
    if (action === "check") {
      const hints = numberHints(fields, source + "\n" + facts);
      const ignore: Issue[] = (Array.isArray(body.ignore) ? body.ignore : []).filter((i: any) => i && typeof i.field === "string" && typeof i.quote === "string").slice(0, 40);
      const out = await generateJsonWithGemini(checkPrompt(co, fields, source, facts, hints, ignore));
      const raw: any[] = Array.isArray(out?.issues) ? out.issues : [];
      const issues: Issue[] = raw
        .filter(i => i && typeof i.field === "string" && typeof i.quote === "string" && typeof fields[i.field] === "string" && fields[i.field].includes(i.quote))
        .map(i => ({ field: i.field, quote: i.quote, kind: String(i.kind ?? ""), problem: String(i.problem ?? "").slice(0, 120), source_quote: typeof i.source_quote === "string" ? i.source_quote.slice(0, 400) : undefined }))
        .slice(0, 20);
      return NextResponse.json({ issues, hints: hints.length });
    }

    // ===== Sonnetによる再確認と書き直し =====
    if (action === "fix") {
      const issues: Issue[] = (Array.isArray(body.issues) ? body.issues : []).slice(0, 20);
      const round = Number(body.round) || 1;
      const finalRound = !!body.final; // 最後の回は、確認できないものは削る・ぼかす方向で必ず決着させる
      const force = !!body.force;      // 強制決着: keep以外で直せなかったものは、その文を削除して必ず終わらせる
      if (issues.length === 0) return NextResponse.json({ results: [], fields, applied: 0 });
      const ranges = issues.map(i => (typeof fields[i.field] === "string" ? sentenceRange(fields[i.field], i.quote) : null));
      const list = issues.map((i, n) => {
        const r = ranges[n];
        const sentence = r ? fields[i.field].slice(r[0], r[1]) : i.quote;
        return `#${n}\n場所: ${i.field}\n問題の文: ${sentence}\n問題の箇所: 「${i.quote}」\n指摘の種類: ${i.kind}\n指摘内容: ${i.problem}\n指摘側が示した原文: ${i.source_quote ?? "なし"}`;
      }).join("\n\n");
      const prompt = `あなたは日本のIPOの分析記事の編集者です。校閲者(別のAI)が、分析文に誤りがあると指摘しました(今回は${round}回目の見直しです)。
校閲者も間違えることがあります。指摘を鵜呑みにせず、必ず【原文】を自分で読み直して、本当に誤りかを判断してください。

【判断のルール】
- verdict は次の4つから選ぶ:
  fix    = 原文と食い違っている。原文の根拠を引用したうえで、問題の文を正しく書き直す
  soften = 原文に根拠が見つからない数字・断定・言い過ぎ。根拠がある範囲の言い方に直す(数字を削る、「〜と考えられます」にする等)
  remove = 書き直しても根拠を示せない。その文は、なくても全体の意味が通るので削除する
  keep   = 指摘は誤りで、元の文章が原文と合っている。書き直さない
- fix のときは source_evidence に、根拠となる原文の記述を、そのまま引用すること(引用できないなら fix にしない)
- new_sentence は「問題の文」全体と置き換える、新しい1文(または数文)。前後の文章とつながるように書き、元の長さを大きく超えないこと。keep・remove のときは空文字
- 場所が insights.*.body のとき(フック文)は、続きを読ませるために文を言い切らずに終える形式を保つこと。数字や事実の誤りだけを直す
- 原文に書かれていない数字や事実を、新しく作らない。原文の単位(千円・百万円など)を取り違えない。億円などに換算するときは、計算し直して確かめる
- この銘柄についての事実の主張ではなく、一般的な説明や「〜を確認しましょう」という投資のやり方の助言になっている文は、原文との食い違いではない。keep とする
- 原文の数字を、単位換算や四捨五入で書き直した値は、換算が合っていれば keep とする
- 計算で出した数字(時価総額＝株価×株数、比率、合計など)は、元の数字から計算し直して確かめる。合っていれば keep、違っていれば fix で直す
${finalRound || force ? "- これが最後の見直しです。原文で確認できないものを残さないこと。確信をもって keep と言えるもの以外は、soften か remove で決着させる" : ""}
${STYLE_NOTE}

【原文(目論見書の抜粋)】
${source}

【整理済みデータ・日程(参考)】
${facts}

【指摘の一覧】
${list}

【出力形式】JSONのみ(前置き・コードブロック不要):
{"results":[{"index":0,"verdict":"fix / soften / remove / keep","new_sentence":"置き換える文(keep・removeなら空文字)","source_evidence":"原文の引用(fixのとき必須)","reason":"判断の理由。40字以内"}]}`;
      const text = await callSonnet(prompt);
      const parsed = parseJson(text);
      const rs: any[] = Array.isArray(parsed?.results) ? parsed.results : [];
      const updated = { ...fields };
      let applied = 0;
      const results = issues.map((issue, n) => {
        const r = rs.find(x => Number(x?.index) === n);
        let verdict: string = ["fix", "soften", "remove", "keep"].includes(r?.verdict) ? r.verdict : "unclear";
        const newSentence = typeof r?.new_sentence === "string" ? r.new_sentence.trim() : "";
        let didApply = false;
        // fixは、原文の引用が確認できたときだけ有効。確認できなければ unclear 扱いにして、数字を使わない書き方に落とす
        if (verdict === "fix" && !evidenceFound(String(r?.source_evidence ?? ""), source)) verdict = "unclear";
        const cur = updated[issue.field];
        const range = typeof cur === "string" ? sentenceRange(cur, issue.quote) : null;
        if (range && typeof cur === "string") {
          const oldSentence = cur.slice(range[0], range[1]);
          if ((verdict === "fix" || verdict === "soften") && newSentence && newSentence.length <= oldSentence.length * 1.5 + 40) {
            updated[issue.field] = cur.slice(0, range[0]) + newSentence + cur.slice(range[1]);
            didApply = true;
          } else if (verdict === "remove") {
            updated[issue.field] = (cur.slice(0, range[0]) + cur.slice(range[1])).replace(/\n{3,}/g, "\n\n");
            didApply = true;
          }
        }
        // 強制決着: keep以外で直せなかったものは、その文を削除する(誤った記述を残さない)
        if (force && !didApply && verdict !== "keep" && range && typeof cur === "string") {
          const now = updated[issue.field];
          const r2 = sentenceRange(now, issue.quote);
          if (r2) {
            updated[issue.field] = (now.slice(0, r2[0]) + now.slice(r2[1])).replace(/\n{3,}/g, "\n\n");
            didApply = true;
            verdict = "remove";
          }
        }
        if (didApply) applied++;
        const oldS = range && typeof cur === "string" ? cur.slice(range[0], range[1]) : issue.quote;
        const newS = verdict === "remove" ? "" : (didApply ? newSentence : "");
        return { issue, verdict, applied: didApply, reason: String(r?.reason ?? "").slice(0, 80), before: oldS, after: newS };
      });
      return NextResponse.json({ results, fields: updated, applied });
    }

    return NextResponse.json({ error: "action が不正です" }, { status: 400 });
  } catch (e: any) {
    console.error("proofread error:", e?.message);
    return NextResponse.json({ error: String(e?.message ?? "unknown").slice(0, 200) }, { status: 500 });
  }
}
