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
    console.error("X投稿エラー詳細:", JSON.stringify(e?.data ?? e?.errors ?? {}, null, 2));
    console.error("使用したAPIキー先頭4文字:", process.env.X_API_KEY?.slice(0, 4));
    console.error("使用したAccessToken先頭10文字:", process.env.X_ACCESS_TOKEN?.slice(0, 10));
    return { success: false, error: e?.message };
  }
}