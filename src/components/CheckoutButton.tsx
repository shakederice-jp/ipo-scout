"use client";

import { CreditCard, Crown, Bell, BookOpen, Zap } from "lucide-react";
import { useState } from "react";

type Plan = "notify" | "report" | "complete" | "single";

const PLANS: {
  id: Plan;
  label: string;
  price: string;
  icon: React.ReactNode;
  description: string;
}[] = [
  {
    id: "notify",
    label: "通知プラン",
    price: "¥890/月",
    icon: <Bell className="h-3.5 w-3.5" aria-hidden />,
    description: "週末「次週戦略指令書」フル配信",
  },
  {
    id: "report",
    label: "レポート無制限",
    price: "¥1,890/月",
    icon: <BookOpen className="h-3.5 w-3.5" aria-hidden />,
    description: "全IPO銘柄の超深度分析が読み放題",
  },
  {
    id: "complete",
    label: "コンプリートパック",
    price: "¥2,490/月",
    icon: <Crown className="h-3.5 w-3.5" aria-hidden />,
    description: "通知フル＋レポート読み放題・全機能解放",
  },
  {
    id: "single",
    label: "シングルレポート",
    price: "¥500/件",
    icon: <Zap className="h-3.5 w-3.5" aria-hidden />,
    description: "特定の1銘柄だけ・永続閲覧",
  },
];

export function CheckoutButton({
  defaultPlan = "complete",
  stockId,
}: {
  defaultPlan?: Plan;
  stockId?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan>(defaultPlan);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setMessage(null);
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: selectedPlan,
          stockId: stockId ?? null,
        }),
      });

      const body = (await res.json()) as { url?: string; error?: string };

      if (!res.ok) {
        setMessage(body.error ?? "決済セッションの開始に失敗しました。");
        return;
      }
      if (body.url) {
        window.location.href = body.url;
        return;
      }
      setMessage("リダイレクト URL が返りませんでした。");
    } catch {
      setMessage("通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }

  const current = PLANS.find((p) => p.id === selectedPlan) ?? PLANS[2];

  return (
    <div className="flex flex-col items-stretch gap-3">
      {/* プラン選択 */}
      <div className="grid grid-cols-2 gap-1.5">
        {PLANS.map((plan) => (
          <button
            key={plan.id}
            type="button"
            onClick={() => setSelectedPlan(plan.id)}
            className={[
              "flex flex-col items-start gap-0.5 rounded border px-2.5 py-2 text-left text-xs transition",
              selectedPlan === plan.id
                ? "border-[#D4AF37]/60 bg-[#D4AF37]/15 text-[#D4AF37]"
                : "border-[#D4AF37]/20 bg-transparent text-[#c4c0b8]/70 hover:border-[#D4AF37]/35",
            ].join(" ")}
          >
            <span className="flex items-center gap-1 font-semibold">
              {plan.icon}
              {plan.label}
            </span>
            <span className="font-bold tracking-wide">{plan.price}</span>
          </button>
        ))}
      </div>

      {/* 選択中プランの説明 */}
      <p className="text-xs text-[#c4c0b8]/70 leading-relaxed">
        {current.description}
      </p>

      {/* 購入ボタン */}
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center justify-center gap-2 rounded border border-[#D4AF37]/60 bg-[#D4AF37]/10 px-5 py-3 text-sm font-semibold tracking-wide text-[#D4AF37] transition hover:bg-[#D4AF37]/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <CreditCard className="h-4 w-4" aria-hidden />
        {loading ? "接続中…" : `${current.label}を購入（${current.price}）`}
      </button>

      {/* エラーメッセージ */}
      {message ? (
        <p className="text-center text-xs text-red-300/90" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
