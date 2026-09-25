import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyAdmin } from "@/lib/notify-admin";
import {
  fetchMatsuiIpoList,
  findMatsuiRow,
  checkSources,
  tickerConfirmed,
  agreedIpoPrice,
  describeChecks,
  normalizeName,
} from "@/lib/ipo-facts";

// 証券コード(ticker)・公募価格の自動検出バッチ。
//
// 2026/9/22新設時はYahoo!ファイナンスの銘柄検索だけで証券コードを探していたが、実運用では
// ほとんど見つけられず、9/16以降に上場した銘柄の証券コードが空欄のまま、株価追跡
// (100万円シミュレーション)や答え合わせ記事の対象から漏れる不具合が起きた。
//
// 2026/9/25全面改修(改善要望③⑥):
//  1. 松井証券の「IPOスケジュール」「直近IPOの実績」一覧から、会社名で証券コード・公募価格の
//     候補を探す(一覧で見つからない場合のみ、従来のYahoo!ファイナンス検索を予備として使う)。
//  2. 上場市場の確認(verify-exchange)と同じく、松井証券・株探・みんかぶの3サイトの銘柄ページを
//     読み、2つ以上で裏付けが取れた場合だけ自動で確定する。
//     ・証券コード: その証券コードのページに、その会社名が載っているサイトが2つ以上
//     ・公募価格: 同じ金額が載っているサイトが2つ以上(松井証券の一覧の値も1票として数える)
//  3. 裏付けが取れない場合は自動では埋めず、管理者にメールで知らせる(新しい管理画面ボタンは作らない)。
//  4. 証券コードが後から埋まった上場済み銘柄は、上場日からの株価履歴(100万円シミュレーション用)と
//     上場日終値をさかのぼって補完する。
// 上場前の銘柄も対象にしているため、上場日を迎える前に証券コード・公募価格が揃うようになる。
export const maxDuration = 60;

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 1回の実行で裏付け確認(各社サイトへの問い合わせ)まで行う銘柄数の上限。
// 残りは翌日のcronで処理される(関数の実行時間上限を超えないため)。
const MAX_VERIFY_PER_RUN = 6;
// 何日前までに上場した銘柄を対象にするか(古い銘柄は一覧に載っていないため)
const LOOKBACK_DAYS = 120;
// 自動で埋められなかった場合に管理者へ知らせる対象(上場日がこの範囲の銘柄だけ。古い・日付不明の
// 銘柄まで毎日通知すると受信箱が埋まるため)
const NOTIFY_PAST_DAYS = 45;
const NOTIFY_FUTURE_DAYS = 10;

type YahooQuote = { symbol?: string; shortname?: string; longname?: string; quoteType?: string };

// 予備: Yahoo!ファイナンスの銘柄検索(非公式API)
async function searchTickerOnYahoo(companyName: string): Promise<string | null> {
  const url =
    "https://query1.finance.yahoo.com/v1/finance/search?q=" +
    encodeURIComponent(companyName) +
    "&quotesCount=8&newsCount=0&lang=ja-JP&region=JP";
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const quotes: YahooQuote[] = Array.isArray(data?.quotes) ? data.quotes : [];
    const target = normalizeName(companyName);
    const hits = quotes.filter((q) => {
      if (!q.symbol || !q.symbol.endsWith(".T")) return false;
      if (q.quoteType && q.quoteType !== "EQUITY") return false;
      return [q.shortname, q.longname].some((n) => {
        if (!n) return false;
        const norm = normalizeName(n);
        return norm === target || norm.includes(target) || target.includes(norm);
      });
    });
    return hits.length === 1 ? hits[0].symbol!.replace(".T", "") : null;
  } catch {
    return null;
  }
}

// Yahoo Financeの日足(直近1年)を取得
async function fetchDailyCloses(ticker: string): Promise<{ date: string; close: number }[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}.T?interval=1d&range=1y`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    const ts: number[] = result?.timestamp ?? [];
    const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
    const out: { date: string; close: number }[] = [];
    for (let i = 0; i < ts.length; i++) {
      if (closes[i] == null) continue;
      const date = new Date(ts[i] * 1000).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
      out.push({ date, close: Math.round(closes[i]!) });
    }
    return out;
  } catch {
    return [];
  }
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = "Bearer " + process.env.CRON_SECRET;
  if (authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const since = addDays(today, -LOOKBACK_DAYS);

  // 証券コードまたは公募価格が空欄の銘柄が対象(上場前の銘柄も含む)
  const { data: rawTargets, error } = await supabase
    .from("ipo_companies")
    .select("id, name, ticker, ipo_price, listing_date, initial_price")
    .or("ticker.is.null,ipo_price.is.null");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const targets = (rawTargets ?? []).filter((c: any) => !c.listing_date || String(c.listing_date).slice(0, 10) >= since);
  // 上場日が今日に近い銘柄(直近上場・上場間近)から優先して処理する。上場日不明の銘柄は最後。
  const distance = (c: any) =>
    c.listing_date ? Math.abs(Date.parse(String(c.listing_date).slice(0, 10)) - Date.parse(today)) : Number.MAX_SAFE_INTEGER;
  targets.sort((a: any, b: any) => distance(a) - distance(b));
  if (targets.length === 0) {
    return NextResponse.json({ message: "証券コード・公募価格が未入力の銘柄なし", updated: 0 });
  }

  const matsuiRows = await fetchMatsuiIpoList(today);

  const inNotifyWindow = (c: any) => {
    if (!c.listing_date) return false;
    const d = String(c.listing_date).slice(0, 10);
    return d >= addDays(today, -NOTIFY_PAST_DAYS) && d <= addDays(today, NOTIFY_FUTURE_DAYS);
  };

  const filled: string[] = [];
  const needsManual: string[] = [];
  const debug: any[] = [];
  let verifiedCount = 0;

  for (const company of targets as any[]) {
    const listingStr = company.listing_date ? String(company.listing_date).slice(0, 10) : null;
    const { row, ambiguous } = findMatsuiRow(company.name, listingStr, matsuiRows);

    // 証券コードの候補(既に入っていればそれを使う)
    let code: string | null = company.ticker ?? row?.code ?? null;
    let codeSource = company.ticker ? "登録済み" : row ? "松井証券の一覧" : "";
    if (!code && !ambiguous) {
      // 松井証券の一覧で見つからない場合のみ、予備としてYahoo!ファイナンス検索を試す(上場後のみ)
      if (listingStr && listingStr <= today && inNotifyWindow(company)) {
        code = await searchTickerOnYahoo(company.name);
        if (code) codeSource = "Yahoo!ファイナンス検索";
      }
    }

    if (!code) {
      debug.push({ name: company.name, matsui: null, ambiguous });
      if (inNotifyWindow(company) && !company.ticker) {
        needsManual.push(
          `・${company.name}(上場日: ${listingStr}): 証券コードの候補が見つかりませんでした` +
            (ambiguous ? "(似た社名が複数あり自動判定を見送り)" : "")
        );
      }
      continue;
    }

    if (verifiedCount >= MAX_VERIFY_PER_RUN) {
      debug.push({ name: company.name, deferred: true });
      continue; // 残りは翌日のcronで処理
    }
    verifiedCount++;

    const checks = await checkSources(code, company.name);
    const detail = describeChecks(checks);
    debug.push({ name: company.name, code, codeSource, matsuiRow: row, checks });

    const update: Record<string, any> = {};
    let tickerJustSet = false;

    // --- 証券コード ---
    if (!company.ticker) {
      if (!tickerConfirmed(checks)) {
        if (inNotifyWindow(company)) {
          needsManual.push(`・${company.name}: 証券コード候補 ${code}(${codeSource})を裏付けられず自動入力を見送り [${detail}]`);
        }
        continue; // 証券コードが確定しない限り、公募価格も確定させない(別会社の値を入れる恐れがあるため)
      }
      // 同じ証券コードが別の銘柄に既に入っていないか確認(重複登録の防止)
      const { data: dup } = await supabase.from("ipo_companies").select("id, name").eq("ticker", code).neq("id", company.id).limit(1);
      if (dup && dup.length > 0) {
        needsManual.push(`・${company.name}: 証券コード候補 ${code} は既に「${dup[0].name}」に登録済みのため自動入力を見送り`);
        continue;
      }
      update.ticker = code;
      tickerJustSet = true;
      if (!listingStr && row?.listingDate) update.listing_date = row.listingDate;
    }

    // --- 公募価格 ---
    let priceSet: number | null = null;
    if (!company.ipo_price) {
      const agreed = agreedIpoPrice(checks, row && row.code === code ? row.ipoPrice : null);
      if (agreed != null) {
        priceSet = agreed;
      } else if (inNotifyWindow(company) && listingStr && listingStr <= addDays(today, 3)) {
        // 上場直前〜上場後なのに公募価格が確定できない場合だけ知らせる(上場の数週間前は未定で当然のため)
        needsManual.push(
          `・${company.name}(${code}): 公募価格を2つ以上のサイトで一致確認できず自動入力を見送り` +
            (row?.ipoPrice ? `(松井証券の一覧では${row.ipoPrice}円)` : "") +
            ` [${detail}]`
        );
      }
    }

    if (Object.keys(update).length > 0) {
      update.updated_at = new Date().toISOString();
      const { error: updateError } = await supabase.from("ipo_companies").update(update).eq("id", company.id);
      if (updateError) {
        needsManual.push(`・${company.name}: 保存に失敗(${updateError.message})`);
        continue;
      }
      if (update.ticker) filled.push(`✅ ${company.name} → 証券コード ${code}(${codeSource}、${detail})`);
      if (update.listing_date) filled.push(`   上場日も松井証券の一覧から設定: ${update.listing_date}`);
    }

    if (priceSet != null) {
      // 公募価格の保存は、管理画面の公募価格入力と同じAPIを通す(時価総額などの表示用データも一緒に更新されるため)
      let ok = false;
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/admin/set-ipo-price`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company_id: company.id, ipo_price: priceSet }),
          signal: AbortSignal.timeout(15000),
        });
        ok = res.ok;
      } catch {
        ok = false;
      }
      if (!ok) {
        const { error: pe } = await supabase.from("ipo_companies").update({ ipo_price: priceSet }).eq("id", company.id);
        ok = !pe;
      }
      if (ok) filled.push(`💰 ${company.name}(${code}) → 公募価格 ${priceSet}円(2サイト以上で一致)`);
      else needsManual.push(`・${company.name}: 公募価格${priceSet}円の保存に失敗`);
    }

    // --- 証券コードが後から埋まった上場済み銘柄: 株価履歴・上場日終値をさかのぼって補完 ---
    const effectiveListing = listingStr ?? update.listing_date ?? null;
    if (tickerJustSet && effectiveListing && effectiveListing <= today) {
      const bars = (await fetchDailyCloses(code)).filter((b) => b.date >= effectiveListing);
      if (bars.length > 0) {
        const { error: histError } = await supabase.from("stock_price_history").upsert(
          bars.map((b) => ({ company_id: company.id, price_date: b.date, price: b.close, fetched_at: new Date().toISOString() })),
          { onConflict: "company_id,price_date" }
        );
        if (!histError) filled.push(`   株価履歴を上場日から${bars.length}日分さかのぼって補完(100万円シミュレーション用)`);

        if (company.initial_price == null) {
          const ipoPrice = priceSet ?? company.ipo_price ?? null;
          const first = bars[0];
          const changeRate = ipoPrice ? Math.round(((first.close - ipoPrice) / ipoPrice) * 1000) / 10 : null;
          const { error: ipError } = await supabase
            .from("ipo_companies")
            .update({ initial_price: first.close, price_change_rate: changeRate, status: "上場済", updated_at: new Date().toISOString() })
            .eq("id", company.id);
          if (!ipError) filled.push(`   上場日終値を設定: ${first.close}円(${first.date})`);
        }
      }
    }
  }

  if (filled.length > 0 || needsManual.length > 0) {
    const lines: string[] = [];
    if (filled.length > 0) {
      lines.push("【複数サイトで裏付けが取れたため自動入力した項目】");
      lines.push(...filled);
    }
    if (needsManual.length > 0) {
      if (lines.length > 0) lines.push("");
      lines.push("【自動入力できなかった項目(管理画面またはSupabaseのipo_companiesで手入力をお願いします)】");
      lines.push(...needsManual);
    }
    await notifyAdmin(
      "証券コード・公募価格 自動検出バッチ結果",
      lines.join("\n"),
      needsManual.length > 0 ? "warn" : "info"
    );
  }

  return NextResponse.json({
    success: true,
    targets: targets.length,
    matsui_rows: matsuiRows.length,
    filled,
    needsManual,
    debug,
    fetched_at: new Date().toISOString(),
  });
}
