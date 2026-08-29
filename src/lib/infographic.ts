import { createClient } from "@supabase/supabase-js";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://ipo.finance-tower.com";

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// このインフォグラフィックはX投稿専用のフック画像。
// 役割は「見た人が一瞬でこの銘柄の魅力に気づき、サイトで続きを読みたくなる」こと。
// 2026/8/29、「余白が多く目を引かない。売上推移などを実際にグラフ化してほしい」という
// フィードバックを受け、AIスコア(グレード)+ひとことインサイトの引用文デザインから、
// STEP3で抽出済みの財務データ(key_metrics)を使った「売上高の推移」棒グラフを
// メインに据えたデザインに変更した。
// 同日さらに「グラフだけでは見劣りする」との指摘を受け、hook(ai_summary等の
// 短い魅力訴求文)をグラフの上に引用カードとして表示する形に戻し、データの視覚化と
// 文章での魅力訴求を1枚の画像の中で両立させている。
export interface InfographicData {
  companyId: string;
  companyName: string;
  sector?: string;
  grade: string;   // A〜E
  score: number;   // 0〜100
  chartData?: { label: string; value: number }[]; // 売上高の推移(億円換算)。src/lib/ipo-revenue-chart.tsのbuildRevenueChartData()で作る
  hook?: string;    // ひとことインサイト(ai_summary等)。画像内に短い引用カードとして表示される
}

// og-infographicルートで文字を合成 → Supabase Storageへアップロードするところまでを一括で行う。
// 背景は外部の画像生成API(fal.ai)には依存せず、og-infographic側でCSSグラデーションのみで
// 組んでいる(取得失敗によるレイアウト崩れや、絵柄が毎回変わって見づらくなることを避けるため)。
export async function createInfographic(data: InfographicData): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      companyName: data.companyName,
      sector: data.sector ?? "",
      grade: data.grade,
      score: String(data.score),
      ...(data.chartData && data.chartData.length > 0 ? { chartData: JSON.stringify(data.chartData) } : {}),
      ...(data.hook ? { hook: data.hook } : {}),
    });

    const ogRes = await fetch(`${APP_URL}/api/og-infographic?${params.toString()}`, {
      signal: AbortSignal.timeout(30000),
    });

    if (!ogRes.ok) {
      const err = await ogRes.text();
      throw new Error(`画像合成エラー: ${err.slice(0, 200)}`);
    }

    const finalBuffer = Buffer.from(await ogRes.arrayBuffer());

    const supabase = getSupabase();
    const fileName = `${data.companyId}-${Date.now()}.png`;

    const { error: uploadError } = await supabase.storage
      .from("infographics")
      .upload(fileName, finalBuffer, { contentType: "image/png", upsert: true });

    if (uploadError) {
      console.error("インフォグラフィックのアップロード失敗:", uploadError);
      return null;
    }

    const { data: publicUrlData } = supabase.storage
      .from("infographics")
      .getPublicUrl(fileName);

    return publicUrlData.publicUrl;
  } catch (e: any) {
    console.error("インフォグラフィック生成エラー:", e?.message);
    return null;
  }
}
