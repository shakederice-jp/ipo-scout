import { generateWithGemini } from "./gemini";

// ===== 2026/10/18新設: BB開始・上場・申込開始などのお知らせメール(週次通知・前日通知)の「銘柄の紹介文」 =====
// 以前は ai_summary(トップページ掲載用・120字以内)をそのまま表示していたため、短すぎて
// 「IPO銘柄の魅力が伝わらず、分析ページを見てみたい気持ちが湧かない」とのご指摘があった。
// ai_summaryはサイトの他の場所(トップ・カレンダー・画像の引用)でも使うため変更せず、メール専用に
// 300〜500字の紹介文を別に作る(魅力2つ+気をつけたい点1つ+「続きは分析ページで」へつなぐ問いかけ)。
// AIが使えない・時間切れの場合は、分析で作ってある紹介文(appeal_narrative)を文の切れ目で切って使う。

export interface BlurbCompany {
  id: string;
  name: string;
  ai_summary?: string | null;
  analysis_summary?: any;
}

const MAX_CHARS = 500;

function cutAtSentence(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const idx = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("?"), cut.lastIndexOf("？"), cut.lastIndexOf("!"), cut.lastIndexOf("！"));
  return idx > 150 ? cut.slice(0, idx + 1) : cut;
}

// AIが使えないときの予備: 分析で作ってある紹介文(appeal_narrative)→insights→ai_summary の順
export function fallbackBlurb(co: BlurbCompany): string | null {
  const s = co.analysis_summary ?? {};
  const narrative: string = typeof s.appeal_narrative === "string" ? s.appeal_narrative : "";
  if (narrative.trim().length >= 100) return cutAtSentence(narrative, MAX_CHARS);
  const insights: string[] = Array.isArray(s.insights) ? s.insights.map((i: any) => String(i?.body ?? "")).filter(Boolean) : [];
  if (insights.length > 0) return cutAtSentence(insights.slice(0, 2).join("\n\n"), MAX_CHARS);
  return co.ai_summary ?? null;
}

function buildPrompt(co: BlurbCompany): string {
  const s = co.analysis_summary ?? {};
  const narrative: string = typeof s.appeal_narrative === "string" ? s.appeal_narrative : "";
  const insights: string[] = Array.isArray(s.insights)
    ? s.insights.slice(0, 3).map((i: any) => `・${String(i?.title ?? "")}: ${String(i?.body ?? "")}`.slice(0, 400))
    : [];
  return `
あなたは、日本の個人投資家向けIPO分析サイト「大手町調査室九課」の編集者です。メールで届ける「銘柄の紹介文」を書いてください。読んだ人が「分析ページを見てみたい」と思える内容にします。

# 銘柄
${co.name}

# 材料
一言要約: ${co.ai_summary ?? "(なし)"}

分析で作った紹介文:
${narrative || "(なし)"}

分析の要点:
${insights.join("\n") || "(なし)"}

# 書き方のルール(厳守)
- 全体で300〜500文字。段落ごとに空行を入れて読みやすくする(2〜3段落)
- 「です・ます」調。読者への問いかけや語りかけを入れる
- 「注目したい点」を2つ、「気をつけたい点」を1つ、必ず含める
- 最後の1〜2文は、続きが気になる問いかけで締める(「詳しい分析は下のボタンから」につながる流れ。URLは書かない)
- 一文の中の読点「、」は1つまで。項目を並べるときは「・」を使う
- 「確実」「必ず」「絶対」「最高」「最大級」「圧倒的」など、断定・最上級の表現は使わない
- 材料にない数字や事実は書かない。金額の単位(円・億円・百万円)は、材料のとおりに写す
- 業績の金額(売上・赤字・黒字など)は、紹介文や要点で裏付けが取れるものだけ使う。「一言要約」の金額に単位の誤りが混じっていることがあるため、迷う場合は金額を書かず、「赤字幅が縮小」「売上が伸びている」のように方向だけを書く
- 「未定」「不明」という言葉は使わない。分からない項目には触れない
- 個別銘柄への売買助言(「買うべき」「今が売り時」等)は書かない
- 見出し・記号・絵文字・ハッシュタグは付けない。本文だけを書く

本文のみを出力してください。前置きや説明は不要です。
`;
}

async function generateBlurb(co: BlurbCompany): Promise<string | null> {
  try {
    const out = (await generateWithGemini(buildPrompt(co))).trim();
    if (out.length >= 150) return cutAtSentence(out, MAX_CHARS + 40);
  } catch (e) {
    console.error(`紹介文の生成に失敗(${co.name}):`, e);
  }
  return fallbackBlurb(co);
}

// 通知メールに載せる銘柄ぶんの紹介文を、まとめて(同時に最大5件ずつ)作る。
// cronの実行時間(60秒)に収めるため、全体で25秒を過ぎたら、できた分だけ使う(残りは呼び出し側が ai_summary にする)。
export async function buildBlurbs(companies: BlurbCompany[], overallTimeoutMs = 25000): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const unique = Array.from(new Map(companies.map((c) => [c.id, c])).values());
  let next = 0;
  const worker = async () => {
    while (next < unique.length) {
      const co = unique[next++];
      const text = await generateBlurb(co);
      if (text) result.set(co.id, text);
    }
  };
  const all = Promise.all(Array.from({ length: Math.min(5, unique.length) }, worker));
  await Promise.race([all, new Promise((resolve) => setTimeout(resolve, overallTimeoutMs))]);
  return result;
}
