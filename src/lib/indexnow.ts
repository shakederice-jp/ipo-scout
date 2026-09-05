// 2026/9/5追加: IndexNow(Bing・Yandex等が対応する即時インデックス登録の仕組み)。
// 新しい分析ページを公開・更新したタイミングでURLを通知することで、
// 通常のクロール待ちより早く検索エンジンに認識してもらうのが狙い。
// 注意: Googleはこの仕組みに参加していない(2026年時点)。あくまでBing・Yandex等、
// 対応している検索エンジン向けの補助的な施策で、Google対策の代わりにはならない。
//
// キーファイル(public/直下の●●.txt、中身はキー文字列そのもの)を事前に設置しておく
// 必要がある。https://www.bing.com/indexnow で発行したキーではなく、今回は
// ランダムな32桁の16進文字列を独自に生成して使っている(IndexNow仕様上、発行元は問わない)。
const INDEXNOW_KEY = "f9f89f83906d0db7dc761119d834ea00";
const SITE_HOST = "ipo.finance-tower.com";
const KEY_LOCATION = `https://${SITE_HOST}/${INDEXNOW_KEY}.txt`;

/**
 * 指定したURL(最大10,000件、通常は数件〜数十件程度を想定)をIndexNowに通知する。
 * 失敗しても呼び出し元の処理(分析結果の保存など)を止めないよう、常に例外を握りつぶす
 * fire-and-forget方式にしている。
 */
export async function pingIndexNow(urls: string[]): Promise<void> {
  const validUrls = urls.filter(Boolean);
  if (validUrls.length === 0) return;

  try {
    await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: SITE_HOST,
        key: INDEXNOW_KEY,
        keyLocation: KEY_LOCATION,
        urlList: validUrls,
      }),
      // 通知が多少遅れても実害は無いため、短めのタイムアウトで諦める
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.error("IndexNow通知に失敗(処理は継続):", err);
  }
}
