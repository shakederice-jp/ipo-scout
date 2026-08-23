import { createClient } from "@supabase/supabase-js";
import { ImageResponse } from "@vercel/og";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const FAL_KEY = process.env.FAL_KEY!;

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

// 背景生成 → @vercel/ogで正確な文字を重ねて画像化 → Supabase Storageへのアップロードまでを一括で行う
export async function createInfographic(data: InfographicData): Promise<string | null> {
  try {
    const backgroundUrl = await generateBackgroundUrl(data.companyName);

    const fontPath = path.join(process.cwd(), "src/assets/fonts/NotoSansJP-Bold.ttf");
    const fontData = fs.readFileSync(fontPath);

    const rows = [
      { label: "上場日", value: data.listingDate || "未定" },
      { label: "市場", value: data.exchange || "不明" },
      { label: "コード", value: data.ticker || "未定" },
      { label: "売上", value: data.revenue || "不明" },
      { label: "利益", value: data.profit || "不明" },
      { label: "主幹事", value: data.underwriter || "未定" },
    ];

    const imageResponse = new ImageResponse(
      (
        {
          type: "div",
          props: {
            style: {
              width: "1200px",
              height: "1200px",
              display: "flex",
              flexDirection: "column",
              position: "relative",
              backgroundImage: `url(${backgroundUrl})`,
              backgroundSize: "cover",
              fontFamily: "NotoSansJP",
            },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    width: "100%",
                    padding: "40px 60px",
                    backgroundColor: "rgba(30,58,102,0.88)",
                  },
                  children: [
                    {
                      type: "div",
                      props: { style: { fontSize: 52, color: "#F5F4EF" }, children: data.companyName },
                    },
                    {
                      type: "div",
                      props: { style: { fontSize: 24, color: "#B31942", marginTop: 8 }, children: "新規IPO承認" },
                    },
                  ],
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    padding: "60px",
                    marginTop: "auto",
                    marginBottom: "60px",
                  },
                  children: rows.map((r) => ({
                    type: "div",
                    props: {
                      style: {
                        display: "flex",
                        backgroundColor: "rgba(255,255,255,0.92)",
                        borderRadius: "8px",
                        padding: "14px 24px",
                        fontSize: 26,
                      },
                      children: [
                        { type: "div", props: { style: { color: "#1E3A66", width: "180px" }, children: r.label } },
                        { type: "div", props: { style: { color: "#0D1B33" }, children: r.value } },
                      ],
                    },
                  })),
                },
              },
            ],
          },
        }
      ) as any,
      {
        width: 1200,
        height: 1200,
        fonts: [
          { name: "NotoSansJP", data: fontData, style: "normal", weight: 700 },
        ],
      }
    );

    const finalBuffer = Buffer.from(await imageResponse.arrayBuffer());

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