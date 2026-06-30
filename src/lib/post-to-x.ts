import { TwitterApi } from "twitter-api-v2";

export async function postToX(text: string): Promise<{ success: boolean; error?: string }> {
  try {
    const client = new TwitterApi({
      appKey: process.env.X_API_KEY!,
      appSecret: process.env.X_API_SECRET!,
      accessToken: process.env.X_ACCESS_TOKEN!,
      accessSecret: process.env.X_ACCESS_SECRET!,
    });

    await client.v2.tweet(text);
    return { success: true };
  } catch (e: any) {
    console.error("X投稿エラー:", e?.message);
    return { success: false, error: e?.message };
  }
}