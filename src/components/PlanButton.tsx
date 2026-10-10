"use client";

// 「このプランを申し込む」ボタン（料金ページ・分析ページの有料の壁・トップの購入パネルで共通利用）
//  ・ログイン済み → すぐにStripeの決済画面へ移動する
//  ・未ログイン   → 会員登録/ログイン画面へ案内し、完了後に元の画面へ戻って自動で決済画面へ進む
//    （戻り先のURLに ?buy=プラン名 を付けて、戻ったときにこのボタンが自動で動く）
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export type PlanKey = "notify" | "report" | "complete" | "single";

const DEFAULT_MESSAGE_STYLE: CSSProperties = {
  fontSize: 12, color: "#b91c1c", marginTop: 8, lineHeight: 1.6, textAlign: "center",
};

export function PlanButton({
  plan,
  stockId,
  label,
  icon,
  className,
  style,
  messageStyle,
}: {
  plan: PlanKey;
  stockId?: string;
  label: string;
  icon?: ReactNode;
  className?: string;
  style?: CSSProperties;
  messageStyle?: CSSProperties;
}) {
  const [busy, setBusy] = useState<"idle" | "click" | "auto">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [already, setAlready] = useState(false);
  const startedRef = useRef(false);

  async function start(auto: boolean) {
    setMessage(null);
    setAlready(false);
    setBusy(auto ? "auto" : "click");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, stockId: stockId ?? null }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };

      if (res.status === 401) {
        if (auto) {
          // ログインから戻ってきたのに未ログインと判定された場合に、ぐるぐる回らないよう止める
          setMessage("ログイン状態を確認できませんでした。お手数ですが、もう一度ボタンを押してください。");
          setBusy("idle");
          return;
        }
        const back = `${window.location.pathname}?buy=${plan}`;
        window.location.href = `/auth?next=${encodeURIComponent(back)}`;
        return; // 画面が切り替わるまで「接続中…」のままにする
      }
      if (res.status === 409) {
        setAlready(true);
        setMessage(body.error ?? "すでに有料プランにご加入中です。");
        setBusy("idle");
        return;
      }
      if (!res.ok) {
        setMessage(body.error ?? "決済画面の準備に失敗しました。時間をおいてもう一度お試しください。");
        setBusy("idle");
        return;
      }
      if (body.url) {
        window.location.href = body.url;
        return;
      }
      setMessage("決済画面へのリンクを取得できませんでした。");
      setBusy("idle");
    } catch {
      setMessage("通信エラーが発生しました。電波の良い場所でもう一度お試しください。");
      setBusy("idle");
    }
  }

  // ログイン後に ?buy=このプラン 付きで戻ってきたら、自動で決済画面へ進む
  useEffect(() => {
    if (startedRef.current) return;
    try {
      const p = new URLSearchParams(window.location.search);
      if (p.get("buy") !== plan) return;
      startedRef.current = true;
      p.delete("buy");
      const q = p.toString();
      window.history.replaceState(null, "", window.location.pathname + (q ? `?${q}` : "") + window.location.hash);
    } catch {
      return;
    }
    void start(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 決済画面から「戻る」で帰ってきたとき、「移動中」の表示が残らないようにする
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy("idle");
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => void start(false)}
        disabled={busy !== "idle"}
        className={className}
        style={{
          cursor: busy !== "idle" ? "default" : "pointer",
          opacity: busy !== "idle" ? 0.7 : 1,
          fontFamily: "inherit",
          ...style,
        }}
      >
        {icon}
        {busy === "idle" ? label : "接続中…"}
      </button>

      {message ? (
        <p role="alert" style={{ ...DEFAULT_MESSAGE_STYLE, ...messageStyle }}>
          {message}
          {already ? (
            <>
              {" "}
              <a href="/mypage" style={{ textDecoration: "underline", fontWeight: 700, color: "inherit" }}>
                マイページを開く →
              </a>
            </>
          ) : null}
        </p>
      ) : null}

      {busy === "auto" ? (
        <div
          role="status"
          style={{
            position: "fixed", inset: 0, zIndex: 2000, backgroundColor: "rgba(255,255,255,0.95)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 10, color: "#0F172A", fontFamily: "inherit", textAlign: "center", padding: 24,
          }}
        >
          <div style={{ fontSize: 34 }}>🔒</div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>お支払い画面へ移動しています…</div>
          <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.7 }}>
            そのままお待ちください。Stripeの安全な決済画面に切り替わります。
          </div>
        </div>
      ) : null}
    </>
  );
}
