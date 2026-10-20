// 2026/10/20新設(「時間のない資産層」向け施策・案2): 週刊ブリーフ「IPO週報」(毎週金曜18時)のデータ取得とメール本文づくり。
//
// ・数字・日付・社名は、すべてDB(ipo_companies)の値をコードでそのまま差し込む。AIには文章を書かせない
//   (正確さを優先。AIの文章生成を使わないので、配信のたびの費用もかからない)。
// ・「今週の3つの要点」も、件数・社名・公募価格比などから、コードで組み立てる。
// ・無料会員には要点(スケジュール・初値の結果・注目銘柄の評価と要約1文)を、
//   有料会員には、それに加えて注目銘柄の「注目点」も載せる。
//   (有料会員向けの詳細版PDFスライドは、別途作成。作成後に、このメールにリンクを足す)
// ・売買の助言にならないよう、「参考」「判断はご自身で」の注記を付ける。
import { todayJst, shortDate, yen, pctText } from "@/lib/jp-format";

const SITE_URL = "https://ipo.finance-tower.com";

export interface BriefCompany {
  id: string;
  name: string;
  ticker: string | null;
  listing_date: string | null;
  listing_date_confirmed: boolean | null;
  bb_start_date: string | null;
  apply_start_date: string | null;
  lockup_90_date: string | null;
  lockup_180_date: string | null;
  ipo_price: number | null;
  initial_price: number | null;
  price_change_rate: number | null;
  analysis_summary: any;
}

export interface BriefEvent {
  date: string;
  label: string;
  color: string;
  company: BriefCompany;
}

export interface BriefData {
  today: string;
  thisMon: string;
  thisFri: string;
  nextMon: string;
  nextSun: string;
  results: BriefCompany[];      // 今週に上場し、初値が付いた銘柄
  events: BriefEvent[];         // 来週(月〜日)の予定(日付順)
  featured: BriefCompany | null; // 来週の注目銘柄
  points: string[];             // 今週の要点(最大3つ)
}

const GRADE_ORDER: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, E: 1 };
const GRADE_COLOR: Record<string, string> = { A: "#15803d", B: "#0369a1", C: "#d97706", D: "#dc2626", E: "#7c3aed" };
const GRADE_BG: Record<string, string> = { A: "#dcfce7", B: "#dbeafe", C: "#fef3c7", D: "#fee2e2", E: "#ede9fe" };
const GRADE_LABEL: Record<string, string> = { A: "強気", B: "やや強気", C: "中立", D: "やや弱気", E: "弱気" };

const SELECT_FIELDS =
  "id,name,ticker,listing_date,listing_date_confirmed,bb_start_date,apply_start_date,lockup_90_date,lockup_180_date,ipo_price,initial_price,price_change_rate,analysis_summary";

export const esc = (t: unknown): string =>
  String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// 文章の1文目だけを取り出す(強調記号は外す)
function firstSentence(text: unknown, max = 90): string {
  const t = String(text ?? "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const i = t.indexOf("。");
  const s = i >= 0 ? t.slice(0, i + 1) : t;
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export async function loadBriefData(supabase: any): Promise<BriefData> {
  const today = todayJst();
  const dow = new Date(today + "T00:00:00Z").getUTCDay(); // 0=日
  const thisMon = addDays(today, -((dow + 6) % 7));
  const thisFri = addDays(thisMon, 4);
  const nextMon = addDays(thisMon, 7);
  const nextSun = addDays(thisMon, 13);

  const q = (col: string, from: string, to: string) =>
    supabase.from("ipo_companies").select(SELECT_FIELDS).gte(col, from).lte(col, to);

  const [listed, listing, bb, apply, l90, l180] = await Promise.all([
    q("listing_date", thisMon, today),
    q("listing_date", nextMon, nextSun),
    q("bb_start_date", nextMon, nextSun),
    q("apply_start_date", nextMon, nextSun),
    q("lockup_90_date", nextMon, nextSun),
    q("lockup_180_date", nextMon, nextSun),
  ]);

  const results: BriefCompany[] = ((listed.data ?? []) as BriefCompany[])
    .filter((c) => c.initial_price != null)
    .sort((a, b) => String(a.listing_date).localeCompare(String(b.listing_date)));

  const events: BriefEvent[] = [];
  const push = (list: BriefCompany[] | null, key: keyof BriefCompany, label: string, color: string) =>
    (list ?? []).forEach((c) => { const d = c[key] as string | null; if (d) events.push({ date: d, label, color, company: c }); });
  push(listing.data, "listing_date", "上場日", "#15803d");
  push(bb.data, "bb_start_date", "BB開始", "#0369a1");
  push(apply.data, "apply_start_date", "申込開始", "#d97706");
  push(l90.data, "lockup_90_date", "ロックアップ解除(90日)", "#7c3aed");
  push(l180.data, "lockup_180_date", "ロックアップ解除(180日)", "#7c3aed");
  events.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));

  // 注目銘柄: 来週の上場・BB開始・申込開始の銘柄のうち、AI評価の高い銘柄(同じなら日付が早い方)
  const core = events.filter((e) => ["上場日", "BB開始", "申込開始"].includes(e.label));
  let featured: BriefCompany | null = null;
  let best = -1;
  for (const e of core) {
    const g = GRADE_ORDER[e.company.analysis_summary?.grade ?? ""] ?? 0;
    if (g > best) { best = g; featured = e.company; }
  }

  // 今週の要点(件数・社名・公募価格比から、コードで作る)
  const names = (list: BriefCompany[], n = 3) => {
    const nm = list.slice(0, n).map((c) => c.name).join("・");
    return list.length > n ? `${nm}ほか` : nm;
  };
  const points: string[] = [];
  const nextListing = (listing.data ?? []) as BriefCompany[];
  if (nextListing.length > 0) {
    points.push(`来週に上場する銘柄は${nextListing.length}社です。${names(nextListing)}が予定されています。`);
  }
  const nBb = (bb.data ?? []).length, nApply = (apply.data ?? []).length;
  if (nBb + nApply > 0) {
    points.push(`来週にブックビルディングが始まる銘柄は${nBb}社で、申込が始まる銘柄は${nApply}社です。`);
  }
  const priced = results.filter((c) => c.ipo_price != null && c.initial_price != null);
  if (priced.length > 0) {
    const up = priced.filter((c) => (c.initial_price as number) > (c.ipo_price as number)).length;
    points.push(`今週に初値が付いた銘柄は${priced.length}社で、公募価格を上回ったのは${up}社でした。`);
  }
  const nLock = (l90.data ?? []).length + (l180.data ?? []).length;
  if (nLock > 0 && points.length < 3) {
    points.push(`来週にロックアップが解除される銘柄は${nLock}社です。解除後は売りが出やすくなる点に注意が必要です。`);
  }

  return { today, thisMon, thisFri, nextMon, nextSun, results, events, featured, points: points.slice(0, 3) };
}

// 送る内容があるか(要点も予定も無い週は、メールを送らない)
export function hasBriefContent(d: BriefData): boolean {
  return d.points.length > 0 || d.events.length > 0 || d.results.length > 0;
}

export function briefSubject(d: BriefData): string {
  return `【IPO週報】来週（${shortDate(d.nextMon)}〜${shortDate(d.nextSun)}）のIPO予定と、今週の振り返り`;
}

const slug = (c: BriefCompany) => c.ticker || c.id;
const hasAnalysis = (c: BriefCompany) => !!c.analysis_summary;

function companyLink(c: BriefCompany): string {
  const label = `<strong>${esc(c.name)}</strong>${c.ticker ? `<span style="color:#64748b">（${esc(c.ticker)}）</span>` : ""}`;
  return hasAnalysis(c)
    ? `<a href="${SITE_URL}/analysis/${esc(slug(c))}" style="color:#0d4f52;text-decoration:underline">${label}</a>`
    : label;
}

function gradeTag(grade: string): string {
  const color = GRADE_COLOR[grade] ?? "#64748b";
  const bg = GRADE_BG[grade] ?? "#f1f5f9";
  return `<span style="display:inline-block;padding:2px 10px;border-radius:20px;background:${bg};color:${color};font-weight:800;font-size:12px;border:1px solid ${color}">評価 ${esc(grade)}（${esc(GRADE_LABEL[grade] ?? "中立")}）</span>`;
}

export function buildBriefHtml(d: BriefData, opts: { paid: boolean; unsubscribeUrl: string }): string {
  const sec = (title: string, body: string) =>
    `<div style="background:white;border:1px solid #b3e8ea;border-radius:12px;padding:16px 18px;margin-bottom:14px">
       <h3 style="margin:0 0 10px;font-size:14px;color:#082b2e">${title}</h3>${body}
     </div>`;

  // ① 今週の3つの要点
  const pointsHtml = d.points.length
    ? sec("📌 今週の3つの要点",
        `<ol style="margin:0;padding-left:20px;font-size:13px;color:#334155;line-height:1.9">${d.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>`)
    : "";

  // ② 来週のスケジュール
  const eventsHtml = d.events.length
    ? sec(`📅 来週（${shortDate(d.nextMon)}〜${shortDate(d.nextSun)}）のスケジュール`,
        `<table style="width:100%;border-collapse:collapse;font-size:12px">${d.events.map((e) => `
          <tr style="border-top:1px solid #e2f3f4">
            <td style="padding:7px 8px 7px 0;white-space:nowrap;color:#475569;vertical-align:top">${esc(shortDate(e.date))}${e.label === "上場日" && !e.company.listing_date_confirmed ? "（予定）" : ""}</td>
            <td style="padding:7px 8px;white-space:nowrap;vertical-align:top"><span style="color:${e.color};font-weight:700">${esc(e.label)}</span></td>
            <td style="padding:7px 0;vertical-align:top">${companyLink(e.company)}</td>
          </tr>`).join("")}
        </table>
        <p style="margin:10px 0 0;font-size:11px;color:#94a3b8">日程は、発表のたびに変わることがあります。申込の前に、証券会社の案内もご確認ください。</p>`)
    : "";

  // ③ 今週の初値結果
  const resultsHtml = d.results.length
    ? sec("📊 今週の初値結果",
        `<table style="width:100%;border-collapse:collapse;font-size:12px">
          <tr style="color:#2a7a7e;font-weight:700"><td style="padding:4px 8px 6px 0">銘柄</td><td style="padding:4px 8px 6px 0;white-space:nowrap">公募価格</td><td style="padding:4px 8px 6px 0;white-space:nowrap">初値</td><td style="padding:4px 0 6px;white-space:nowrap">公募価格比</td></tr>
          ${d.results.map((c) => {
            const r = c.price_change_rate;
            const col = r == null ? "#334155" : r >= 0 ? "#15803d" : "#dc2626";
            return `<tr style="border-top:1px solid #e2f3f4">
              <td style="padding:7px 8px 7px 0">${companyLink(c)}</td>
              <td style="padding:7px 8px 7px 0;white-space:nowrap">${esc(yen(c.ipo_price) || "-")}</td>
              <td style="padding:7px 8px 7px 0;white-space:nowrap">${esc(yen(c.initial_price) || "-")}</td>
              <td style="padding:7px 0;white-space:nowrap;font-weight:700;color:${col}">${esc(pctText(r) || "-")}</td>
            </tr>`;
          }).join("")}
        </table>
        <p style="margin:10px 0 0;font-size:11px;color:#94a3b8">過去の結果は、<a href="${SITE_URL}/results" style="color:#0d4f52">初値の結果一覧</a>にまとめています。</p>`)
    : "";

  // ④ 来週の注目銘柄
  let featuredHtml = "";
  if (d.featured) {
    const f = d.featured;
    const s = f.analysis_summary ?? {};
    const grade: string | null = s.grade ?? null;
    const view = firstSentence(s.summary);
    const insights: { title: string; text: string }[] = opts.paid && Array.isArray(s.insights)
      ? s.insights.slice(0, 2).map((i: any) => ({ title: String(i?.title ?? "").trim(), text: firstSentence(i?.desc || i?.body || i?.detail, 70) })).filter((i: any) => i.title)
      : [];
    featuredHtml = sec("✨ 来週の注目銘柄",
      `<p style="margin:0 0 8px;font-size:15px">${companyLink(f)}</p>
       ${grade ? `<p style="margin:0 0 8px">${gradeTag(grade)}<span style="display:block;margin-top:4px;font-size:10px;color:#94a3b8">※独自AIナインクロスによる評価です。AI評価の高い銘柄を掲載しており、売買をすすめるものではありません。</span></p>` : ""}
       ${view ? `<p style="margin:0 0 8px;font-size:13px;color:#334155;line-height:1.8;background:#f8fafc;border-left:3px solid #66c3c6;padding:10px 12px;border-radius:6px">${esc(view)}</p>` : ""}
       ${insights.map((i, n) => `<p style="margin:0 0 6px;font-size:12px;color:#334155;line-height:1.8"><strong style="color:#0d4f52">注目点${n + 1}：${esc(i.title)}</strong>${i.text ? `<br/>${esc(i.text)}` : ""}</p>`).join("")}
       ${!opts.paid ? `<p style="margin:8px 0 0;font-size:11px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 10px">🔒 注目点・注意点・9軸スコアは、有料会員の方が分析ページで読めます。</p>` : ""}
       ${hasAnalysis(f) ? `<p style="margin:10px 0 0"><a href="${SITE_URL}/analysis/${esc(slug(f))}" style="display:inline-block;padding:9px 20px;background:#0d4f52;color:white;text-decoration:none;border-radius:8px;font-size:12px;font-weight:700">分析レポートを見る →</a></p>` : ""}`);
  }

  const ctaHtml = `
    <div style="text-align:center;margin:20px 0 6px">
      <a href="${SITE_URL}/" style="display:inline-block;padding:12px 26px;background:#66c3c6;color:#082b2e;text-decoration:none;border-radius:8px;font-weight:800;font-size:13px">📅 IPOカレンダーを見る</a>
      ${opts.paid ? "" : `<a href="${SITE_URL}/plans" style="display:inline-block;margin-left:8px;padding:12px 22px;border:1.5px solid #66c3c6;color:#0d4f52;text-decoration:none;border-radius:8px;font-weight:800;font-size:13px">プランを見る</a>`}
    </div>`;

  return `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f4fbfc">
  <div style="background:#0d4f52;padding:16px 24px;border-radius:12px 12px 0 0">
    <h2 style="color:white;margin:0;font-size:16px">📰 IPO週報｜${esc(shortDate(d.thisMon))}〜${esc(shortDate(d.thisFri))}の週</h2>
    <p style="color:#a0d4d6;margin:4px 0 0;font-size:12px">担当：大手町調査室九課${opts.paid ? "｜有料会員向け" : ""}</p>
  </div>
  <div style="background:#f4fbfc;padding:18px 0 0">
    <p style="color:#082b2e;font-size:13px;line-height:1.8;margin:0 0 14px">週末に、来週のIPOの予定と今週の結果を、3分で確認できるようにまとめました。</p>
    ${pointsHtml}${eventsHtml}${resultsHtml}${featuredHtml}${ctaHtml}
    <p style="margin:18px 0 0;font-size:10px;color:#94a3b8;line-height:1.8;border-top:1px solid #e2e8f0;padding-top:12px">
      本メールは公開情報の整理を目的としており、投資勧誘ではありません。日程や価格は変更されることがあります。最終的な投資判断は、ご自身の責任でお願いします。<br/>
      このメールは、IPO週報の配信を希望された方へ、毎週金曜日の18時にお送りしています。<br/>
      配信を止める：<a href="${esc(opts.unsubscribeUrl)}" style="color:#64748b">こちらをクリック</a><br/>
      © 大手町調査室九課
    </p>
  </div>
</div>`;
}
