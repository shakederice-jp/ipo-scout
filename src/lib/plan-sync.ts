// =============================================================
// 日本版・米国版の「プラン共有」処理（両アプリで同じ内容のファイル。OWN_APP だけ異なる）
// -------------------------------------------------------------
// 考え方
//  ・日本版と米国版は別々のデータベース（別々の会員名簿）です。
//  ・お金のやり取りは同じ Stripe アカウントで行うので、「Stripe に記録された契約」が正本です。
//  ・ログインのメールアドレスが同じなら同一人物とみなし、Stripe の契約を調べて
//    自分のデータベースの user_profiles.plan に反映します。
//  ・どちらのサイトで加入しても、もう一方のサイトでは「閲覧時（または購入時・マイページ表示時）」に自動反映されます。
//  ・シングルレポート（単品購入）は共有しません（銘柄が日米で別のため）。
// 必要な環境変数（日米で同じ値を設定）: STRIPE_SECRET_KEY, STRIPE_PRICE_NOTIFY / STRIPE_PRICE_REPORT / STRIPE_PRICE_COMPLETE
// =============================================================
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

/** このアプリが日本版(jp)か米国版(us)か */
export const OWN_APP: "jp" | "us" = "jp";

export type PaidPlan = "notify" | "report" | "complete";
// 有料プランの名前。これ以外（"free" や、データベースの初期値 "standard" など）はすべて無料会員として扱う。
export const PAID_PLANS: readonly string[] = ["notify", "report", "complete"];
export const isPaidPlan = (p: string | null | undefined): boolean => !!p && PAID_PLANS.includes(p);
const RANK: Record<PaidPlan, number> = { notify: 1, report: 2, complete: 3 };
const VALID_STATUS = new Set(["active", "trialing", "past_due"]);

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!);
const getAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function priceIdToPlan(): Record<string, PaidPlan> {
  const m: Record<string, PaidPlan> = {};
  if (process.env.STRIPE_PRICE_NOTIFY) m[process.env.STRIPE_PRICE_NOTIFY] = "notify";
  if (process.env.STRIPE_PRICE_REPORT) m[process.env.STRIPE_PRICE_REPORT] = "report";
  if (process.env.STRIPE_PRICE_COMPLETE) m[process.env.STRIPE_PRICE_COMPLETE] = "complete";
  return m;
}

export type StripePlanInfo = { plan: PaidPlan; customerId: string; subscriptionId: string };

/** 1人のStripe顧客について、有効な契約のうち一番上のプランを返す（なければ null） */
export async function bestPlanForCustomer(stripe: Stripe, customerId: string): Promise<StripePlanInfo | null> {
  const map = priceIdToPlan();
  const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
  let best: StripePlanInfo | null = null;
  for (const s of subs.data) {
    if (!VALID_STATUS.has(s.status)) continue;
    for (const item of s.items.data) {
      const plan = map[item.price.id];
      if (!plan) continue;
      if (!best || RANK[plan] > RANK[best.plan]) best = { plan, customerId, subscriptionId: s.id };
    }
  }
  return best;
}

/**
 * user_profiles に反映する。
 *  ・列が無い環境でも落ちないよう、subscription_id は失敗したら外して再試行する。
 *  ・「無料に戻す」ときは "free" で書き、データベースの制約などで書けなければ初期値の "standard" で書き直す。
 */
export async function applyPlan(
  userId: string,
  info: { plan: string; customerId?: string | null; subscriptionId?: string | null },
) {
  const admin = getAdmin();
  const planNames = info.plan === "free" ? ["free", "standard"] : [info.plan];
  let lastError = "";
  for (const planName of planNames) {
    const base: Record<string, unknown> = {
      id: userId,
      plan: planName,
      updated_at: new Date().toISOString(),
    };
    if (info.customerId) base.stripe_customer_id = info.customerId;
    const withSub = { ...base, stripe_subscription_id: info.subscriptionId ?? null };
    const r1 = await admin.from("user_profiles").upsert(withSub, { onConflict: "id" });
    if (!r1.error) return;
    const r2 = await admin.from("user_profiles").upsert(base, { onConflict: "id" });
    if (!r2.error) return;
    lastError = r2.error.message;
  }
  console.error("plan-sync: user_profiles更新エラー", lastError);
}

// 負荷対策: 同じ会員について短時間に何度もStripeへ問い合わせない（無料は短め、有料は長め）
const lastChecked = new Map<string, { at: number; plan: string | null }>();
const FREE_TTL_MS = 30 * 1000;
const PAID_TTL_MS = 10 * 60 * 1000;

/**
 * この会員のプランをStripeの契約に合わせて最新にする。
 * 戻り値: 反映後のプラン名（"notify" | "report" | "complete" | "free"）。Stripeに問い合わせできなかった時は null（=変更しない）。
 * force=true で間隔制限を無視する（購入直前の確認用）。
 */
export async function syncPlanForUser(
  user: { id: string; email?: string | null; email_confirmed_at?: string | null },
  opts: { force?: boolean } = {},
): Promise<string | null> {
  try {
    if (!process.env.STRIPE_SECRET_KEY) return null;
    const admin = getAdmin();
    const { data: profile } = await admin.from("user_profiles").select("*").eq("id", user.id).maybeSingle();
    const currentPlan: string = (profile as any)?.plan ?? "free";
    const isPaid = isPaidPlan(currentPlan);

    const memo = lastChecked.get(user.id);
    const ttl = isPaid ? PAID_TTL_MS : FREE_TTL_MS;
    if (!opts.force && memo && Date.now() - memo.at < ttl && memo.plan === currentPlan) return currentPlan;

    const stripe = getStripe();
    const customerIds = new Set<string>();
    const ownCustomer = (profile as any)?.stripe_customer_id as string | undefined;
    if (ownCustomer) customerIds.add(ownCustomer);
    // メールアドレスでの突き合わせは、メール確認済みの会員だけ（他人のメールで登録して契約を横取りされるのを防ぐ）
    if (user.email && user.email_confirmed_at) {
      const list = await stripe.customers.list({ email: user.email.toLowerCase(), limit: 10 });
      for (const c of list.data) customerIds.add(c.id);
      if (user.email !== user.email.toLowerCase()) {
        const list2 = await stripe.customers.list({ email: user.email, limit: 10 });
        for (const c of list2.data) customerIds.add(c.id);
      }
    }

    let best: StripePlanInfo | null = null;
    for (const cid of customerIds) {
      const info = await bestPlanForCustomer(stripe, cid);
      if (info && (!best || RANK[info.plan] > RANK[best.plan])) best = info;
    }

    let result = currentPlan;
    if (best) {
      if (best.plan !== currentPlan || (profile as any)?.stripe_customer_id !== best.customerId) {
        await applyPlan(user.id, { plan: best.plan, customerId: best.customerId, subscriptionId: best.subscriptionId });
      }
      result = best.plan;
    } else if (isPaid && (ownCustomer || (profile as any)?.stripe_subscription_id)) {
      // Stripeに有効な契約が見当たらない → 解約・期限切れとして無料に戻す
      // （Stripe由来のプランだけが対象。stripe_customer_id も契約IDも無い管理者付与のプランは触らない）
      await applyPlan(user.id, { plan: "free", subscriptionId: null });
      result = "free";
    }
    lastChecked.set(user.id, { at: Date.now(), plan: result });
    return result;
  } catch (e) {
    console.error("plan-sync: 同期に失敗（プランは変更しません）", e instanceof Error ? e.message : e);
    return null;
  }
}
