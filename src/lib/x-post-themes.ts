import { generateWithGemini } from "./gemini";
import { FeedHeadline } from "./rss-feeds";

const STYLE_GUIDE = `
# 文体ルール(厳守)
- 「です・ます」「である」調は使わない。体言止め・IR速報風のレポート様式で統一する
- タイトル・見出し・箇条書きには番号や記号(▼①②③・など)を付けて項目立てする
- 絵文字マーカー(📣📝▼など)を要所に使う
- 意味段落のまとまりごとに改行・一行空けを入れ、詰め込みすぎない
- 全体で120〜300文字程度に収める
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

export async function generateThemedPost(
  theme: ThemeConfig,
  headlines: FeedHeadline[]
): Promise<string> {
  const prompt = `
あなたは日本の個人投資家向けメディアの編集者です。以下の海外ニュース見出し一覧から関連性の高いものを選び、テーマに沿った日本語のX(旧Twitter)投稿を1本作成してください。

# テーマ
${theme.angleInstruction}

# 参考ニュース見出し(英語。内容を読み取り、日本語で独自にまとめ直すこと。原文の直訳・引用はしないこと)
${buildHeadlinesBlock(headlines)}

${STYLE_GUIDE}

${theme.includeProfileLinkCTA ? "\n投稿の最後に「プロフィール欄のリンクから」等の一文をさりげなく加えてください。" : ""}

投稿文のみを出力してください。前置きや説明は不要です。
`;

  return generateWithGemini(prompt);
}

import { createClient } from "@supabase/supabase-js";

const supabaseForThemes = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// テーマ②: IPOカレンダー(自社DB由来)
export async function generateIpoCalendarPost(): Promise<string | null> {
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
- 全体で120〜300文字程度に収める
- URLは含めない
- 投稿の最後に「プロフィール欄のリンクから」等の一文をさりげなく加えてください

投稿文のみを出力してください。前置きや説明は不要です。
`;

  return generateWithGemini(prompt);
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
export async function generateLargeHoldingsPost(): Promise<string | null> {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const dates = [
    today.toISOString().slice(0, 10),
    yesterday.toISOString().slice(0, 10),
  ];

  const allReports: any[] = [];
  for (const date of dates) {
    const docs = await fetchEdinetDocumentsForThemes(date);
    const largeHoldings = docs.filter((d: any) => d.docTypeCode === "350");
    allReports.push(...largeHoldings);
  }

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
- 全体で120〜300文字程度に収める
- URLは含めない

投稿文のみを出力してください。前置きや説明は不要です。
`;

  return generateWithGemini(prompt);
}