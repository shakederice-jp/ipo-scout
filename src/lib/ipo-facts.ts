// 2026/9/25新設(改善要望③⑥): 証券コード(ticker)と公募価格(公開価格)を、複数の証券会社サイトで
// 突き合わせて確認するための共通処理。
//
// 背景: 以前の証券コード自動検出(detect-ticker)はYahoo!ファイナンスの銘柄検索だけに頼っており、
// 実運用ではほとんど見つけられず、証券コードが空欄の銘柄は株価追跡(100万円シミュレーション)や
// 答え合わせ記事の対象から丸ごと漏れていた。また公募価格も、EDINETの訂正届出書を直近5日分だけ
// 1回読みに行く仕組みしかなく、そこで取り逃すと二度と埋まらず、「公募価格が不明」の答え合わせ
// 記事が出てしまっていた(オリバー619Aの件)。
//
// 仕組み(2段階):
//  1. 候補探し: 松井証券の「IPOスケジュール」「直近IPOの実績」の一覧ページには、会社名・
//     証券コード・公開日・公開価格が表形式で載っているので、会社名で照合して候補を見つける。
//  2. 裏付け: 上場市場の確認(verify-exchange)と同じく、松井証券・株探・みんかぶの3つの銘柄ページを
//     読み、2つ以上で同じ事実(その証券コードのページにその会社名が載っている/同じ公募価格が
//     載っている)が確認できた場合だけ自動で確定する。確認できない場合は自動で埋めずに管理者へ通知する。
// 証券コード・公募価格・上場日は著作権の対象にならない客観的な事実情報のため、読み取って利用している。

export type MatsuiIpoRow = {
  code: string;
  name: string;
  listingDate: string | null; // YYYY-MM-DD
  ipoPrice: number | null;
  source: "schedule" | "real";
};

const UA = "Mozilla/5.0";

export async function fetchText(url: string, timeoutMs = 10000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// 「株式会社」等の法人格・空白・全角半角の違いを無視して比較するための正規化
export function normalizeName(s: string): string {
  return (s || "")
    .normalize("NFKC")
    .replace(/株式会社|\(株\)|㈱|㍿|有限会社|合同会社/g, "")
    .replace(/[\s　・.,、。'’"“”]/g, "")
    .toLowerCase();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function parseYen(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.normalize("NFKC").match(/([0-9][0-9,]*)/);
  if (!m) return null;
  const n = parseInt(m[1].replace(/,/g, ""), 10);
  return n >= 50 && n <= 1_000_000 ? n : null;
}

// 「10/13」のように年が省略された日付に、今日に最も近い年を補う
function inferDate(month: number, day: number, todayStr: string): string {
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const todayMs = Date.UTC(ty, tm - 1, td);
  let best = "";
  let bestDiff = Infinity;
  for (const y of [ty - 1, ty, ty + 1]) {
    const ms = Date.UTC(y, month - 1, day);
    const diff = Math.abs(ms - todayMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = new Date(ms).toISOString().slice(0, 10);
    }
  }
  return best;
}

const CODE_IN_LINK = /\/ipo\/([0-9][0-9A-Z]{3})\/index/;

function parseMatsuiTable(html: string, source: "schedule" | "real", todayStr: string): MatsuiIpoRow[] {
  const out: MatsuiIpoRow[] = [];
  const rows = html.split(/<tr[\s>]/i).slice(1);

  // 見出し行から「公開価格/公募価格」「公開日」の列番号を探す(列の並びが変わっても動くように)
  let priceIdx = -1;
  let dateIdx = -1;
  for (const row of rows) {
    if (!/<th[\s>]/i.test(row)) continue;
    const heads = row
      .split(/(?=<th[\s>])/i)
      .slice(1)
      .map((c) => htmlToText(c.replace(/^<th[^>]*>/i, "")));
    const p = heads.findIndex((h) => h.includes("公開価格") || h.includes("公募価格"));
    const d = heads.findIndex((h) => h.includes("公開日") || h.includes("上場日"));
    if (p >= 0 || d >= 0) {
      priceIdx = p;
      dateIdx = d;
      break;
    }
  }

  for (const row of rows) {
    const codeM = row.match(CODE_IN_LINK);
    if (!codeM) continue;
    const code = codeM[1];
    const cells = row
      .split(/(?=<td[\s>])/i)
      .slice(1)
      .map((c) => htmlToText(c.replace(/^<td[^>]*>/i, "")));
    const rowText = htmlToText(row.replace(/^[^>]*>/, ""));
    const first = cells[0] ?? rowText;

    // 会社名は「会社名(証券コード)」の形で載っている
    const nameM = first.match(new RegExp(`^(.*?)\\s*[(（]\\s*${code}\\s*[)）]`));
    let name = nameM ? nameM[1].trim() : "";
    if (!name) {
      const linkText = row.match(/<a[^>]*\/ipo\/[0-9A-Z]{4}\/index[^>]*>([\s\S]*?)<\/a>/i);
      name = linkText ? htmlToText(linkText[1]).replace(new RegExp(`[(（]?${code}[)）]?`), "").trim() : "";
    }
    if (!name) continue;

    // 上場日(公開日)
    let listingDate: string | null = null;
    const dateCell = dateIdx >= 0 && cells[dateIdx] ? cells[dateIdx] : rowText;
    const full = dateCell.match(/(20\d\d)\/(\d{1,2})\/(\d{1,2})/);
    if (full) {
      listingDate = `${full[1]}-${full[2].padStart(2, "0")}-${full[3].padStart(2, "0")}`;
    } else if (dateIdx >= 0 && cells[dateIdx]) {
      const md = cells[dateIdx].match(/(\d{1,2})\/(\d{1,2})/);
      if (md) listingDate = inferDate(Number(md[1]), Number(md[2]), todayStr);
    }

    // 公開価格(公募価格)。「-」の場合は未確定なのでnull
    let ipoPrice: number | null = null;
    if (priceIdx >= 0 && cells[priceIdx]) {
      ipoPrice = parseYen(cells[priceIdx]);
    } else if (source === "real" && full) {
      // 見出しが読めなかった場合の予備: 「直近IPOの実績」は公開日のすぐ後が公開価格
      const after = dateCell.slice(dateCell.indexOf(full[0]) + full[0].length);
      ipoPrice = parseYen(after.trim().split(" ")[0]);
    }

    out.push({ code, name, listingDate, ipoPrice, source });
  }
  return out;
}

// 松井証券の「IPOスケジュール」(上場前)と「直近IPOの実績」(上場後)の一覧を取得する
export async function fetchMatsuiIpoList(todayStr: string): Promise<MatsuiIpoRow[]> {
  const [schedule, real] = await Promise.all([
    fetchText("https://finance.matsui.co.jp/ipo/index"),
    fetchText("https://finance.matsui.co.jp/ipo/real-ipo/index"),
  ]);
  const rows: MatsuiIpoRow[] = [];
  if (schedule) rows.push(...parseMatsuiTable(schedule, "schedule", todayStr));
  if (real) rows.push(...parseMatsuiTable(real, "real", todayStr));
  return rows;
}

// 会社名で一覧から候補を探す。完全一致を優先し、部分一致は候補が1件に絞れた場合のみ採用する。
export function findMatsuiRow(
  companyName: string,
  listingDate: string | null,
  rows: MatsuiIpoRow[]
): { row: MatsuiIpoRow | null; ambiguous: boolean } {
  const target = normalizeName(companyName);
  if (target.length < 2) return { row: null, ambiguous: false };

  const dateOk = (r: MatsuiIpoRow) => {
    if (!listingDate || !r.listingDate) return true;
    const diff = Math.abs(Date.parse(r.listingDate) - Date.parse(listingDate)) / 86400000;
    return diff <= 3; // 上場日が大きく違うものは別会社とみなす
  };

  const uniqueByCode = (list: MatsuiIpoRow[]) => {
    const map = new Map<string, MatsuiIpoRow>();
    for (const r of list) {
      const prev = map.get(r.code);
      // 公開価格が載っている方(実績側)を優先して残す
      if (!prev || (prev.ipoPrice == null && r.ipoPrice != null)) map.set(r.code, r);
    }
    return [...map.values()];
  };

  const exact = uniqueByCode(rows.filter((r) => normalizeName(r.name) === target && dateOk(r)));
  if (exact.length === 1) return { row: exact[0], ambiguous: false };
  if (exact.length > 1) return { row: null, ambiguous: true };

  const partial = uniqueByCode(
    rows.filter((r) => {
      const n = normalizeName(r.name);
      const shorter = n.length < target.length ? n : target;
      return shorter.length >= 4 && (n.includes(target) || target.includes(n)) && dateOk(r);
    })
  );
  if (partial.length === 1) return { row: partial[0], ambiguous: false };
  return { row: null, ambiguous: partial.length > 1 };
}

export type SourceCheck = {
  provider: "松井証券" | "株探" | "みんかぶ";
  fetched: boolean;
  nameFound: boolean;
  prices: number[]; // ページ内で「公開価格/公募価格」の近くに書かれていた金額
};

function pricesNearKeyword(text: string): number[] {
  const out = new Set<number>();
  const re = /(公開価格|公募価格|発行価格)[^0-9]{0,30}?([0-9][0-9,]{1,8})\s*円/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = parseYen(m[2]);
    if (n != null) out.add(n);
  }
  return [...out];
}

// 3つの証券情報サイトの銘柄ページを読み、会社名・公募価格が載っているかを調べる
export async function checkSources(code: string, companyName: string): Promise<SourceCheck[]> {
  const target = normalizeName(companyName);
  const sites: { provider: SourceCheck["provider"]; url: string }[] = [
    { provider: "松井証券", url: `https://finance.matsui.co.jp/ipo/${code}/index` },
    { provider: "株探", url: `https://kabutan.jp/stock/?code=${code}` },
    { provider: "みんかぶ", url: `https://minkabu.jp/stock/${code}/ipo` },
  ];
  return Promise.all(
    sites.map(async (s) => {
      const html = await fetchText(s.url);
      if (!html) return { provider: s.provider, fetched: false, nameFound: false, prices: [] };
      const text = htmlToText(html);
      const normText = normalizeName(text);
      return {
        provider: s.provider,
        fetched: true,
        nameFound: target.length >= 2 && normText.includes(target),
        prices: pricesNearKeyword(text),
      };
    })
  );
}

// 3つのうち2つ以上のサイトで、その証券コードのページにその会社名が載っていれば「確定」
export function tickerConfirmed(checks: SourceCheck[]): boolean {
  return checks.filter((c) => c.nameFound).length >= 2;
}

// 公募価格: 松井証券の一覧に載っていた値も含め、2つ以上の情報源(会社単位)で一致した金額を返す
export function agreedIpoPrice(checks: SourceCheck[], matsuiListPrice: number | null): number | null {
  const byProvider = new Map<string, Set<number>>();
  for (const c of checks) byProvider.set(c.provider, new Set(c.prices));
  if (matsuiListPrice != null) {
    const matsui = byProvider.get("松井証券") ?? new Set<number>();
    matsui.add(matsuiListPrice);
    byProvider.set("松井証券", matsui);
  }
  const counts = new Map<number, number>();
  for (const set of byProvider.values()) for (const p of set) counts.set(p, (counts.get(p) ?? 0) + 1);
  const agreed = [...counts.entries()].filter(([, n]) => n >= 2).map(([p]) => p);
  return agreed.length === 1 ? agreed[0] : null; // 一致する金額が複数ある等あいまいな場合は確定しない
}

export function describeChecks(checks: SourceCheck[]): string {
  return checks
    .map((c) =>
      `${c.provider}=${!c.fetched ? "取得失敗" : c.nameFound ? "社名あり" : "社名なし"}` +
      (c.prices.length ? `(公募価格表記: ${c.prices.join("/")}円)` : "")
    )
    .join(" / ");
}
