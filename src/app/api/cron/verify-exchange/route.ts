import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyAdmin } from "@/lib/notify-admin";

// 2026/9/22新設: 上場市場(exchange)を複数の情報源で突き合わせて確認する仕組み。
// 過去にedinet-scanが上場市場を「グロース」固定で誤登録していたバグの再発防止策。
// 証券コード(ticker)が判明していて上場市場がまだ「未確認」のままの銘柄について、
// 松井証券・株探・みんかぶの3つの独立したIPO情報ページを読みに行き、
// 3つのうち2つ以上で同じ市場区分が確認できた場合だけ自動で確定・保存する。
// 一致しない/十分な情報が集まらない場合は自動確定せず、管理者にメールで知らせる
// (既存のnotifyAdmin経由、新しい管理画面ボタンは追加しない)。
export const maxDuration = 60;

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 想定される市場区分の一覧(長い表記から先に判定させるため、名証系を先頭に置く)
const MARKET_KEYWORDS = [
  "名証ネクスト", "名証プレミア", "名証メイン",
  "福証", "札証",
  "グロース", "スタンダード", "プライム",
];

function extractMarket(text: string): string | null {
  for (const kw of MARKET_KEYWORDS) {
    if (text.includes(kw)) return kw;
  }
  return null;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// 情報源1: 松井証券のIPOページ。タイトルに「(証券コード/市場)」の形式で市場区分が入る。
async function fromMatsui(ticker: string): Promise<string | null> {
  const html = await fetchText(`https://finance.matsui.co.jp/ipo/${ticker}/index`);
  if (!html) return null;
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  return extractMarket(titleMatch ? titleMatch[1] : html.slice(0, 3000));
}

// 情報源2: 株探の銘柄ページ
async function fromKabutan(ticker: string): Promise<string | null> {
  const html = await fetchText(`https://kabutan.jp/stock/?code=${ticker}`);
  if (!html) return null;
  return extractMarket(html.slice(0, 6000));
}

// 情報源3: みんかぶのIPO情報ページ
async function fromMinkabu(ticker: string): Promise<string | null> {
  const html = await fetchText(`https://minkabu.jp/stock/${ticker}/ipo`);
  if (!html) return null;
  return extractMarket(html.slice(0, 6000));
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = "Bearer " + process.env.CRON_SECRET;
  if (authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();

  // 証券コードが判明していて、上場市場が「未確認」のままの銘柄が対象
  const { data: targets, error } = await supabase
    .from("ipo_companies")
    .select("id, name, ticker, exchange")
    .not("ticker", "is", null)
    .eq("exchange", "未確認");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!targets || targets.length === 0) {
    return NextResponse.json({ message: "確認待ちの銘柄なし", confirmed: 0 });
  }

  const confirmed: string[] = [];
  const needsManual: string[] = [];
  const debug: { name: string; ticker: string; matsui: string | null; kabutan: string | null; minkabu: string | null }[] = [];

  for (const company of targets) {
    const [m1, m2, m3] = await Promise.all([
      fromMatsui(company.ticker),
      fromKabutan(company.ticker),
      fromMinkabu(company.ticker),
    ]);

    debug.push({ name: company.name, ticker: company.ticker, matsui: m1, kabutan: m2, minkabu: m3 });

    const results = [m1, m2, m3].filter((v): v is string => Boolean(v));
    const counts: Record<string, number> = {};
    for (const r of results) counts[r] = (counts[r] ?? 0) + 1;
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const best = ranked[0];

    // 3ソース中2つ以上が同じ市場区分で一致した場合のみ自動確定する
    if (best && best[1] >= 2) {
      const { error: updateError } = await supabase
        .from("ipo_companies")
        .update({ exchange: best[0], updated_at: new Date().toISOString() })
        .eq("id", company.id);
      if (!updateError) {
        confirmed.push(
          "✅ " + company.name + "(" + company.ticker + ") → " + best[0] +
          "(" + best[1] + "/3ソース一致: 松井=" + (m1 ?? "-") + " 株探=" + (m2 ?? "-") + " みんかぶ=" + (m3 ?? "-") + ")"
        );
        continue;
      }
    }

    needsManual.push(
      "・" + company.name + "(" + company.ticker + "): 松井=" + (m1 ?? "不明") +
      " / 株探=" + (m2 ?? "不明") + " / みんかぶ=" + (m3 ?? "不明")
    );
  }

  if (confirmed.length > 0 || needsManual.length > 0) {
    const lines: string[] = [];
    if (confirmed.length > 0) {
      lines.push("【複数ソース一致で上場市場を自動確定しました】");
      lines.push(...confirmed);
    }
    if (needsManual.length > 0) {
      if (lines.length > 0) lines.push("");
      lines.push("【情報源が一致せず自動確定できなかった銘柄(Supabaseで手動確認をお願いします)】");
      lines.push(...needsManual);
    }
    await notifyAdmin(
      "上場市場クロスチェック結果",
      lines.join("\n"),
      needsManual.length > 0 ? "warn" : "info"
    );
  }

  return NextResponse.json({
    success: true,
    confirmed: confirmed.length,
    needs_manual: needsManual.length,
    confirmedList: confirmed,
    needsManual,
    debug,
    fetched_at: new Date().toISOString(),
  });
}
