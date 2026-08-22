import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import path from "path";
import fs from "fs";

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
async function generateBackground(companyName: string): Promise<Buffer> {
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

  const imgRes = await fetch(imageUrl);
  const arrayBuffer = await imgRes.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// 背景画像の上に、正確な文字(銘柄名・数値)をSVGテキストとして焼き込む
function buildTextOverlaySvg(data: InfographicData): string {
  const fontPath = path.join(process.cwd(), "src/assets/fonts/NotoSansJP-Bold.ttf");
  const fontBase64 = fs.readFileSync(fontPath).toString("base64");

  const escape = (s: string) => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const rows = [
    { label: "上場日", value: data.listingDate || "未定" },
    { label: "市場", value: data.exchange || "不明" },
    { label: "コード", value: data.ticker || "未定" },
    { label: "売上", value: data.revenue || "不明" },
    { label: "利益", value: data.profit || "不明" },
    { label: "主幹事", value: data.underwriter || "未定" },
  ];

  const rowsSvg = rows.map((r, i) => {
    const y = 620 + i * 62;
    return `
      <rect x="80" y="${y - 34}" width="1040" height="50" rx="8" fill="rgba(255,255,255,0.92)"/>
      <text x="110" y="${y}" font-family="NotoSansJPBold" font-size="26" fill="#1E3A66">${escape(r.label)}</text>
      <text x="320" y="${y}" font-family="NotoSansJPBold" font-size="26" fill="#0D1B33">${escape(r.value)}</text>
    `;
  }).join("");

  return `
    <svg width="1200" height="1200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          @font-face {
            font-family: "NotoSansJPBold";
            src: url(data:font/ttf;base64,${fontBase64}) format("truetype");
          }
        </style>
      </defs>
      <rect x="0" y="0" width="1200" height="140" fill="rgba(30,58,102,0.88)"/>
      <text x="60" y="90" font-family="NotoSansJPBold" font-size="52" fill="#F5F4EF">${escape(data.companyName)}</text>
      <text x="60" y="130" font-family="NotoSansJPBold" font-size="24" fill="#B31942">新規IPO承認</text>
      ${rowsSvg}
    </svg>
  `;
}

// 背景生成 → 文字合成 → Supabase Storageへのアップロードまでを一括で行う
export async function createInfographic(data: InfographicData): Promise<string | null> {
  try {
    const background = await generateBackground(data.companyName);
    const overlaySvg = buildTextOverlaySvg(data);

    const finalImage = await sharp(background)
      .resize(1200, 1200)
      .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
      .png()
      .toBuffer();

    const supabase = getSupabase();
    const fileName = `${data.companyId}-${Date.now()}.png`;

    const { error: uploadError } = await supabase.storage
      .from("infographics")
      .upload(fileName, finalImage, { contentType: "image/png", upsert: true });

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