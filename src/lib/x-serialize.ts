// 2026/10/8新設: メールで届く投稿用原稿(新規IPO承認ドラフト・IPO再掲ドラフト・
// ロックアップ解除前の振り返り記事)を、長文の場合だけ3〜4回の連載に機械的に分割し、
// 各回に「Xの投稿画面を、原稿入力済みの状態で開くリンク」を付けるための共通処理。
//
// https://x.com/intent/post?text=... はXの公式な投稿作成画面を開くリンクで、押すと
// そのテキストが入力済みの状態でXの投稿画面(ブラウザ/アプリ)が開く。新たなAPI呼び出し・
// AI生成は一切発生しないため、費用は増えない(メールのhtml内にただのリンクを1本増やすだけ)。
//
// 原稿が長いとリンク自体も長くなる。実際にスマホ・パソコンで開けるかは実装後に要確認
// (2026/10/7のメモで指摘済みの注意点)。

const SPLIT_THRESHOLD = 800; // これを超える場合だけ分割する(自動投稿の本文量の基準と同じ)
const MAX_PART_CHARS = 800; // 1回あたりの目安上限
const MAX_PARTS = 4;

export interface SeriesPart {
  index: number; // 1始まり
  total: number;
  text: string; // 実際に投稿する本文(連載見出し・続き誘導を含む)
  postUrl: string; // Xの投稿画面を原稿入力済みで開くリンク
}

function buildPostUrl(text: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
}

// 空行区切りの段落を、1回あたりMAX_PART_CHARSに収まるようグループ化する。
// 1段落だけでMAX_PART_CHARSを超える場合は、文の途中で無理に切らずその段落だけで1回分とする。
function groupParagraphs(paragraphs: string[]): string[] {
  const parts: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    const candidate = current ? `${current}\n\n${p}` : p;
    if (current && candidate.length > MAX_PART_CHARS && parts.length < MAX_PARTS - 1) {
      parts.push(current);
      current = p;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);
  return parts.length > 0 ? parts : [paragraphs.join("\n\n")];
}

// 原稿を、必要なら3〜4分割し、各回の投稿文(連載見出し・続き誘導付き)とXの投稿画面リンクを返す。
// 800字以下ならそのまま1回分として返す(連載見出しは付けない)。
export function serializeForX(rawText: string, companyLabel?: string | null): SeriesPart[] {
  const text = rawText.trim();
  if (text.length <= SPLIT_THRESHOLD) {
    return [{ index: 1, total: 1, text, postUrl: buildPostUrl(text) }];
  }

  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const grouped = groupParagraphs(paragraphs.length > 1 ? paragraphs : [text]).slice(0, MAX_PARTS);
  const total = grouped.length;
  const label = companyLabel ? `【${companyLabel}】` : "";

  return grouped.map((body, i) => {
    const index = i + 1;
    const header = `${label}連載 ${index}/${total}`;
    const footer = index < total ? `\n\n▶続きは次の投稿(${index + 1}/${total})で` : "";
    const full = `${header}\n${body}${footer}`;
    return { index, total, text: full, postUrl: buildPostUrl(full) };
  });
}

// メール本文(notifyAdmin()の<pre>要素内に埋め込むプレーンテキスト)として、各回の本文+
// 「この原稿で投稿する」リンクを並べたHTML断片を作る。<pre>要素の中でも<a>タグは通常どおり
// クリック可能なリンクとして表示される(エスケープしていないnotifyAdmin()の既存仕様を利用)。
// 本文そのものもそのまま表示されるため、従来通り手動コピーして使うこともできる。
export function renderSeriesForEmail(parts: SeriesPart[]): string {
  return parts
    .map((p) => {
      const label = p.total > 1 ? `(${p.index}/${p.total})` : "";
      return `${p.text}\n\n𝕏 この原稿で投稿する${label} → <a href="${p.postUrl}">このリンクを開く</a>`;
    })
    .join(`\n\n${"─".repeat(10)}\n\n`);
}
