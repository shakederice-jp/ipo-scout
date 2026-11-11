// 2026/11/11新設(サブディレクトリ化): このアプリは https://finance-tower.com/ipo-jp 以下で公開される。
// next.config.ts の basePath と同じ値。<Link>・router.push・next/image は自動で付くが、
// 通常の <a href="/…">・fetch("/api/…")・window.location・manifest等は自動では付かないため、この値を使う。
export const BASE_PATH = "/ipo-jp";

// 本番の公開URL(親サイト finance-tower.com)。サーバーが作るリダイレクト先・決済の戻り先などに使う。
export const PUBLIC_ORIGIN = "https://finance-tower.com";

// サイト内のパス("/analysis/xxx" など)に /ipo-jp を付ける。すでに付いているもの・外部URL・#・mailto: はそのまま返す。
export function withBase(path: string): string {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) return path;
  if (path === BASE_PATH || path.startsWith(BASE_PATH + "/") || path.startsWith(BASE_PATH + "?") || path.startsWith(BASE_PATH + "#")) return path;
  if (path === "/") return BASE_PATH;
  return BASE_PATH + path;
}

// このアプリ自身のAPIを、サーバーの中から呼ぶときの土台URL(例: 管理画面→cron、cron→管理用API)。
// 本番は親サイト経由の公開URLに固定する(環境変数 NEXT_PUBLIC_APP_URL は古いドメインのままでも影響しないように)。
export const SELF_URL =
  (process.env.NODE_ENV === "production" ? PUBLIC_ORIGIN : (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000")) + BASE_PATH;
