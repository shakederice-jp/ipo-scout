// 2026/10/20新設: IPO週報の「配信を止める」リンク用の署名(本人だけが止められるようにする)。
// ログインしていなくてもメールのリンクから止められるよう、会員IDから署名つきのURLを作る。
// 署名の鍵には、既存の環境変数 CRON_SECRET を使う(新しい設定は要らない)。
import { createHmac, timingSafeEqual } from "crypto";

const SITE_URL = "https://ipo.finance-tower.com";

function sign(userId: string): string {
  const secret = process.env.CRON_SECRET ?? "";
  return createHmac("sha256", secret).update(`weekly-brief:${userId}`).digest("hex").slice(0, 32);
}

export function unsubscribeUrl(userId: string): string {
  return `${SITE_URL}/api/weekly-brief/unsubscribe?u=${encodeURIComponent(userId)}&t=${sign(userId)}`;
}

export function verifyUnsubscribe(userId: string, token: string): boolean {
  if (!process.env.CRON_SECRET || !userId || !token) return false;
  const a = Buffer.from(sign(userId));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

// 2026/11/1追加(集客施策2): ログイン不要の「メールアドレスだけ」で申し込んだ人(weekly_brief_guests)用の署名。
// 確認メールの「登録を完了する」リンクと、配信メールの「配信を止める」リンクに使う。
function signGuest(guestId: string, action: "confirm" | "stop"): string {
  const secret = process.env.CRON_SECRET ?? "";
  return createHmac("sha256", secret).update(`weekly-brief-guest:${action}:${guestId}`).digest("hex").slice(0, 32);
}

export function guestUrl(guestId: string, action: "confirm" | "stop"): string {
  return `${SITE_URL}/api/weekly-brief/guest?a=${action}&g=${encodeURIComponent(guestId)}&t=${signGuest(guestId, action)}`;
}

export function verifyGuest(guestId: string, action: "confirm" | "stop", token: string): boolean {
  if (!process.env.CRON_SECRET || !guestId || !token) return false;
  const a = Buffer.from(signGuest(guestId, action));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
