// 週次で調査する「マーケット地合い・大化けテーマ」のスナップショットを取得し、
// 各種AIプロンプトに埋め込むための参考情報テキストに整形する共通ロジック。
// 2026/9/1新設。ユーザー要望「その時期その時期の大化けテーマ・地合いを分析材料に
// 加えたい」を受けて実装。実データ(目論見書等)とは別枠の「市場全体の一般的な参考情報」
// という位置づけで、以下の2箇所から呼び出す想定:
//   1. src/app/api/analyze/route.ts の scorePrompt/insightsPrompt
//      (超短期軸のスコア・コメント、マーケットトレンド「新規IPO紹介」記事に反映)
//   2. src/app/api/axes/route.ts の analyzeAxisPart (超短期=ultra_shortの時のみ)
//
// スナップショット自体は src/app/api/cron/market-snapshot/route.ts が
// 毎週月曜にAI Web検索で調査し、market_snapshotsテーブルに保存する。

export interface MarketSnapshotContext {
  text: string;
  weekStart: string | null;
}

// supabaseは呼び出し元によってservice-role-keyクライアントの場合とanon-keyクライアントの
// 場合があるため、型を specifics に固定せずどちらでも渡せるようにしている。
export async function fetchMarketSnapshotContext(supabase: any): Promise<MarketSnapshotContext> {
  try {
    const { data, error } = await supabase
      .from("market_snapshots")
      .select("week_start, hot_themes, sentiment")
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return { text: "", weekStart: null };

    // 何らかの理由で更新が止まっていた場合、2週間以上前の情報を「直近の地合い」として
    // 使ってしまうと誤った判断材料になりかねないため、古すぎる場合は使わない。
    const weekStartDate = new Date(`${data.week_start}T00:00:00+09:00`);
    const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
    if (Number.isNaN(weekStartDate.getTime()) || Date.now() - weekStartDate.getTime() > twoWeeksMs) {
      return { text: "", weekStart: null };
    }

    const themesArr = Array.isArray(data.hot_themes) ? data.hot_themes : [];
    const themes = themesArr
      .map((t: any) => `・${t?.theme ?? ""}（${t?.reason ?? ""}）`)
      .join("\n");
    const s = data.sentiment ?? {};

    const text =
      `【直近の市場テーマ・地合い（週次調査・${data.week_start}週時点）】\n` +
      (themes ? `注目テーマ:\n${themes}\n` : "") +
      `グロース市場・新興市場の地合い:${s.growth_market || "不明"}\n` +
      `日経平均の状況:${s.nikkei || "不明"}\n` +
      `世界的な株式市場の地合い:${s.global || "不明"}\n` +
      `総合地合い判断:${s.overall_label || "不明"}`;

    return { text, weekStart: data.week_start };
  } catch (e) {
    console.error("market-snapshot取得失敗:", e);
    return { text: "", weekStart: null };
  }
}
