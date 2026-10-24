import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { generateWithGemini } from "./gemini";
import { ADMIN_EMAIL, MAIL_FROM, escapeHtml } from "./notify-admin";
import { xIntentUrl } from "./x-serialize";
import { appendCampaignTail, createXShortLink } from "./x-short-link";

// ===== 2026/10/18新設: X投稿を「API投稿」から「メール送信方式」に切り替えるための共通部品 =====
// X API経由の自動投稿は費用がかかるため、投稿用の原稿はすべてマイケルさん宛のメールで届け、
// マイケルさんが「この原稿で投稿する」ボタン(Xの投稿画面が原稿入りで開く)から投稿する方式にした。
// このファイルは、メールの共通の型(件名・本文・投稿ボタン)、投稿文の整形(300〜500字・語りかけ口調)、
// 投稿文に付けるリンク(銘柄ページ or 関連ページ+utm)を担当する。呼び出し元は
// src/lib/x-auto-post.ts(朝6時・夕16時の送信)。
//
// 件数が重なる場合は1通にまとめず、1件につき1通で送る(2026/10/18のご要望)。件名には種類と
// タイトルを入れ、受信箱で一瞥して内容が分かるようにしてある。

const resend = new Resend(process.env.RESEND_API_KEY);

export const SITE_URL = "https://ipo.finance-tower.com";

const supabaseForEmail = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type EmailSlot = "morning" | "evening";

export const SLOT_LABEL: Record<EmailSlot, string> = {
  morning: "朝6時の便",
  evening: "夕16時の便",
};

// ---------- リンク(X経由と分かる印=utmを付ける) ----------

// 例: withXUtm("https://ipo.finance-tower.com/lockup", "lockup") → ...?utm_source=x&utm_medium=social&utm_campaign=lockup
export function withXUtm(url: string, campaign: string): string {
  const [base, hash] = url.split("#");
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}utm_source=x&utm_medium=social&utm_campaign=${encodeURIComponent(campaign)}${hash ? `#${hash}` : ""}`;
}

// 分析ページのURLは証券コード(ticker)ベースが正。idしか分からない場合はDBでtickerを引く。
export async function lookupTicker(idOrTicker: string): Promise<string> {
  try {
    const byTicker = await supabaseForEmail.from("ipo_companies").select("ticker").eq("ticker", idOrTicker).maybeSingle();
    if (byTicker.data?.ticker) return byTicker.data.ticker;
    const byId = await supabaseForEmail.from("ipo_companies").select("ticker").eq("id", idOrTicker).maybeSingle();
    if (byId.data?.ticker) return byId.data.ticker;
  } catch {
    // 引けなくてもidのまま進める(分析ページはidでも開ける)
  }
  return idOrTicker;
}

export async function lookupTickerByName(name: string): Promise<string | null> {
  try {
    const { data } = await supabaseForEmail.from("ipo_companies").select("ticker, id").eq("name", name).limit(1).maybeSingle();
    if (data) return data.ticker || data.id || null;
  } catch {
    // 見つからなければnull
  }
  return null;
}

export function extractSingleCompanyId(
  sourceLinks: { title: string; url: string; source: string }[] | null | undefined
): string | null {
  if (!sourceLinks || sourceLinks.length !== 1) return null;
  const m = sourceLinks[0].url.match(/\/analysis\/([^/?#]+)/);
  return m ? m[1] : null;
}

export async function analysisUrlFor(slugOrId: string, campaign: string): Promise<string> {
  const ticker = await lookupTicker(slugOrId);
  return withXUtm(`${SITE_URL}/analysis/${encodeURIComponent(ticker)}`, campaign);
}

// ---------- 記事の種類(件名・リンク先の振り分け) ----------

export interface TrendKind {
  label: string; // 件名・見出しに入れる種類名
  campaign: string; // utm_campaign
  page: "company" | "lockup" | "results" | "schedule" | "how-to-apply" | "glossary";
}

export function classifyTrend(title: string): TrendKind {
  const t = title;
  if (t.startsWith("直近のIPO銘柄に関する新情報")) return { label: "直近IPOの新情報", campaign: "ipo-news", page: "company" };
  if (t.startsWith("初値・その後の値動き")) {
    if (t.includes("ロックアップ")) return { label: "ロックアップ解除前の振り返り", campaign: "lockup", page: "lockup" };
    return { label: "初値の答え合わせ", campaign: "results", page: "results" };
  }
  if (t.startsWith("ロックアップ解除カウントダウン")) return { label: "ロックアップ解除カウントダウン", campaign: "lockup", page: "lockup" };
  if (t.startsWith("ロックアップ解除カレンダー")) return { label: "ロックアップ解除カレンダー", campaign: "lockup", page: "lockup" };
  if (t.startsWith("IPOカレンダー")) return { label: "IPOカレンダー", campaign: "schedule", page: "schedule" };
  if (t.startsWith("IPOスケジュール保存版まとめ")) return { label: "IPOスケジュールまとめ", campaign: "schedule", page: "schedule" };
  if (t.startsWith("週内の重要経済指標カレンダー")) return { label: "今週の経済指標", campaign: "schedule", page: "schedule" };
  if (t.startsWith("経済指標・イベント速報")) return { label: "経済指標速報", campaign: "schedule", page: "schedule" };
  if (t.startsWith("直近承認銘柄のスコア傾向")) return { label: "AIスコア傾向", campaign: "schedule", page: "schedule" };
  if (t.startsWith("IPO企業 vs 競合の決算比較")) return { label: "競合との決算比較", campaign: "competitor", page: "company" };
  if (t.startsWith("IPO投資ワンポイント講座")) return { label: "IPO投資ワンポイント", campaign: "tips", page: "how-to-apply" };
  if (t.startsWith("ビジネスモデル・ストーリー・競合との違い")) return { label: "深掘り連載", campaign: "deep-dive", page: "company" };
  return { label: "マーケットトレンド", campaign: "trends", page: "schedule" };
}

// 件名用の短いタイトル: 「種類(会社名・チェックポイント)」の括弧の中身を取り出す。無ければタイトルそのまま。
export function displayTitle(title: string): string {
  const m = title.match(/\(([^()]+)\)\s*$/);
  return m ? m[1] : title;
}

const PAGE_CTA: Record<TrendKind["page"], { path: string; cta: string }> = {
  company: { path: "", cta: "詳しい分析はこちら👇" },
  lockup: { path: "/lockup", cta: "ロックアップ解除日の一覧はこちら👇" },
  results: { path: "/results", cta: "初値と答え合わせの一覧はこちら👇" },
  schedule: { path: "/schedule", cta: "IPOスケジュールの一覧はこちら👇" },
  "how-to-apply": { path: "/how-to-apply", cta: "申込みの流れはこちら👇" },
  glossary: { path: "/glossary", cta: "用語の解説はこちら👇" },
};

// 記事1本分の「リンクURL+誘導の一言」を決める。
// 銘柄の話は銘柄ページ、ロックアップ→/lockup、初値の答え合わせ→/results、一般→/schedule・/how-to-apply・/glossary
export async function resolveTrendLink(
  kind: TrendKind,
  sourceLinks: { title: string; url: string; source: string }[] | null | undefined
): Promise<{ url: string; cta: string }> {
  if (kind.page === "company") {
    const id = extractSingleCompanyId(sourceLinks);
    if (id) return { url: await analysisUrlFor(id, kind.campaign), cta: PAGE_CTA.company.cta };
    return { url: withXUtm(`${SITE_URL}/schedule`, kind.campaign), cta: PAGE_CTA.schedule.cta };
  }
  const p = PAGE_CTA[kind.page];
  return { url: withXUtm(`${SITE_URL}${p.path}`, kind.campaign), cta: p.cta };
}

// ---------- 投稿文の整形(300〜500字・語りかけ口調) ----------

export const MIN_POST_CHARS = 300;
export const MAX_POST_CHARS = 500;

// 文字数を超えた場合は、文の切れ目(。?!)で切る。切れ目が前の方にしか無い場合はそのまま返す。
export function fitLength(text: string, max = MAX_POST_CHARS + 40): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const idx = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("?"), cut.lastIndexOf("？"), cut.lastIndexOf("!"), cut.lastIndexOf("！"));
  return idx > 200 ? cut.slice(0, idx + 1) : cut;
}

// メール用の文章ルール(サイト全体の文体ルール+2026/10/18のご要望)
export const EMAIL_POST_STYLE = `
# 書き方のルール(厳守)
- 全体で300〜500文字。短すぎず長すぎず、さっと読み切れる量にする
- 口調は「です・ます」調。読者への問いかけや語りかけを1〜2回入れる(例:「あなたはどう見ますか?」)。ただし煽らない
- 冒頭1行は、内容がひと目で分かる見出し(絵文字は先頭に1つまで)
- 続けて2〜3つの短い段落を、空行で区切って書く。1段落は2〜3文まで
- 最後の1〜2文は、続きが気になる問いかけで締め、「詳しくは分析サイトで」という流れにつなげる(URLそのものは書かない。システムが付ける)
- 一文の中の読点「、」は1つまで。項目を並べるときは「・」を使う
- 「確実」「必ず」「絶対」「最高」「最大級」「圧倒的」など、断定・最上級の表現は使わない
- 元の記事にない数字や事実を書かない。単位(円・億円・百万円)は元の記事のとおりに写す。確信が持てない数字は書かない
- 「未定」「不明」という言葉は使わない。分からない項目には触れない
- 個別銘柄への売買助言(「買うべき」「今が売り時」等)は書かない
- URL・ハッシュタグ・「プロフィール欄」への誘導は書かない
`;

export async function condenseForEmail(
  rawContent: string,
  ctx: { title: string; part?: { n: number; total: number }; extra?: string }
): Promise<string> {
  const partNote = ctx.part
    ? `\n- これは${ctx.part.total}回連載の${ctx.part.n}回目です。${ctx.part.n < ctx.part.total ? "最後は「続きは次の便で」と自然に匂わせる" : "最終回として、全体のまとめにも一言触れる"}\n`
    : "";
  const buildPrompt = (extra: string) => `
あなたは、日本の個人投資家向けIPO分析サイト「大手町調査室九課」の編集者です。以下の記事をもとに、X(旧Twitter)に貼り付けて、読者を分析サイトへ誘導するための投稿文を書いてください。

# 元の記事
タイトル: ${ctx.title}

${rawContent}

${EMAIL_POST_STYLE}${partNote}${ctx.extra ? `\n${ctx.extra}\n` : ""}${extra}
投稿文のみを出力してください。前置きや説明は不要です。
`;
  let out = (await generateWithGemini(buildPrompt(""))).trim();
  if (out.length < 250 || out.length > MAX_POST_CHARS + 120) {
    try {
      const retry = (await generateWithGemini(buildPrompt(`\n# 注意\n前回は${out.length}文字でした。必ず300〜500文字に収めて書き直してください。\n`))).trim();
      if (retry.length >= 200) out = retry;
    } catch {
      // 再試行に失敗したら1回目の結果を使う
    }
  }
  return fitLength(out);
}

// 投稿文(本文+誘導の一言+リンク+ハッシュタグ)を組み立てる
export function composePost(body: string, link: { url: string; cta: string }, hashtags: string): string {
  return `${body.trim()}\n\n${link.cta}\n${link.url}${hashtags ? `\n\n${hashtags}` : ""}`;
}

// ---------- メール送信 ----------

export interface XEmailItem {
  slot: EmailSlot;
  kindLabel: string; // 例: 新規IPO承認 / 初値の答え合わせ
  title: string; // 例: TOKIUM(664A) / かがやきHD・上場2日目
  postText: string; // リンク・ハッシュタグ込みの完成した投稿文
  linkUrl: string;
  imageUrl?: string | null;
  seriesLabel?: string | null; // 例: 連載 1/3
}

export async function sendXPostEmail(item: XEmailItem): Promise<{ ok: boolean; error?: string }> {
  // 2026/10/24(束B): ①原稿の末尾に友達紹介キャンペーンの案内(リンク)を足す ②メールのボタンは、原稿を保存した「短いリンク」(/x/xxxx)にする。
  //  (長い原稿だと、原稿ごと詰め込んだリンクがGmailで表示されないことがあったため。保存に失敗したら従来の長いリンクを使う)
  const finalText = appendCampaignTail(item.postText);
  const headline = `${item.kindLabel}｜${item.title}${item.seriesLabel ? `(${item.seriesLabel})` : ""}`;
  const shortUrl = await createXShortLink({ text: finalText, kind: item.kindLabel, title: `${item.title}${item.seriesLabel ? `(${item.seriesLabel})` : ""}`, imageUrl: item.imageUrl });
  const intent = xIntentUrl(finalText);
  const buttonUrl = shortUrl ?? intent;
  const count = finalText.length;
  const slotLabel = SLOT_LABEL[item.slot];
  const subject = `【X投稿用】${headline}`;
  const nowJst = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

  const imageBlock = item.imageUrl
    ? `
      <div style="margin:0 0 14px">
        <img src="${escapeHtml(item.imageUrl)}" alt="" style="max-width:100%;border-radius:8px;border:1px solid #e2e8f0" />
        <p style="margin:6px 0 0;font-size:11px;color:#64748b;word-break:break-all">🖼 画像(Xに添付してください): <a href="${escapeHtml(item.imageUrl)}">${escapeHtml(item.imageUrl)}</a></p>
      </div>`
    : "";

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f4fbfc">
      <div style="background:#0d4f52;padding:16px 24px;border-radius:12px 12px 0 0">
        <p style="color:#a0d4d6;margin:0 0 4px;font-size:11px;font-weight:700">📝 X投稿用の原稿 ・ ${escapeHtml(slotLabel)}</p>
        <h2 style="color:white;margin:0;font-size:16px;line-height:1.5">${escapeHtml(headline)}</h2>
        <p style="color:rgba(255,255,255,0.7);margin:4px 0 0;font-size:11px">${escapeHtml(nowJst)} JST</p>
      </div>
      <div style="background:white;padding:24px;border-radius:0 0 12px 12px;border:1px solid #b3e8ea">
        ${imageBlock}
        <div style="font-size:14px;color:#1e293b;line-height:1.9;white-space:pre-wrap;background:#f8fafc;padding:16px;border-radius:8px;border:1px solid #e2e8f0">${escapeHtml(finalText)}</div>
        <p style="margin:6px 0 16px;font-size:11px;color:#94a3b8">${count}文字(リンク・ハッシュタグ込み)</p>
        <div style="text-align:center;margin:8px 0 12px">
          <a href="${buttonUrl}" style="display:inline-block;padding:14px 28px;background:#0f1419;color:white;text-decoration:none;border-radius:999px;font-weight:800;font-size:14px">${shortUrl ? "𝕏 原稿を開いて投稿する →" : "𝕏 この原稿で投稿する →"}</a>
        </div>
        <p style="margin:0;font-size:11px;color:#64748b;line-height:1.7;text-align:center">${shortUrl ? "ボタンを押すと、原稿のページが開きます。そこで「コピー」または「𝕏 この原稿で投稿する」を押してください。" : "ボタンを押すと、Xの投稿画面が原稿入りで開きます。内容を確認してから投稿してください。"}</p>
        ${shortUrl ? `<p style="margin:6px 0 0;font-size:10px;color:#94a3b8;text-align:center"><a href="${intent}" style="color:#94a3b8">Xの投稿画面を直接開く</a>（リンクが長いため、メールによっては表示されないことがあります）</p>` : ""}
        <p style="margin-top:16px;font-size:11px;color:#94a3b8;word-break:break-all">
          リンク先: <a href="${escapeHtml(item.linkUrl)}">${escapeHtml(item.linkUrl)}</a><br/>
          © 大手町調査室九課 自動生成システム
        </p>
      </div>
    </div>
  `;

  try {
    const { error } = await resend.emails.send({ from: MAIL_FROM, to: ADMIN_EMAIL, subject, html });
    if (error) return { ok: false, error: JSON.stringify(error) };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}
