// 2026/10/24新設(束B・⑧): X投稿メールの「短いリンク」と、友達紹介キャンペーンの案内文(末尾)の共通処理。
//
// ■ 短いリンク(/x/<ランダムな文字列>)
//   これまでメールのボタンは、原稿の全文を1本のURLに詰め込む方式(原稿が500字だとURLは約4,500字)だったため、
//   Gmailなどでボタンが表示されない・押せないことがあった。そこで、メールを送るたびに原稿をDBに保存し、
//   サイトの専用ページ(/x/xxxx)へ誘導する短いリンクにした。ページには、原稿・コピーボタン・
//   「𝕏 この原稿で投稿する」ボタンがある。ページは検索に出さず、リンクを知っている人だけが開ける。
//   DBに保存できなかったときは、従来の長いリンクにフォールバックする(メールが届かなくなることはない)。
//
// ■ キャンペーンの案内文(末尾)
//   メールで届く原稿の末尾(ハッシュタグの手前)に、友達紹介キャンペーンの案内とリンク(/campaign)を足す。
//   キャンペーンを終えるときは、Vercelの環境変数 X_CAMPAIGN_TAIL を off にすると、案内文が付かなくなる。
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { xIntentUrl } from "./x-serialize";

export const SITE_URL = "https://ipo.finance-tower.com";
export const CAMPAIGN_URL = `${SITE_URL}/campaign?utm_source=x&utm_medium=social&utm_campaign=referral`;

// ---------- キャンペーンの案内文 ----------

export function campaignTail(): string | null {
  if ((process.env.X_CAMPAIGN_TAIL ?? "").toLowerCase() === "off") return null;
  return `🎁友達紹介キャンペーン実施中（先着100名限定）\n登録だけで、有料分析と週刊スライドが2ヶ月読み放題。\n${CAMPAIGN_URL}`;
}

// 原稿の末尾に案内文を足す。ハッシュタグだけの最後の段落があれば、その手前に入れる。すでに入っていれば何もしない。
export function appendCampaignTail(text: string): string {
  const tail = campaignTail();
  const t = text.trim();
  if (!tail || t.includes("/campaign")) return t;
  const parts = t.split(/\n\s*\n/);
  const last = parts[parts.length - 1].trim();
  if (parts.length > 1 && /^(#\S+\s*)+$/.test(last)) parts.splice(parts.length - 1, 0, tail);
  else parts.push(tail);
  return parts.join("\n\n");
}

// ---------- 短いリンク ----------

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // 紛らわしい文字(l o 0 1)を除いた32文字
const newToken = (len = 12) => Array.from(randomBytes(len), (b) => ALPHABET[b % ALPHABET.length]).join("");

export interface XShortLinkInput {
  text: string;
  kind?: string | null;
  title?: string | null;
  imageUrl?: string | null;
}

// 原稿を保存して、短いリンク(https://ipo.finance-tower.com/x/xxxx)を返す。保存できなければ null。
export async function createXShortLink(input: XShortLinkInput): Promise<string | null> {
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    for (let i = 0; i < 3; i++) {
      const token = newToken();
      const { error } = await supabase.from("x_post_links").insert({
        token,
        post_text: input.text,
        kind: input.kind ?? null,
        title: input.title ?? null,
        image_url: input.imageUrl ?? null,
      });
      if (!error) return `${SITE_URL}/x/${token}`;
      if (!/duplicate|unique/i.test(error.message)) {
        console.error("x_post_links 保存エラー:", error.message);
        return null;
      }
    }
  } catch (e) {
    console.error("x_post_links 保存失敗:", e instanceof Error ? e.message : e);
  }
  return null;
}

// 管理者宛メールの本文に入れる「この原稿で投稿する」リンク(HTML断片)。短いリンク+キャンペーンの案内つき。
// (x-serialize.ts の xPostLinkHtml の短いリンク版。メールの他の部分は変えずに差し替えられる)
export async function xShortPostLinkHtml(
  text: string,
  opts: { label?: string; kind?: string; title?: string } = {}
): Promise<string> {
  const label = opts.label ?? "この原稿で投稿する";
  const finalText = appendCampaignTail(text);
  const short = await createXShortLink({ text: finalText, kind: opts.kind, title: opts.title });
  if (short) {
    return `𝕏 ${label} → <a href="${short}">このリンクを開く</a>（原稿の確認・コピー・投稿ができます。末尾に友達紹介キャンペーンの案内が付きます）`;
  }
  return `𝕏 ${label} → <a href="${xIntentUrl(finalText)}">このリンクを開く</a>`;
}
