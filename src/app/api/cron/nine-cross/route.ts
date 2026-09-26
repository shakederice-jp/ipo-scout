import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractExtraFacts, EXTRA_FACTS_VERSION } from "@/lib/extra-facts";
import { computeNineCross } from "@/lib/value-growth";
import { fetchExchangeListings } from "@/lib/ipo-facts";

// 2026/9/26新設: 独自AIナインクロスの独自試算(バリュー×グロース・マップ、軸バッジ、
// コンセンサス指標)を毎日まとめて計算し、各銘柄の analysis_market.nine_cross に保存するバッチ。
//
// 手順:
//  1. 目論見書から追加データ(株数・ロックアップの価格条件・代表者の持株比率・市場規模)を
//     まだ取り出していない銘柄について、src/lib/extra-facts.ts で取り出して
//     structured_data.extra_facts に保存する(AIを使うので1回あたり数社まで。残りは翌日以降)。
//  2. 全銘柄の数値をそろえて、src/lib/value-growth.ts で相対スコア等を計算し保存する。
//
// 保存先を analysis_market にしているのは、分析ページ側(page.tsx)で有料会員でない人には
// analysis_market ごと送らない仕組みが既にあり、「マップは有料会員限定」という方針を
// そのまま満たせるため(新しい列も増やさずに済む)。なお、STEP⑦(市場・競合情報の取得)を
// 再実行すると analysis_market が丸ごと作り直されて nine_cross が消えるが、翌日のこのバッチで
// 自動的に復元される。
//
// 定期実行は vercel.json の crons で毎日 11:00 UTC(20:00 JST)に設定している。
// (.github/workflows/cron.yml は保護されたパスで直接書き換えられず、過去に貼り付けミスで
// 全ジョブが止まった経緯があるため、Vercel側の定期実行を使う。Vercelは環境変数CRON_SECRETを
// Authorizationヘッダーに付けて呼び出すので、下の認証チェックはそのまま通る。)
export const maxDuration = 120;

const EXTRACT_PARALLEL = 3; // 同時に読み取る社数
const EXTRACT_BATCHES = 2; // 1回の実行で最大 3社×2回=6社
const EXTRACT_TIME_BUDGET_MS = 60_000;

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const supabase = getSupabase();
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

  const { data: companies, error } = await supabase
    .from("ipo_companies")
    .select("id, name, ticker, listing_date, ipo_price, price_change_rate, price_range_min, price_range_max, sector, structured_data, analysis_market");
  if (error || !companies) {
    return NextResponse.json({ error: error?.message ?? "取得失敗" }, { status: 500 });
  }

  // --- 1. 追加データの抽出(未抽出の銘柄を、上場日が今日に近い順に数社ずつ) ---
  const dist = (c: any) => (c.listing_date ? Math.abs(Date.parse(String(c.listing_date)) - Date.parse(today)) : Number.MAX_SAFE_INTEGER);
  const needExtract = companies
    .filter((c: any) => c.structured_data && (c.structured_data.extra_facts?.version ?? 0) < EXTRA_FACTS_VERSION)
    .sort((a: any, b: any) => dist(a) - dist(b));

  const extracted: string[] = [];
  const extractErrors: string[] = [];
  const extractOne = async (c: any) => {
    try {
      const { data: rawRow } = await supabase.from("ipo_companies").select("raw_prospectus").eq("id", c.id).single();
      const facts = await extractExtraFacts(c.name, (rawRow as any)?.raw_prospectus ?? null, c.structured_data);
      const newStructured = { ...c.structured_data, extra_facts: facts };
      const { error: upErr } = await supabase.from("ipo_companies").update({ structured_data: newStructured }).eq("id", c.id);
      if (upErr) extractErrors.push(`${c.name}: ${upErr.message}`);
      else {
        c.structured_data = newStructured;
        extracted.push(`${c.name}${facts.rejected.length ? `(照合で除外: ${facts.rejected.join("、")})` : ""}`);
      }
    } catch (e: any) {
      extractErrors.push(`${c.name}: ${e?.message ?? e}`);
    }
  };
  for (let b = 0; b < EXTRACT_BATCHES; b++) {
    if (Date.now() - started > EXTRACT_TIME_BUDGET_MS) break;
    const batch = needExtract.slice(b * EXTRACT_PARALLEL, (b + 1) * EXTRACT_PARALLEL);
    if (!batch.length) break;
    await Promise.all(batch.map(extractOne));
  }

  // --- 2. 仮条件(東証の新規上場一覧)を取得して、全銘柄の試算を計算・保存 ---
  const kariByTicker = new Map<string, { min: number; max: number }>();
  try {
    const listings = await fetchExchangeListings(today);
    for (const [code, row] of listings) if (row.kari) kariByTicker.set(code, row.kari);
  } catch {
    // 取得できなくても他の指標は計算できるので続行
  }

  // 一度取れた仮条件は、東証の一覧から消えた後も使えるよう前回の保存値から補う
  for (const c of companies as any[]) {
    const prev = c.analysis_market?.nine_cross?.kari_range;
    if (c.ticker && prev && !kariByTicker.has(c.ticker)) kariByTicker.set(c.ticker, prev);
  }

  const results = computeNineCross(companies, { today, kariByTicker });
  let saved = 0;
  const saveErrors: string[] = [];
  for (const c of companies as any[]) {
    const r = results.get(c.id);
    if (!r) continue;
    const { error: e2 } = await supabase
      .from("ipo_companies")
      .update({ analysis_market: { ...(c.analysis_market ?? {}), nine_cross: r } })
      .eq("id", c.id);
    if (e2) saveErrors.push(`${c.name}: ${e2.message}`);
    else saved++;
  }

  return NextResponse.json({
    success: true,
    saved,
    extracted,
    remaining_to_extract: Math.max(0, needExtract.length - extracted.length),
    errors: [...extractErrors, ...saveErrors],
    elapsed_ms: Date.now() - started,
  });
}
