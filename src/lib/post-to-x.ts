import { TwitterApi } from "twitter-api-v2";

// 2026/9/19追加: 自動投稿の記録(market_trends.x_post_id等)に使うため、投稿できたツイートの
// idも返すように拡張した。既存の呼び出し元(test-x-post等)はidを無視するだけで動作に影響なし。
export async function postToX(text: string): Promise<{ success: boolean; error?: string; id?: string }> {
  try {
    const client = new TwitterApi({
      appKey: process.env.X_API_KEY!,
      appSecret: process.env.X_API_SECRET!,
      accessToken: process.env.X_ACCESS_TOKEN!,
      accessSecret: process.env.X_ACCESS_SECRET!,
    });

    const res = await client.v2.tweet(text);
    return { success: true, id: res?.data?.id };
  } catch (e: any) {
    console.error("X投稿エラー:", e?.message);
    console.error("X投稿エラー詳細:", JSON.stringify(e?.data ?? e?.errors ?? {}, null, 2));
    console.error("使用したAPIキー先頭4文字:", process.env.X_API_KEY?.slice(0, 4));
    console.error("使用したAPISecret先頭4文字:", process.env.X_API_SECRET?.slice(0, 4));
    console.error("使用したAccessToken先頭10文字:", process.env.X_ACCESS_TOKEN?.slice(0, 10));
    console.error("使用したAccessSecret先頭4文字:", process.env.X_ACCESS_SECRET?.slice(0, 4));
    return { success: false, error: e?.message };
  }
}