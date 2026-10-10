// ログイン・会員登録のあと、元の画面（例：料金ページ）へ戻すための補助。
// 戻り先は「このサイト内のパス」だけを許可する（外部サイトへ飛ばされる悪用を防ぐため）。

// 会員登録→確認メールのリンク→戻り先、という流れで戻り先を覚えておくクッキーの名前
export const NEXT_COOKIE = "post_auth_next";

export function safeNext(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (v.length === 0 || v.length > 300) return null;
  if (!v.startsWith("/")) return null;
  if (v.startsWith("//") || v.startsWith("/\\")) return null;
  // 英数字と、パスやクエリに使う記号だけ許可（改行・空白・日本語・バックスラッシュなどは不可）
  if (!/^[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#]+$/.test(v)) return null;
  return v;
}
