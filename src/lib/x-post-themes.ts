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