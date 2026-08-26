import { generateWithGemini } from "./gemini";
import { FeedHeadline } from "./rss-feeds";

const STYLE_GUIDE = `
# 文体ルール(厳守)
- 「です・ます」「である」調は使わない。体言止め・IR速報風のレポート様式で統一する
- タイトル・見出し・箇条書きには番号や記号(▼①②③・など)を付けて項目立てする
- 絵文字マーカー(📣📝▼など)を要所に使う
- 意味段落のまとまりごとに改行・一行空けを入れ、詰め込みすぎない
- - 全体で1000〜1500文字程度で、背景・根拠・数値・今後の見通しまで具体的に書き込む
- URLは含めない
- 見本のイメージ:「6273 SMC [決算]」→「📣半導体需要回復で大幅増収増益」→「📝売上高2,709億円(+35.4%)」のような形式
`;

interface ThemeConfig {
  number: number;
  label: string;
  angleInstruction: string;
  includeProfileLinkCTA: boolean;
}

export const RSS_THEMES: ThemeConfig[] = [
  {
    number: 4,
    label: "旬の業種・テーマ特集",
    angleInstruction:
      "見出しの中で頻出しているキーワード(業種名・技術名など)を1つ選び、なぜ今そのテーマが注目されているのかを解説する投稿を作成してください。",
    includeProfileLinkCTA: false,
  },
  {
    number: 5,
    label: "セクター別の資金流入",
    angleInstruction:
      "AIインフラ・半導体・防衛・エネルギー転換など、どのセクターに投資資金が向かっているかというテーマで投稿を作成してください。",
    includeProfileLinkCTA: false,
  },
  {
    number: 6,
    label: "地域別の資金移動",
    angleInstruction:
      "新興国からの資金流出/流入、米国一極集中の動向など、地域間の資金移動というテーマで投稿を作成してください。",
    includeProfileLinkCTA: false,
  },
  {
    number: 7,
    label: "投資家層の動き",
    angleInstruction:
      "ソブリンウェルスファンド、VC資金調達額の増減、機関投資家のポートフォリオ変化など、投資家層の動きというテーマで投稿を作成してください。",
    includeProfileLinkCTA: false,
  },
  {
    number: 8,
    label: "マクロの節目",
    angleInstruction:
      "利上げ/利下げ観測と資金フローの関係など、マクロ経済の節目というテーマで投稿を作成してください。",
    includeProfileLinkCTA: false,
  },
];

function buildHeadlinesBlock(headlines: FeedHeadline[]): string {
  return headlines
    .map((h) => `- [${h.source}] ${h.title}: ${h.summary}`)
    .join("\n");
}

export interface ThemedPostResult {
  content: string;
  sourceLinks: { title: string; url: string; source: string }[];
}

export async function generateThemedPost(
  theme: ThemeConfig,
  headlines: FeedHeadline[]
): Promise<ThemedPostResult> {
  const numberedHeadlines = headlines.map((h, i) => `${i + 1}. [${h.source}] ${h.title}: ${h.summary}`).join("\n");

  const prompt = `
あなたは日本の個人投資家向けメディアの編集者です。以下の海外ニュース見出し一覧から関連性の高いものを選び、テーマに沿った日本語のX(旧Twitter)投稿を1本作成してください。

# テーマ
${theme.angleInstruction}

# 参考ニュース見出し(英語。内容を読み取り、日本語で独自にまとめ直すこと。原文の直訳・引用はしないこと。各見出しの先頭の番号を後で参照に使います)
${numberedHeadlines}

${STYLE_GUIDE}

${theme.includeProfileLinkCTA ? "\n投稿の最後に「プロフィール欄のリンクから」等の一文をさりげなく加えてください。" : ""}

出力はJSON形式のみとしてください。マークダウン・前置き・説明は一切不要です。
{"content": "投稿文本体", "used_indices": [実際に参照した見出しの番号を配列で。例:[1,3,5]]}
`;

  const raw = await generateWithGemini(prompt);
  try {
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    const usedIndices: number[] = Array.isArray(parsed.used_indices) ? parsed.used_indices : [];
    const sourceLinks = usedIndices
      .map(i => headlines[i - 1])
      .filter(Boolean)
      .map(h => ({ title: h.title, url: (h as any).url ?? "", source: h.source }));
    return { content: parsed.content ?? raw, sourceLinks };
  } catch {
    // JSONとして解析できなかった場合(出力が長さ制限で途中で切れた場合など)、
    // 生のJSON断片("content":"...)がそのまま画面に表示されてしまわないよう、
    // "content"キーの値部分だけを正規表現で救出する
    const match = raw.match(/"content"\s*:\s*"([\s\S]*)/);
    const rescued = match
      ? match[1].replace(/\\n/g, "\n").replace(/\\"/g, '"')
      : raw;
    return { content: rescued, sourceLinks: [] };
  }
}

import { createClient } from "@supabase/supabase-js";

const supabaseForThemes = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// テーマ②: IPOカレンダー(自社DB由来)
export async function generateIpoCalendarPost(): Promise<ThemedPostResult | null> {
  const today = new Date();
  const twoWeeksLater = new Date();
  twoWeeksLater.setDate(today.getDate() + 14);

  const { data, error } = await supabaseForThemes
    .from("ipo_companies")
    .select("ticker, name, exchange, sector, biz_type, listing_date, price_range_min, price_range_max")
    .gte("listing_date", today.toISOString().split("T")[0])
    .lte("listing_date", twoWeeksLater.toISOString().split("T")[0])
    .order("listing_date", { ascending: true });

  if (error || !data || data.length === 0) {
    console.error("IPOカレンダー取得失敗またはデータなし:", error);
    return null;
  }

  const listBlock = data
    .map((c) => {
      const price =
        c.price_range_min && c.price_range_max
          ? `想定価格帯${c.price_range_min}〜${c.price_range_max}円`
          : "価格未定";
      return `- ${c.name}(${c.ticker || "コード未定"}・${c.exchange || ""}・${c.sector || c.biz_type || "業種不明"}) 上場日:${c.listing_date} ${price}`;
    })
    .join("\n");

  const prompt = `
あなたは日本の個人投資家向けメディアの編集者です。以下は今後2週間以内に上場予定のIPO銘柄一覧です。この情報をもとに、X(旧Twitter)投稿を1本作成してください。

# 今後のIPOカレンダー
${listBlock}

# 文体ルール(厳守)
- 「です・ます」「である」調は使わない。体言止め・IR速報風のレポート様式で統一する
- タイトル・見出し・箇条書きには番号や記号(▼①②③・など)を付けて項目立てする
- 絵文字マーカー(📣📝▼など)を要所に使う
- 意味段落のまとまりごとに改行・一行空けを入れ、詰め込みすぎない
- - 全体で1000〜1500文字程度で、背景・根拠・数値・今後の見通しまで具体的に書き込む
- URLは含めない
- 投稿の最後に「プロフィール欄のリンクから」等の一文をさりげなく加えてください

投稿文のみを出力してください。前置きや説明は不要です。
`;

const content = await generateWithGemini(prompt);
const sourceLinks = data.map((c: any) => ({
  title: c.name,
  url: `https://ipo.finance-tower.com/analysis/${c.id}`,
  source: "自社DB",
}));
return { content, sourceLinks };
}

const EDINET_KEY_FOR_THEMES = process.env.EDINET_API_KEY!;

async function fetchEdinetDocumentsForThemes(date: string) {
  const url = `https://api.edinet-fsa.go.jp/api/v2/documents.json?date=${date}&type=2&Subscription-Key=${EDINET_KEY_FOR_THEMES}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data?.results ?? [];
}

// テーマ①: 大量保有報告書ウォッチ(EDINET由来、docTypeCode=350)
export async function generateLargeHoldingsPost(): Promise<ThemedPostResult | null> {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const dates = [
    today.toISOString().slice(0, 10),
    yesterday.toISOString().slice(0, 10),
  ];

  // 2日分のEDINET取得は互いに独立しているため、順番に待たず並行で取得する
  const docsByDate = await Promise.all(dates.map((date) => fetchEdinetDocumentsForThemes(date)));
  const allReports: any[] = docsByDate.flatMap((docs) => docs.filter((d: any) => d.docTypeCode === "350"));

  if (allReports.length === 0) {
    return null;
  }

  // 最大10件までに絞る(情報量が多すぎるとGeminiの出力が散漫になるため)
  const sample = allReports.slice(0, 10);

  const listBlock = sample
    .map(
      (d) =>
        `- 提出者:${d.filerName || "不明"} / 対象銘柄コード:${d.subjectEdinetCode || d.secCode || "不明"} / 提出日:${d.submitDateTime || ""} / 概要:${d.docDescription || ""}`
    )
    .join("\n");

  const prompt = `
あなたは日本の個人投資家向けメディアの編集者です。以下は本日〜前日にEDINETへ提出された「大量保有報告書」の一覧です。この中から特に個人投資家の関心を引きそうな1〜2件を選び、X(旧Twitter)投稿を1本作成してください。

# 大量保有報告書の提出情報
${listBlock}

# 注意事項
- 対象銘柄コードが不明な場合や情報が乏しい場合は、提出者名や概要から分かる範囲で言及してください
- 保有割合や取得目的など、記載がない情報を憶測で書かないでください

# 文体ルール(厳守)
- 「です・ます」「である」調は使わない。体言止め・IR速報風のレポート様式で統一する
- タイトル・見出し・箇条書きには番号や記号(▼①②③・など)を付けて項目立てする
- 絵文字マーカー(📣📝▼など)を要所に使う
- 意味段落のまとまりごとに改行・一行空けを入れ、詰め込みすぎない
- - 全体で1000〜1500文字程度で、背景・根拠・数値・今後の見通しまで具体的に書き込む
- URLは含めない

投稿文のみを出力してください。前置きや説明は不要です。
`;

const content = await generateWithGemini(prompt);
const sourceLinks = sample.map((d: any) => ({
  title: d.filerName || "不明",
  url: `https://disclosure2.edinet-fsa.go.jp/`,
  source: "EDINET",
}));
return { content, sourceLinks };
}

// テーマ③: 週内の重要経済指標カレンダー(自社DB由来)
export async function generateEconomicCalendarPost(): Promise<ThemedPostResult | null> {
    const today = new Date();
    const oneWeekLater = new Date();
    oneWeekLater.setDate(today.getDate() + 7);
  
    const { data, error } = await supabaseForThemes
      .from("economic_events")
      .select("event_date, event_type, label")
      .gte("event_date", today.toISOString().split("T")[0])
      .lte("event_date", oneWeekLater.toISOString().split("T")[0])
      .order("event_date", { ascending: true });
  
    if (error || !data || data.length === 0) {
      console.error("経済指標カレンダー取得失敗またはデータなし:", error);
      return null;
    }
  
    const listBlock = data
      .map((e) => `- ${e.event_date} ${e.event_type}:${e.label}`)
      .join("\n");
  
    const prompt = `
  あなたは日本の個人投資家向けメディアの編集者です。以下は今週(7日以内)に予定されている重要経済指標・イベントの一覧です。この情報をもとに、X(旧Twitter)投稿を1本作成してください。
  
  # 今週の経済指標カレンダー
  ${listBlock}
  
  # 記載のポイント
  - 各イベントが株式相場にどう影響しうるか、一般的な知識をもとに一言添えてください(記載のない詳細な数値予想などは書かないこと)
  - 個人投資家が「今週、何に注目すればいいか」がひと目で分かるようにしてください
  
  # 文体ルール(厳守)
  - 「です・ます」「である」調は使わない。体言止め・IR速報風のレポート様式で統一する
  - タイトル・見出し・箇条書きには番号や記号(▼①②③・など)を付けて項目立てする
  - 絵文字マーカー(📣📝▼など)を要所に使う
  - 意味段落のまとまりごとに改行・一行空けを入れ、詰め込みすぎない
  - - 全体で1000〜1500文字程度で、背景・根拠・数値・今後の見通しまで具体的に書き込む
  - URLは含めない
  
  投稿文のみを出力してください。前置きや説明は不要です。
  `;
  
  const content = await generateWithGemini(prompt);
  const sourceLinks: { title: string; url: string; source: string }[] = [];
  return { content, sourceLinks };
}
