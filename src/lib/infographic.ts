import { createClient } from "@supabase/supabase-js";

const FAL_KEY = process.env.FAL_KEY!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://ipo.finance-tower.com";

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface InfographicData {
  companyId: string;
  companyName: string;
  listingDate: string;
  exchange: string;
  ticker: string;
  revenue: string;
  profit: string;
  underwriter: string;
}

// FLUX.1 schnell(fal.ai)で、文字を含まないシンプルな背景デザインを生成する
async function generateBackgroundUrl(companyName: string): Promise<string> {
  const prompt = `Minimalist flat vector business infographic background, no text, no letters, no numbers. `
    + `Clean navy blue and cream color scheme, subtle geometric shapes, financial chart icon motifs, `
    + `professional Japanese IR report style, empty space in the center and bottom for text overlay, 1200x1200 square format.`;

  const res = await fetch("https://fal.run/fal-ai/flux/schnell", {
    method: "POST",
    headers: {
      "Authorization": `Key ${FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_size: "square_hd",
      num_inference_steps: 4,
      num_images: 1,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`FLUX画像生成エラー: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const imageUrl = data?.images?.[0]?.url;
  if (!imageUrl) throw new Error("FLUX画像生成: URLが返却されませんでした");
  return imageUrl;
}

// 背景生成 → og-infographicページで文字合成 → Supabase Storageへのアップロードまでを一括で行う
export async function createInfographic(data: InfographicData): Promise<string | null> {
  try {
    const backgroundUrl = await generateBackgroundUrl(data.companyName);

    const params = new URLSearchParams({
      companyName: data.companyName,
      backgroundUrl,
      listingDate: data.listingDate,
      exchange: data.exchange,
      ticker: data.ticker,
      revenue: data.revenue,
      profit: data.profit,
      underwriter: data.underwriter,
    });

    const ogRes = await fetch(`${APP_URL}/api/og-infographic?${params.toString()}`, {
      signal: AbortSignal.timeout(30000),
    });

    if (!ogRes.ok) {
      const err = await ogRes.text();
      throw new Error(`文字合成エラー: ${err.slice(0, 200)}`);
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