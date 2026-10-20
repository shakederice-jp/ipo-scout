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
