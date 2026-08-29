import { createClient } from "@supabase/supabase-js";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://ipo.finance-tower.com";

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// このインフォグラフィックはX投稿専用のフック画像。
// 役割は「見た人が一瞬でこの銘柄の魅力に気づき、サイトで続きを読みたくなる」こと。
// そのため会社の詳細データ(売上・利益・主幹事など)は載せず、AIスコア(グレード)と
// ひとことインサイト(hook)の2点だけを大きく見せるデザインにしている
// (2026/8/29、以前の6項目データ表デザインから全面刷新)。
export interface InfographicData {
  companyId: string;
  companyName: string;
  sector?: string;
  grade: string;   // A〜E
  score: number;   // 0〜100
  hook: string;    // 40字程度のひとことインサイト(tweet_summary相当)
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
      hook: data.hook,
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
