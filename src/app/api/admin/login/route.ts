import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  ADMIN_PASSWORD_MIN_LENGTH,
  adminCookieOptions,
  adminPasswordConfigured,
  checkAdminPassword,
  createAdminSessionToken,
} from "@/lib/admin-auth";
import { notifyAdmin } from "@/lib/notify-admin";

// 2026/9/26新設: 管理画面のログイン。パスワードをサーバー側で環境変数 ADMIN_PASSWORD と照合し、
// 合っていればログイン状態のクッキー(httpOnly・署名付き)を渡す。仕組みは src/lib/admin-auth.ts 参照。
// ・総当たり対策: 同じ接続元からの失敗は15分で10回まで。失敗時は少し待ってから返す。
// ・ログインに成功するたびに管理者へメールで知らせる(身に覚えのないログインに気づけるように)。

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: NextRequest): string {
  const raw = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return raw.replace(/[^0-9a-fA-F:.]/g, "").slice(0, 45) || "unknown";
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const now = Date.now();
  const f = failures.get(ip);
  if (f && now < f.resetAt && f.count >= MAX_FAILURES) {
    return NextResponse.json(
      { error: "ログインの失敗が続いたため、しばらく(最大15分)ログインできません。時間をおいてお試しください。" },
      { status: 429 }
    );
  }

  if (!adminPasswordConfigured()) {
    return NextResponse.json(
      {
        error: `管理画面のパスワードがサーバーに設定されていません。Vercelの環境変数 ADMIN_PASSWORD に${ADMIN_PASSWORD_MIN_LENGTH}文字以上のパスワードを設定し、再デプロイしてください。`,
      },
      { status: 503 }
    );
  }

  let password: unknown = null;
  try {
    password = (await req.json())?.password;
  } catch {
    // 形式不正はパスワード違いと同じ扱い
  }

  if (!checkAdminPassword(password)) {
    const cur = f && now < f.resetAt ? f : { count: 0, resetAt: now + WINDOW_MS };
    cur.count++;
    failures.set(ip, cur);
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: "パスワードが違います" }, { status: 401 });
  }

  failures.delete(ip);
  const token = createAdminSessionToken();
  if (!token) return NextResponse.json({ error: "ログイン処理に失敗しました" }, { status: 500 });

  await notifyAdmin(
    "管理画面にログインがありました",
    `接続元IP: ${ip}\n\n心当たりがない場合は、Vercelの環境変数 ADMIN_PASSWORD を新しいパスワードに変更して再デプロイしてください(変更すると、すべてのログイン状態が無効になります)。`,
    "info"
  );

  const res = NextResponse.json({ success: true });
  res.cookies.set(ADMIN_COOKIE, token, adminCookieOptions());
  return res;
}
