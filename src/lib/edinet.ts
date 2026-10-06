// 2026/10/5新設: EDINET(金融庁の開示システム)の検索・会社名照合の共通処理。
//
// 発覚した不具合(2026年11月上場予定の4社すべてで「書類IDが見つからない」となった件):
//   EDINETに登録されている会社名は「株式会社ｅｓｔｉｅ」「ＭａｂＧｅｎｅｓｉｓ株式会社」
//   「株式会社ＬＴＶ－Ｘ」「Ａｌｌｇａｎｉｚｅ　Ｈｏｌｄｉｎｇｓ株式会社」のように英数字・記号・空白が
//   全角で書かれている。一方、当サイトの銘柄名は「estie」「MabGenesis」のような半角。
//   書類IDの自動検索(find-edinet-doc)・STEP1のテキスト取得(edinet)・毎日のEDINETスキャン
//   (cron/edinet-scan)は、全角と半角を区別したまま会社名を比べていたため、英字の社名の会社は
//   書類が実在していても一致せず「見つからない」扱いになっていた(estieの有価証券届出書は
//   2026/10/1にS100Z5P9として提出済み)。
// 対策: 会社名を比べる前に、全角→半角(NFKC)・大文字小文字・空白・ハイフンの種類・法人格の
//   違いをそろえる。照合の処理はこのファイルに一本化する。
//
// あわせて、EDINETのAPIがエラー(APIキーの期限切れ・アクセス制限など)を返した場合も、これまでは
// 「見つからない」と区別がつかなかったため、エラーとして呼び出し元に返すようにした。

const EDINET_KEY = process.env.EDINET_API_KEY ?? "";

// 会社名を比較用にそろえる(全角/半角、大文字/小文字、空白、ハイフンの種類、法人格の違いを無視)
export function normalizeCompanyName(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKC")
    .replace(/株式会社|\(株\)|㈱|有限会社|合同会社|合資会社|合名会社/g, "")
    .replace(/[‐‑‒–—―ー−－-]/g, "-") // ハイフン・長音の表記ゆれ(社名の「ー」も「-」にそろえる)
    .replace(/[\s・･.,、。'’"“”]/g, "")
    .toLowerCase()
    .replace(/ホ-ルディングス|holdings/g, "hd") // 「◯◯ホールディングス」と「◯◯HD」を同じ扱いにする
    .trim();
}

// 一方の社名にだけ付いていても同じ会社とみなす語(「◯◯ホールディングス」と「◯◯」など)
const ALLOWED_EXTRA = new Set(["hd", "グル-プ", "group", "ジャパン", "japan"]);

// 同じ会社名とみなせるか。
//  ・正規化後に完全一致
//  ・一方が他方を含み、はみ出した部分が「ホールディングス」「グループ」等だけの場合
//    (以前は「含んでいれば一致」としていたため、「estie」と「Testier」のような別会社も一致し得た)
export function isSameCompanyName(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizeCompanyName(a);
  const y = normalizeCompanyName(b);
  if (x.length < 2 || y.length < 2) return false; // 空や1文字の名前で何にでも一致してしまうのを防ぐ
  if (x === y) return true;
  const [shorter, longer] = x.length < y.length ? [x, y] : [y, x];
  if (shorter.length < 3) return false;
  const i = longer.indexOf(shorter);
  if (i < 0) return false;
  const extra = (longer.slice(0, i) + longer.slice(i + shorter.length)).replace(/^-+|-+$/g, "");
  return ALLOWED_EXTRA.has(extra);
}

// 新規上場時などの株式の有価証券届出書(訂正・投資信託等を除く)
// 2026/10/6修正: 様式コード(formCode)が "030000" のものだけに絞っていたが、新規公開時の届出書が
// 別の様式コードで登録されている可能性があるため、書類種別コード(docTypeCode "030" =有価証券届出書)
// または書類名で判定するように緩めた(訂正・投資信託等は引き続き除外)。
export function isNewStockRegistration(doc: any): boolean {
  const desc: string = doc?.docDescription ?? "";
  const typeOk = doc?.docTypeCode === "030" || desc.includes("有価証券届出書");
  return (
    typeOk &&
    (doc?.ordinanceCode == null || doc.ordinanceCode === "010") &&
    !desc.includes("訂正") &&
    !desc.includes("受益証券") &&
    !desc.includes("投資信託") &&
    !desc.includes("投資法人")
  );
}

// 日本時間の日付(YYYY-MM-DD)。EDINETの提出日は日本時間で管理されているため
export function jstDateString(d: Date = new Date()): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export type EdinetListResult = { docs: any[]; error: string | null };

// 2026/10/6追加: 同じ日の書類一覧を何度も問い合わせないための一時保存(同じサーバー内でのみ有効)。
// 過去の日付の一覧は後から変わらないので6時間、今日の分は10分だけ使い回す。
// 一括検索で4社を続けて探すと、同じ日付の一覧を4回ずつ問い合わせてEDINETの回数制限(429)に
// かかっていたため。
const listCache = new Map<string, { at: number; docs: any[] }>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchListOnce(date: string, timeoutMs: number): Promise<EdinetListResult & { rateLimited?: boolean }> {
  const url = `https://api.edinet-fsa.go.jp/api/v2/documents.json?date=${date}&type=2&Subscription-Key=${EDINET_KEY}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (res.status === 429) return { docs: [], error: "EDINET API エラー(429): Too Many Requests", rateLimited: true };
    if (!res.ok) return { docs: [], error: `HTTP ${res.status}` };
    const json: any = await res.json().catch(() => null);
    if (!json) return { docs: [], error: "応答がJSONではありません" };
    // 正常時は metadata.status が "200"。APIキー不正・回数制限などのときは StatusCode/message が返る
    const status = String(json?.metadata?.status ?? json?.StatusCode ?? json?.statusCode ?? "");
    if (status !== "200") {
      const msg = json?.metadata?.message ?? json?.message ?? "不明なエラー";
      return { docs: [], error: `EDINET API エラー(${status || "?"}): ${msg}`, rateLimited: status === "429" };
    }
    return { docs: Array.isArray(json.results) ? json.results : [], error: null };
  } catch (e: any) {
    return { docs: [], error: e?.name === "TimeoutError" ? "タイムアウト" : String(e?.message ?? e) };
  }
}

// 指定日の提出書類一覧。APIがエラーを返した場合は error に理由を入れる(「書類なし」と区別するため)。
// 回数制限(429)のときは、少し待ってから最大3回まで問い合わせ直す。
export async function listEdinetDocs(date: string, timeoutMs = 10000): Promise<EdinetListResult> {
  if (!EDINET_KEY) return { docs: [], error: "環境変数 EDINET_API_KEY が設定されていません" };
  const ttl = date >= jstDateString() ? 10 * 60_000 : 6 * 3600_000;
  const cached = listCache.get(date);
  if (cached && Date.now() - cached.at < ttl) return { docs: cached.docs, error: null };

  let last: EdinetListResult = { docs: [], error: "未実行" };
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetchListOnce(date, timeoutMs);
    if (!r.error) {
      listCache.set(date, { at: Date.now(), docs: r.docs });
      return { docs: r.docs, error: null };
    }
    last = { docs: [], error: r.error };
    if (!r.rateLimited) break;
    await sleep(1500 * (attempt + 1)); // 1.5秒→3秒→4.5秒と間隔を空けて再試行
  }
  return last;
}

export type ProspectusSearchResult = {
  found: { docId: string; filerName: string; submitDate: string; matchedBy: "secCode" | "name" } | null;
  daysSearched: number;
  apiErrors: { date: string; error: string }[];
  // 見つからなかったときの原因調査用: 検索期間中に見かけた有価証券届出書(新しい順に最大12件)
  seen: { date: string; docId: string; filerName: string; desc: string; formCode: string; secCode: string }[];
};

// 会社名から、新規上場時の有価証券届出書を新しい日付から順に探す。
// 2026/10/6改修: 10日分を同時に問い合わせるとEDINETの回数制限(429 Too Many Requests)にかかったため、
// 同時に問い合わせるのは2日分までにし、回数制限時は待ってから再試行する(listEdinetDocs)。
// また、上場日が分かっている場合は「上場日の75日前〜上場日(今日より後なら今日)」だけを探す。
// 新規上場の有価証券届出書は上場承認日(上場日の約1か月前)に提出されるため、この範囲で足りる。
export async function searchNewStockRegistration(
  companyName: string,
  opts: { days?: number; parallel?: number; deadlineMs?: number; listingDate?: string | null; ticker?: string | null } = {}
): Promise<ProspectusSearchResult> {
  const parallel = opts.parallel ?? 2;
  const deadline = Date.now() + (opts.deadlineMs ?? 50_000);
  const today = jstDateString();
  let newest = today;
  let days = opts.days ?? 180;
  const ld = opts.listingDate ? String(opts.listingDate).slice(0, 10) : null;
  if (ld && /^\d{4}-\d{2}-\d{2}$/.test(ld)) {
    newest = ld < today ? ld : today;
    const oldest = addDays(ld, -75);
    const span = Math.round((Date.parse(newest) - Date.parse(oldest)) / 86400000) + 1;
    days = Math.max(1, Math.min(days, span));
  }
  const apiErrors: { date: string; error: string }[] = [];
  const seen: ProspectusSearchResult["seen"] = [];
  let searched = 0;
  // 2026/10/6追加: 証券コードが分かっていれば、書類の証券コード(secCode。例:「653A0」)でも照合する。
  // 上場承認で証券コードが付いた後に届出書が提出されるため、社名の表記に左右されず確実に一致させられる。
  const ticker = (opts.ticker ?? "").normalize("NFKC").trim().toUpperCase();

  for (let start = 0; start < days; start += parallel) {
    if (Date.now() > deadline) break;
    const dates = Array.from({ length: Math.min(parallel, days - start) }, (_, k) => addDays(newest, -(start + k)));
    const lists = await Promise.all(dates.map((d) => listEdinetDocs(d)));
    searched += dates.length;
    // 新しい日付から順に確認する
    for (let k = 0; k < dates.length; k++) {
      const { docs, error } = lists[k];
      if (error) {
        apiErrors.push({ date: dates[k], error });
        continue;
      }
      const candidates = docs.filter(isNewStockRegistration);
      for (const d of candidates) {
        if (seen.length < 12) {
          seen.push({ date: dates[k], docId: d.docID, filerName: d.filerName ?? "", desc: d.docDescription ?? "", formCode: d.formCode ?? "", secCode: d.secCode ?? "" });
        }
      }
      const bySec = ticker.length === 4 ? candidates.find((d: any) => String(d.secCode ?? "").toUpperCase().startsWith(ticker)) : undefined;
      const exact = candidates.find((d: any) => normalizeCompanyName(d.filerName) === normalizeCompanyName(companyName));
      const hit = bySec ?? exact ?? candidates.find((d: any) => isSameCompanyName(d.filerName, companyName));
      if (hit) {
        return {
          found: { docId: hit.docID, filerName: hit.filerName, submitDate: String(hit.submitDateTime ?? dates[k]).slice(0, 10), matchedBy: hit === bySec ? "secCode" : "name" },
          daysSearched: searched,
          apiErrors,
          seen,
        };
      }
    }
  }
  return { found: null, daysSearched: searched, apiErrors, seen };
}
