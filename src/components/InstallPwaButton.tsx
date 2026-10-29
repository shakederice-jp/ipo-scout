"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// 2026/10/29改修: 「ホーム画面に追加」の案内を、トップページだけの大きな帯から、全ページ共通の
// 控えめな下部の帯に変更した(前身: 2026/9/6新設のトップ用バナー)。
// 出す条件(すべて満たしたときだけ):
//  ・スマホ幅の端末で、まだホーム画面から開いていない(display-mode: standalone ではない)
//  ・このサイトで2ページ目以降を見たとき(最初の1ページ目では出さない)
//  ・Xやインスタなどのアプリ内ブラウザではない(そこでは追加ができないため)
//  ・閉じてから30日以内ではない
// 表示の中身:
//  ・Android(Chrome等): ブラウザの「追加する」ボタンを直接出す(押すと標準の確認が出る)
//  ・iPhone/iPad: 仕様上ボタンで追加できないため、「やり方を見る」から案内ページ(/install)へ
//  ・Androidで追加ボタンが出せないとき: 同じく案内ページへ
const DISMISS_KEY = "pwaBannerDismissedAt";
const VIEWS_KEY = "pwaPageViews";
const DISMISS_DAYS = 30;
const HIDE_PATHS = ["/admin", "/install", "/auth"];

type Mode = "native" | "guide";

export default function InstallPwaButton() {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<Mode>("guide");

  // Androidのブラウザが出す「追加できます」の合図を受け取っておく
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferredPrompt(e); };
    const onInstalled = () => { setVisible(false); setDeferredPrompt(null); remember(); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // ページを開くたびに、出してよい条件かを判定する
  useEffect(() => {
    try {
      if (HIDE_PATHS.some((p) => pathname === p || pathname?.startsWith(p + "/"))) { setVisible(false); return; }

      const views = Number(sessionStorage.getItem(VIEWS_KEY) || "0") + 1;
      sessionStorage.setItem(VIEWS_KEY, String(views));
      if (views < 2) return;

      const at = Number(localStorage.getItem(DISMISS_KEY) || "0");
      if (at && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000) return;

      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true;
      if (standalone) return;

      const ua = window.navigator.userAgent;
      const inApp = /Twitter|FBAN|FBAV|Instagram|Line\/|MicroMessenger|; wv\)/i.test(ua);
      if (inApp) return;

      const touch = (navigator.maxTouchPoints || 0) > 0;
      const narrow = window.matchMedia("(max-width: 820px)").matches;
      if (!touch || !narrow) return;

      const isIos = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && touch);
      const isAndroid = /Android/.test(ua);
      if (!isIos && !isAndroid) return;

      setVisible(true);
    } catch {
      // 保存領域が使えない環境では、帯を出さないだけ(サイトの動作には影響しない)
    }
  }, [pathname]);

  // 追加ボタンを出せるかどうか(合図を受け取れていれば「追加する」、なければ案内ページへ)
  useEffect(() => { setMode(deferredPrompt ? "native" : "guide"); }, [deferredPrompt]);

  function remember() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
  }
  function dismiss() { setVisible(false); remember(); }

  async function install() {
    if (!deferredPrompt) return;
    try {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } catch {}
    setDeferredPrompt(null);
    dismiss();
  }

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="ホーム画面への追加のご案内"
      style={{
        position: "fixed", left: 8, right: 8, bottom: 8, zIndex: 60,
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div style={{
        maxWidth: 520, margin: "0 auto", borderRadius: 14, padding: "10px 12px",
        display: "flex", alignItems: "center", gap: 10,
        backgroundColor: "#0d4f52", border: "1px solid #0a3d40",
        boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png?v=2" alt="" width={40} height={40} style={{ borderRadius: 9, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: "#ffffff", lineHeight: 1.4 }}>ホーム画面に追加できます</div>
          <div style={{ fontSize: 11, color: "#a0d4d6", lineHeight: 1.4 }}>タップ1回で、最新のIPO情報へ</div>
        </div>
        {mode === "native" ? (
          <button onClick={install} style={{
            fontSize: 12, fontWeight: 800, color: "#0d4f52", backgroundColor: "#66c3c6",
            border: "none", borderRadius: 8, padding: "8px 12px", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
          }}>追加する</button>
        ) : (
          <a href="/install" onClick={remember} style={{
            fontSize: 12, fontWeight: 800, color: "#0d4f52", backgroundColor: "#66c3c6",
            borderRadius: 8, padding: "8px 12px", textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0,
          }}>やり方を見る</a>
        )}
        <button onClick={dismiss} aria-label="閉じる" style={{
          fontSize: 16, lineHeight: 1, color: "#a0d4d6", background: "none", border: "none", cursor: "pointer", padding: 6, flexShrink: 0,
        }}>✕</button>
      </div>
    </div>
  );
}
