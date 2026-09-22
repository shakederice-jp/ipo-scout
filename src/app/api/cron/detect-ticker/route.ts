import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyAdmin } from "@/lib/notify-admin";

// 2026/9/22新設: 証券コード(ticker)が空欄のまま放置され、track-stock-price/
// detect-ipo-priceの対象から漏れ続ける問題への対応。上場日を過ぎているのに
// tickerが未入力の銘柄について、Yahoo!ファイナンスの銘柄検索APIを使って
// 会社名から証券コードを自動で調べ、1件だけ確実に一致するものが見つかった場合のみ
// 自動でtickerを埋める。一致がはっきりしない・見つからない場合は無理に埋めず、
// 管理者(マイケルさん)にメールで「手動入力が必要」と知らせる(既存のnotifyAdmin経由、
// 新しい管理画面ボタンは追加しない)。
export const maxDuration = 60;

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 「株式会社」「(株)」「㈱」等の法人格表記や空白・全角半角の差を無視して比較するための正規化
function normalizeName(s: string): string {
  return s
    .replace(/株式会社|（株）|\(株\)|㈱|㍿/g, "")
    .replace(/[\s　]/g, "")
    .toLowerCase();
}

type YahooQuote = {
  symbol?: string;
  shortname?: string;
  longname?: string;
  exchange?: string;
  quoteType?: string;
};

// Yahoo!ファイナンスの銘柄検索(非公式API)。会社名から候補銘柄を検索する。
async function searchTicker(companyName: string): Promise<YahooQuote[]> {
  const url =
    "https://query1.finance.yahoo.com/v1/finance/search?q=" +
    encodeURIComponent(companyName) +
    "&quotesCount=8&newsCount=0&lang=ja-JP&region=JP";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.quotes) ? data.quotes : [];
  } catch {
    return [];
  }
}

// 検索結果の中から「東証(.T)に上場している株式」かつ「会社名が実質一致する」候補だけに絞る
function findConfidentMatch(companyName: string, quotes: YahooQuote[]): YahooQuote | null {
  const target = normalizeName(companyName);

  const candidates = quotes.filter((q) => {
    if (!q.symbol || !q.symbol.endsWith(".T")) return false;
    if (q.quoteType && q.quoteType !== "EQUITY") return false;
    const nameCandidates = [q.shortname, q.longname].filter(Boolean) as string[];
    return nameCandidates.some((n) => {
      const norm = normalizeName(n);
      return norm === target || norm.includes(target) || target.includes(norm);
    });
  });

  // 1件だけに絞れた場合のみ「確実な一致」として採用する(複数候補があいまいに一致する場合は自動入力しない)
  if (candidates.length === 1) return candidates[0];
  return null;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = "Bearer " + process.env.CRON_SECRET;
  if (authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const today = new Date().toISOString().slice(0, 10);

  // 上場日を過ぎているのにtickerが空欄の銘柄が対象
  const { data: targets, error } = await supabase
    .from("ipo_companies")
    .select("id, name, ticker, listing_date")
    .lte("listing_date", today)
    .is("ticker", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!targets || targets.length === 0) {
    return NextResponse.json({ message: "証券コード未入力の銘柄なし", updated: 0 });
  }

  const autoFilled: string[] = [];
  const needsManual: string[] = [];
  // 2026/9/22追加: 自動一致に失敗した原因を後から調べられるよう、Yahoo!ファイナンス側が
  // 実際に何件・どんな候補を返してきたかをレスポンスに残す(デバッグ用、メールには含めない)。
  const debug: { name: string; quotes_found: number; candidates: string[] }[] = [];

  for (const company of targets) {
    const quotes = await searchTicker(company.name);
    const match = findConfidentMatch(company.name, quotes);

    debug.push({
      name: company.name,
      quotes_found: quotes.length,
      candidates: quotes
        .slice(0, 5)
        .map((q) => (q.symbol ?? "?") + ":" + (q.shortname ?? q.longname ?? "(名前なし)")),
    });

    if (!match || !match.symbol) {
      needsManual.push("・" + company.name + "(上場日: " + company.listing_date + ")");
      continue;
    }

    const ticker = match.symbol.replace(".T", "");

    const { error: updateError } = await supabase
      .from("ipo_companies")
      .update({ ticker, updated_at: new Date().toISOString() })
      .eq("id", company.id);

    if (updateError) {
      needsManual.push("・" + company.name + "(自動入力に失敗: " + updateError.message + ")");
    } else {
      autoFilled.push("✅ " + company.name + " → 証券コード " + ticker);
    }
  }

  // 何か報告することがあれば(自動入力できた/できなかったのいずれか)必ずメール通知する。
  // これにより「証券コードが空欄のまま気づかず放置される」ことが起きなくなる。
  if (autoFilled.length > 0 || needsManual.length > 0) {
    const lines: string[] = [];
    if (autoFilled.length > 0) {
      lines.push("【自動入力できた銘柄】");
      lines.push(...autoFilled);
    }
    if (needsManual.length > 0) {
      if (lines.length > 0) lines.push("");
      lines.push("【自動入力できなかった銘柄(Supabaseのipo_companiesテーブルでticker列を手入力してください)】");
      lines.push(...needsManual);
    }
    await notifyAdmin(
      "証券コード自動検出バッチ結果",
      lines.join("\n"),
      needsManual.length > 0 ? "warn" : "info"
    );
  }

  return NextResponse.json({
    success: true,
    auto_filled: autoFilled.length,
    needs_manual: needsManual.length,
    autoFilled,
    needsManual,
    debug,
    fetched_at: new Date().toISOString(),
  });
}
