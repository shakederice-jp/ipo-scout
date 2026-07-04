import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const CATEGORIES = [
  { key: "ipo",          label: "🚀 IPOニュース",              desc: "新規上場・BB・初値に関する最新情報" },
  { key: "japan_stock",  label: "🇯🇵 日本株・市況",            desc: "日経平均・グロース市場の動き" },
  { key: "us_stock",     label: "🇺🇸 米国株・マクロ経済",      desc: "ナスダック・S&P500・米国経済" },
  { key: "startup",      label: "🏢 スタートアップ・ベンチャー", desc: "資金調達・M&A・次世代IPO候補" },
  { key: "forex",        label: "💹 為替・金融政策",            desc: "円ドル・日銀・FRBの動向" },
];

export async function GET() {
  const supabase = getSupabase();
  const result: Record<string, any> = {};

  for (const cat of CATEGORIES) {
    const { data } = await supabase
      .from("news_cache")
      .select("title, url, source, published_at")
      .eq("category", cat.key)
      .order("published_at", { ascending: false })
      .limit(8);

    result[cat.key] = {
      label: cat.label,
      desc: cat.desc,
      items: data ?? [],
    };
  }

  // 最終更新時刻を取得
  const { data: latest } = await supabase
    .from("news_cache")
    .select("fetched_at")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({
    categories: CATEGORIES.map(c => c.key),
    data: result,
    last_updated: latest?.fetched_at ?? null,
  });
}