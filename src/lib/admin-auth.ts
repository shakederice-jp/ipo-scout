// 2026/9/26新設: 管理機能の認証(サーバー側で判定する)。
//
// それまでの問題:
//  ・管理画面のパスワードが、ブラウザに配信されるプログラム(src/app/admin/page.tsx)に直書きされていて、
//    ブラウザの開発者ツール等で誰でも読める状態だった。ログイン判定もブラウザ内だけで行っていた。
//  ・/api/admin/ の多く(Xへの投稿・公募価格の変更・会員へのメール送信など)や、AIで分析を作り直す
//    API(/api/analyze 等)に認証チェックが無く、URLを知っていれば誰でも実行できた。
//
// 新しい仕組み:
//  1. 管理画面のログインは /api/admin/login にパスワードを送り、サーバー側で環境変数 ADMIN_PASSWORD と
//     照合する。合っていれば、署名付きのログイン状態クッキー(JavaScriptから読めない httpOnly)を渡す。
//  2. src/proxy.ts が、管理用APIへのアクセスのたびに、このクッキーか、定期実行用の合言葉
//     (Authorization: Bearer CRON_SECRET)を確認し、どちらも無ければ401で断る。
//  3. クッキーの署名の鍵は ADMIN_PASSWORD と CRON_SECRET から作る。どちらかを変更すると、
//     それまでのログイン状態はすべて無効になる(万一のときはパスワード変更で全員ログアウトできる)。
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "admin_session";
export const ADMIN_SESSION_MAX_AGE_SEC = 14 * 24 * 60 * 60; // ログイン状態の有効期間(14日)
export const ADMIN_PASSWORD_MIN_LENGTH = 12;

type HeaderSource = { headers: Headers };

function safeEqual(a: string, b: string): boolean {
  // 長さの違いや文字の一致位置から推測されないよう、ハッシュ同士を一定時間で比較する
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// ADMIN_PASSWORD が正しく設定されているか(未設定・短すぎる場合は管理画面にログインできない)
export function adminPasswordConfigured(): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  return !!pw && pw.length >= ADMIN_PASSWORD_MIN_LENGTH;
}

function signingKey(): string | null {
  if (!adminPasswordConfigured()) return null;
  return createHash("sha256")
    .update(`ipo-scout-admin-session:${process.env.ADMIN_PASSWORD}:${process.env.CRON_SECRET ?? ""}`)
    .digest("hex");
}

export function checkAdminPassword(input: unknown): boolean {
  if (!adminPasswordConfigured() || typeof input !== "string" || input.length === 0) return false;
  return safeEqual(input, process.env.ADMIN_PASSWORD!);
}

// ログイン状態の証明書(「有効期限.署名」の形)を作る
export function createAdminSessionToken(nowMs: number = Date.now()): string | null {
  const key = signingKey();
  if (!key) return null;
  const exp = Math.floor(nowMs / 1000) + ADMIN_SESSION_MAX_AGE_SEC;
  const sig = createHmac("sha256", key).update(String(exp)).digest("hex");
  return `${exp}.${sig}`;
}

export function verifyAdminSessionToken(token: string | null | undefined, nowMs: number = Date.now()): boolean {
  const key = signingKey();
  if (!key || !token) return false;
  const m = /^(\d{9,12})\.([0-9a-f]{64})$/.exec(token);
  if (!m) return false;
  const exp = Number(m[1]);
  if (!Number.isFinite(exp) || exp * 1000 < nowMs) return false;
  const expected = createHmac("sha256", key).update(m[1]).digest("hex");
  return safeEqual(m[2], expected);
}

function readCookie(req: HeaderSource, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

// 定期実行(GitHub Actions・Vercel Cron)や、サーバー内部からの呼び出しか
export function isCronRequest(req: HeaderSource): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // 未設定なら「Bearer undefined」で通ってしまわないよう、常に拒否
  const auth = req.headers.get("authorization");
  return !!auth && safeEqual(auth, `Bearer ${secret}`);
}

// 管理画面にログイン済みのブラウザからの呼び出しか
export function hasAdminSession(req: HeaderSource): boolean {
  return verifyAdminSessionToken(readCookie(req, ADMIN_COOKIE));
}

// 管理者として実行してよい呼び出しか(ログイン済みの管理画面、または定期実行・内部呼び出し)
export function isAdminRequest(req: HeaderSource): boolean {
  return hasAdminSession(req) || isCronRequest(req);
}

// サーバー内部から管理用APIを呼ぶときに付けるヘッダー
export function internalAuthHeaders(): Record<string, string> {
  return process.env.CRON_SECRET ? { Authorization: `Bearer ${process.env.CRON_SECRET}` } : {};
}

export function adminCookieOptions(maxAgeSec: number = ADMIN_SESSION_MAX_AGE_SEC) {
  return {
    httpOnly: true, // ブラウザのJavaScriptから読めない(盗まれにくい)
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const, // 他サイトからの「なりすまし操作」ではクッキーが送られない
    path: "/",
    maxAge: maxAgeSec,
  };
}
