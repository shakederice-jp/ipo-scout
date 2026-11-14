// 2026/11/14新設: 日本版(ipo-scout)と米国版(ipo-scout-us)をまたぐ「紹介特典の共通化」の土台。両アプリで同じ内容のファイル(OWN_APP だけ異なる)。
//
// 考え方
//  ・日本版と米国版は、会員名簿(Supabase)が別々。ログインのメールアドレスが同じなら同一人物とみなす(プランの共有と同じ考え方)。
//  ・どちらのサイトの紹介コードも、もう一方のサイトで使える(コードが見つからなければ、相手のサイトに問い合わせる)。
//  ・紹介特典の無料期間(user_profiles.free_until)は、付与するたびに相手のサイトの同じメールの会員にも反映する
//    (「相手の期限より後なら延ばす」という上書きなので、何度実行しても結果は同じ)。
//    相手のサイトにまだ会員登録が無い人は、その人が登録して本人確認したときに、相手のサイトから引き継ぐ(pullFreeUntilFromOtherApp)。
//  ・サイト同士の連絡は、合言葉(環境変数 CROSS_APP_SECRET。日米で同じ値)つきの内部API
//    (/api/internal/referral-sync)で行う。合言葉が未設定なら、共通化は働かず、従来どおりそのサイトの中だけで動く。
import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";
import { PUBLIC_ORIGIN } from "@/lib/base-path";

/** このアプリが日本版(jp)か米国版(us)か */
export const OWN_APP: "jp" | "us" = "jp";
const OTHER_PATH = (OWN_APP as string) === "jp" ? "/ipo-us" : "/ipo-jp";

const getAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// 相手のサイトの土台URL(本番は親サイト経由の公開URL。開発中は OTHER_APP_URL を設定したときだけ)
function otherAppBase(): string | null {
  if (process.env.OTHER_APP_URL) return process.env.OTHER_APP_URL.replace(/\/+$/, "");
  return process.env.NODE_ENV === "production" ? PUBLIC_ORIGIN + OTHER_PATH : null;
}

/** 相手のサイトの内部APIを呼ぶ。合言葉が無い・通信できない・エラーのときは null(呼び出し側は「共通化なし」として続行する) */
export async function callOtherApp<T = any>(action: string, payload: Record<string, unknown>, timeoutMs = 6000): Promise<T | null> {
  const secret = process.env.CROSS_APP_SECRET;
  const base = otherAppBase();
  if (!secret || !base) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/api/internal/referral-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cross-app-secret": secret },
      body: JSON.stringify({ action, ...payload }),
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) { console.error("cross-app call failed", action, res.status); return null; }
    return (await res.json()) as T;
  } catch (e) {
    console.error("cross-app call error", action, e instanceof Error ? e.message : e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 内部APIが受けた呼び出しの合言葉が合っているか */
export function verifyCrossAppSecret(req: { headers: { get(name: string): string | null } }): boolean {
  const secret = process.env.CROSS_APP_SECRET;
  if (!secret) return false;
  const given = req.headers.get("x-cross-app-secret") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** メールアドレスから、このサイトの会員を探す(会員数が少ないうちは一覧を順に調べる方式で十分) */
export async function findUserByEmail(email: string | null | undefined): Promise<User | null> {
  const target = (email ?? "").trim().toLowerCase();
  if (!target) return null;
  const admin = getAdmin();
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data) return null;
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

/** この会員の無料期間を、指定の日時まで延ばす(すでにそれより先まで有効なら何もしない)。延ばしたら true */
export async function setFreeUntilMax(userId: string, iso: string): Promise<boolean> {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  const admin = getAdmin();
  const { data: cur } = await admin.from("user_profiles").select("free_until").eq("id", userId).maybeSingle();
  const curT = cur?.free_until ? Date.parse(cur.free_until) : 0;
  if (Number.isFinite(curT) && curT >= t) return false;
  const next = new Date(t).toISOString();
  const { error } = cur
    ? await admin.from("user_profiles").update({ free_until: next }).eq("id", userId)
    : await admin.from("user_profiles").insert({ id: userId, free_until: next });
  if (error) { console.error("cross-app: free_until update failed", error.message); return false; }
  return true;
}

/** 相手のサイトの同じメールの会員にも、無料期間を反映する(相手に会員がいなければ何も起きない) */
export async function mirrorFreeUntilToOtherApp(email: string | null | undefined, freeUntil: string | null | undefined): Promise<void> {
  if (!email || !freeUntil) return;
  await callOtherApp("mirror", { email, free_until: freeUntil });
}

// 同じ会員について短時間に何度も相手のサイトへ問い合わせない(サーバーの中での簡易な間隔制限)
const lastPulled = new Map<string, number>();
const PULL_INTERVAL_MS = 10 * 60 * 1000;

/**
 * 相手のサイトの同じメールの会員に、より長い無料期間があれば、この会員にも引き継ぐ。
 * 本人確認(メール確認)済みの会員だけが対象。失敗しても何もしない(ログイン・表示は続行)。
 */
export async function pullFreeUntilFromOtherApp(user: { id: string; email?: string | null; email_confirmed_at?: string | null }): Promise<void> {
  try {
    if (!user.email || !user.email_confirmed_at) return;
    const last = lastPulled.get(user.id);
    if (last && Date.now() - last < PULL_INTERVAL_MS) return;
    lastPulled.set(user.id, Date.now());
    const r = await callOtherApp<{ free_until?: string | null }>("get_free_until", { email: user.email }, 4000);
    if (r?.free_until && Date.parse(r.free_until) > Date.now()) await setFreeUntilMax(user.id, r.free_until);
  } catch (e) {
    console.error("cross-app: pull failed", e instanceof Error ? e.message : e);
  }
}
