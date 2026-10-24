// 2026/10/24新設(束A・①): 「予定の自動登録」(カレンダー購読)用の、iCalendar(.ics)の本文を作る処理。
// スマホ・PCのカレンダーアプリ(iPhone標準・Googleカレンダー・Outlookなど)に購読リンクを1回登録すると、
// 上場日・BB開始日・申込開始日・ロックアップ解除日が自動で入り、日付が変わったときも自動で更新される。
// 使えるのはCプランの会員だけ(購読リンクごとに会員を確認する。鍵は calendar_feed_tokens テーブル)。
import type { SupabaseClient } from "@supabase/supabase-js";

const SITE_URL = "https://ipo.finance-tower.com";

type Co = {
  id: string;
  name: string | null;
  ticker: string | null;
  listing_date: string | null;
  listing_date_confirmed: boolean | null;
  bb_start_date: string | null;
  apply_start_date: string | null;
  lockup_90_date: string | null;
  lockup_180_date: string | null;
};

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// 1行は75バイトまでと決まっているため、超えたら改行して次の行を半角スペースで始める(日本語は3バイトなので文字の途中で切らない)
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 74) return line;
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  let limit = 74;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > limit) {
      out.push(cur);
      cur = "";
      bytes = 0;
      limit = 73; // 2行目以降は先頭の空白1バイトぶん短くする
    }
    cur += ch;
    bytes += b;
  }
  if (cur) out.push(cur);
  return out.join("\r\n ");
}

const ymd = (d: string) => d.replace(/-/g, "");
function nextDay(d: string): string {
  const t = new Date(d + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10).replace(/-/g, "");
}
const validDate = (d: string | null | undefined): d is string => !!d && /^\d{4}-\d{2}-\d{2}/.test(d);

export async function buildCalendarIcs(supabase: SupabaseClient): Promise<string> {
  const today = new Date();
  const from = new Date(today.getTime() - 220 * 86400000).toISOString().slice(0, 10); // ロックアップ(180日)の解除日まで拾うため、上場から220日前まで
  const keepFrom = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10); // 予定そのものは30日前から先だけ載せる

  const { data } = await supabase
    .from("ipo_companies")
    .select("id,name,ticker,listing_date,listing_date_confirmed,bb_start_date,apply_start_date,lockup_90_date,lockup_180_date")
    .or(`listing_date.gte.${from},bb_start_date.gte.${from},apply_start_date.gte.${from}`)
    .limit(400);

  const stamp = today.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Otemachi Research 9//IPO Calendar//JA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:IPOスケジュール(大手町調査室九課)",
    "X-WR-TIMEZONE:Asia/Tokyo",
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
    "X-PUBLISHED-TTL:PT12H",
  ];

  const add = (c: Co, kind: string, label: string, date: string | null | undefined, tentative = false) => {
    if (!validDate(date)) return;
    const d = date.slice(0, 10);
    if (d < keepFrom) return;
    const slug = c.ticker || c.id;
    const title = `【${label}】${c.name ?? "不明"}${c.ticker ? `（${c.ticker}）` : ""}${tentative ? "（予定）" : ""}`;
    lines.push("BEGIN:VEVENT");
    lines.push(fold(`UID:${c.id}-${kind}@ipo.finance-tower.com`));
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART;VALUE=DATE:${ymd(d)}`);
    lines.push(`DTEND;VALUE=DATE:${nextDay(d)}`);
    lines.push(fold(`SUMMARY:${esc(title)}`));
    lines.push(fold(`DESCRIPTION:${esc(`${label}。分析ページ: ${SITE_URL}/analysis/${slug}\n※日程は変更されることがあります。投資判断はご自身で行ってください。`)}`));
    lines.push(fold(`URL:${SITE_URL}/analysis/${slug}`));
    lines.push("TRANSP:TRANSPARENT");
    lines.push("END:VEVENT");
  };

  for (const c of (data ?? []) as Co[]) {
    // 上場予定日が確認できていない銘柄は、サイトの方針どおり載せない(上場日・ロックアップ解除日は上場日から決まるため)
    const confirmed = !!c.listing_date_confirmed;
    if (confirmed) {
      add(c, "listing", "上場", c.listing_date);
      add(c, "lockup90", "ロックアップ解除90日", c.lockup_90_date);
      add(c, "lockup180", "ロックアップ解除180日", c.lockup_180_date);
    }
    add(c, "bb", "BB開始", c.bb_start_date);
    add(c, "apply", "申込開始", c.apply_start_date);
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
