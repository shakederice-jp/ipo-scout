// 2026/10/24新設(束D・⑦): 分析ページの「この銘柄の最新情報」欄のための、新情報の収集と読み出し。
//
// X投稿用の仕組み(x-post-themes.ts のテーマ⑰・上場から180日以内・1回1本)とは別に動く。
//  ・対象: 分析済み(analysis_summaryあり)で、上場前、または上場から365日以内の銘柄
//  ・調べる頻度(上場からの経過で変える。Web検索の件数を抑えるため)
//      上場前と上場後30日以内 … 2日に1回 / 31〜180日 … 7日に1回 / 181〜365日 … 14日に1回
//  ・1回の実行で調べる銘柄数に上限を設け、実行時間の制限に収める
//  ・Claude Haiku のWeb検索で調べ、「出典URLが検索結果に実在するもの」だけを保存する
//    (出典が確認できない情報は載せない)
//  ・決算・増資・株価の急変など、重要な新情報(importance=high)があれば、管理者にメールで知らせ、
//    再分析の検討を促す(分析内容の自動書き換えはしない)
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { notifyAdmin, escapeHtml } from "./notify-admin";

const anthropic = new Anthropic();
const supabase = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const DAY = 24 * 60 * 60 * 1000;
export const MAX_COMPANIES_PER_RUN = 5;
export const TIME_BUDGET_MS = 200 * 1000; // これを過ぎたら、新しい銘柄は調べ始めない

type Company = { id: string; name: string; ticker: string | null; listing_date: string | null };

export type NewsItem = {
  published_on: string;
  headline: string;
  summary: string | null;
  source_name: string | null;
  source_url: string;
  category: string | null;
  importance: "normal" | "high";
};

// ---- 調べる頻度 ----
export function checkIntervalDays(listingDate: string | null, today: string): number {
  if (!listingDate || listingDate >= today) return 2; // 上場前
  const elapsed = Math.floor((new Date(today).getTime() - new Date(listingDate).getTime()) / DAY);
  if (elapsed <= 30) return 2;
  if (elapsed <= 180) return 7;
  return 14;
}

export function todayJst(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

// ---- 今回調べる銘柄を選ぶ ----
export async function pickTargets(limit = MAX_COMPANIES_PER_RUN, onlyId?: string): Promise<(Company & { intervalDays: number })[]> {
  const db = supabase();
  const today = todayJst();
  const from = new Date(Date.now() - 365 * DAY).toISOString().slice(0, 10);

  let q = db.from("ipo_companies").select("id, name, ticker, listing_date").not("analysis_summary", "is", null);
  if (onlyId) q = q.eq("id", onlyId);
  else q = q.gte("listing_date", from);
  const { data: rows, error } = await q;
  if (error || !rows) { console.error("company-news: 銘柄取得失敗", error); return []; }

  const { data: states } = await db.from("company_news_state").select("company_id, last_checked_at");
  const last = new Map<string, number>((states ?? []).map((s: any) => [s.company_id, new Date(s.last_checked_at).getTime()]));

  const now = Date.now();
  const due = (rows as Company[])
    .map((c) => {
      const intervalDays = checkIntervalDays(c.listing_date, today);
      const lastAt = last.get(c.id) ?? 0;
      const overdue = (now - lastAt) / DAY - intervalDays; // 0以上なら期限到来
      return { ...c, intervalDays, overdue, lastAt };
    })
    .filter((c) => onlyId ? true : c.overdue >= 0)
    // 期限を過ぎた日数が大きい順(調べたことがない銘柄が先頭になる)
    .sort((a, b) => b.overdue - a.overdue);
  return due.slice(0, limit);
}

// ---- 調査 ----
const BANNED = /確実|必ず|絶対|未定|不明|おすすめ|買い時|売り時|儲かる/;

function buildQuery(c: Company, today: string): string {
  const pre = !c.listing_date || c.listing_date >= today;
  const name = `${c.name}${c.ticker ? `（証券コード${c.ticker}）` : ""}`;
  const focus = pre
    ? "仮条件・ブックビルディング日程・公募価格の決定・主幹事証券・上場日の変更・目論見書の訂正など、上場前の動き"
    : "決算発表・業績予想の修正・増資や自社株買い・大株主の動き・IR発表・株価の大きな変動の理由など、上場後の動き";
  return `${name}（上場日 ${c.listing_date ?? "未登録"}）について、直近2週間ほどの${focus}をWeb検索で調べてください。
今日は${today}です。

# 出力のルール
- 出力はJSONの配列だけにする（前置き・説明・コードブロック記号は書かない）
- 要素の形: {"date":"YYYY-MM-DD","headline":"見出し","summary":"要点","source_name":"出典名","source_url":"出典のURL","category":"上場前の動き|決算・業績|資本政策|株価|その他","important":true または false}
- 検索で実際に読めたページに書かれている事実だけを書く。憶測は書かない。source_urlは、そのページのURLをそのまま入れる
- 見出しと要点は、事実を淡々と書く。売買の助言や評価はしない。1文は短く、読点（、）は1つまでにする
- 「確実」「必ず」「絶対」「未定」「不明」などの語は使わない
- 決算・業績予想の修正・増資・株式分割・株価の急変など、投資家の判断に大きく影響する内容だけ important を true にする
- 新しい情報が無ければ [] だけを返す。最大5件`;
}

function normalizeUrl(u: string): string {
  try {
    const x = new URL(u);
    x.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((k) => x.searchParams.delete(k));
    return x.toString().replace(/\/$/, "");
  } catch { return u.trim(); }
}

export async function researchCompany(c: Company): Promise<NewsItem[]> {
  const today = todayJst();
  const res = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 2500,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 } as any],
    messages: [{ role: "user", content: buildQuery(c, today) }],
  });

  // 検索で実際に取得できたURLの一覧(出典の実在確認に使う)
  const seen = new Set<string>();
  for (const b of res.content as any[]) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const r of b.content) if (r?.url) seen.add(normalizeUrl(r.url));
    }
  }
  const text = (res.content as any[]).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  let arr: any[] = [];
  try { arr = JSON.parse(m[0]); } catch { return []; }
  if (!Array.isArray(arr)) return [];

  const out: NewsItem[] = [];
  for (const it of arr.slice(0, 5)) {
    const url = typeof it?.source_url === "string" ? it.source_url.trim() : "";
    const headline = typeof it?.headline === "string" ? it.headline.trim() : "";
    const date = typeof it?.date === "string" ? it.date.slice(0, 10) : "";
    if (!url || !headline || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!/^https?:\/\//.test(url)) continue;
    if (!seen.has(normalizeUrl(url))) continue; // 検索結果に無い出典は載せない
    if (date > today) continue;
    const summary = typeof it?.summary === "string" ? it.summary.trim() : null;
    if (BANNED.test(headline) || (summary && BANNED.test(summary))) continue;
    out.push({
      published_on: date,
      headline: headline.slice(0, 120),
      summary: summary ? summary.slice(0, 240) : null,
      source_name: typeof it?.source_name === "string" ? it.source_name.trim().slice(0, 60) : null,
      source_url: url,
      category: typeof it?.category === "string" ? it.category.slice(0, 20) : null,
      importance: it?.important === true ? "high" : "normal",
    });
  }
  return out;
}

// ---- 保存 ----
export async function saveNews(companyId: string, items: NewsItem[]): Promise<NewsItem[]> {
  if (items.length === 0) return [];
  const db = supabase();
  const added: NewsItem[] = [];
  for (const it of items) {
    const key = normalizeUrl(it.source_url);
    const { data, error } = await db
      .from("company_news")
      .upsert(
        { company_id: companyId, ...it, dedupe_key: key },
        { onConflict: "company_id,dedupe_key", ignoreDuplicates: true }
      )
      .select("id");
    if (error) { console.error("company-news: 保存失敗", error); continue; }
    if (data && data.length > 0) added.push(it); // 新しく入ったものだけ
  }
  return added;
}

export type RunReport = { checked: { name: string; found: number; added: number; error?: string }[]; highImportance: { name: string; items: NewsItem[]; id: string }[] };

export async function runCompanyNews(opts: { limit?: number; onlyId?: string; dry?: boolean } = {}): Promise<RunReport & { targets: string[] }> {
  const started = Date.now();
  const targets = await pickTargets(opts.limit ?? MAX_COMPANIES_PER_RUN, opts.onlyId);
  const report: RunReport & { targets: string[] } = { checked: [], highImportance: [], targets: targets.map((t) => `${t.name}（${t.intervalDays}日ごと）`) };
  if (opts.dry) return report;

  const db = supabase();
  for (const c of targets) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    try {
      const items = await researchCompany(c);
      const added = await saveNews(c.id, items);
      await db.from("company_news_state").upsert({ company_id: c.id, last_checked_at: new Date().toISOString() });
      report.checked.push({ name: c.name, found: items.length, added: added.length });
      const high = added.filter((a) => a.importance === "high");
      if (high.length > 0) report.highImportance.push({ name: c.name, id: c.id, items: high });
    } catch (e: any) {
      console.error(`company-news: 調査失敗(${c.name})`, e);
      // 失敗した銘柄は、1日後にもう一度調べる
      const retryAt = new Date(Date.now() - (c.intervalDays - 1) * DAY).toISOString();
      await db.from("company_news_state").upsert({ company_id: c.id, last_checked_at: retryAt });
      report.checked.push({ name: c.name, found: 0, added: 0, error: String(e?.message ?? e).slice(0, 120) });
    }
  }

  // 重要な新情報があれば、管理者に再分析の検討を促すメールを送る(分析内容は自動では書き換えない)
  if (report.highImportance.length > 0) {
    const body = report.highImportance
      .map((h) =>
        `■ ${escapeHtml(h.name)}\n` +
        h.items.map((i) => `  ・${i.published_on} ${escapeHtml(i.headline)}\n    ${escapeHtml(i.source_url)}`).join("\n") +
        `\n  分析ページ: https://ipo.finance-tower.com/analysis/${h.id}`
      )
      .join("\n\n");
    await notifyAdmin("重要な新情報あり（再分析の検討）", `分析ページの「最新情報」欄に、決算・増資・株価の急変などの新情報が追加されました。分析内容の見直しが必要かご確認ください。\n\n${body}`, "warn");
  }
  return report;
}

// ---- 分析ページ用の読み出し ----
export type LatestNewsEntry = {
  key: string;
  date: string;       // YYYY-MM-DD
  headline: string;
  summary: string | null;
  sourceName: string | null;
  href: string;       // 出典URL(外部) または /trends/<id>(内部)
  internal: boolean;
  category: string | null;
};

export async function getLatestNews(companyId: string, limit = 5): Promise<LatestNewsEntry[]> {
  const db = supabase();
  const since = new Date(Date.now() - 365 * DAY).toISOString().slice(0, 10);
  const [{ data: news }, { data: trends }] = await Promise.all([
    db.from("company_news").select("id, published_on, headline, summary, source_name, source_url, category")
      .eq("company_id", companyId).gte("published_on", since).order("published_on", { ascending: false }).limit(limit),
    db.from("market_trends").select("id, fetched_at, external_id")
      .like("external_id", `recent-ipo-news-${companyId}-%`).order("fetched_at", { ascending: false }).limit(2),
  ]);
  const list: LatestNewsEntry[] = [
    ...(news ?? []).map((n: any) => ({
      key: `n-${n.id}`, date: n.published_on, headline: n.headline, summary: n.summary,
      sourceName: n.source_name, href: n.source_url, internal: false, category: n.category,
    })),
    ...(trends ?? []).map((t: any) => ({
      key: `t-${t.id}`, date: String(t.fetched_at).slice(0, 10), headline: "マーケットトレンドで新情報の記事を公開しました",
      summary: null, sourceName: "大手町調査室九課", href: `/trends/${t.id}`, internal: true, category: "記事",
    })),
  ];
  return list.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}
