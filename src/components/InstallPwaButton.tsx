"use client";

import { useEffect, useState } from "react";

// 2026/9/6新設: トップページに「ホーム画面に追加(PWA化)」の案内バナーを表示し、
// ユーザーが毎日サイトに戻ってきやすくするための施策。
// - Android/Chrome/Edge等: ブラウザが発火する`beforeinstallprompt`イベントを捕まえて
//   独自の「追加する」ボタンを出し、押すとブラウザ標準のインストール確認ダイアログが出る。
// - iPhoneのSafari: 仕様上`beforeinstallprompt`が発火しないため、代わりに
//   「共有ボタン→ホーム画面に追加」という手順を文章で案内するだけの表示にする。
// - すでにホーム画面のアイコンから起動している場合(display-mode: standalone)は表示しない。
// - 一度✕で閉じたら、そのブラウザでは以後表示しない(localStorageに記録、しつこくしない)。
export default function InstallPwaButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIos, setIsIos] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem("pwaBannerDismissed");
      if (dismissed) return;

      const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true;
      if (isStandalone) return;

      const ua = window.navigator.userAgent;
      const iosDevice = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
      setIsIos(iosDevice);

      if (iosDevice) {
        setVisible(true);
        return;
      }

      const handler = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setVisible(true);
      };
      window.addEventListener("beforeinstallprompt", handler);
      return () => window.removeEventListener("beforeinstallprompt", handler);
    } catch {
      // localStorage/matchMediaが使えない環境では何もしない(バナーを出さないだけ)
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem("pwaBannerDismissed", "1");
    } catch {}
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  };

  if (!visible) return null;

  return (
    <div style={{
      margin: "12px 16px 0",
      borderRadius: 12,
      padding: "12px 16px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      backgroundColor: "#0d4f52",
      border: "1px solid #0a3d40",
      flexWrap: "wrap",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 20 }}>📲</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 900, color: "white" }}>
            ホーム画面に追加しませんか？
          </div>
          <div style={{ fontSize: 11, color: "#a0d4d6", marginTop: 2 }}>
            {isIos
              ? "共有ボタン（□に↑のアイコン）から「ホーム画面に追加」を選ぶと、アプリのように開けます。"
              : "アプリのように、ワンタップで最新のIPO情報にアクセスできるようになります。"}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {!isIos && (
          <button onClick={handleInstallClick} style={{
            fontSize: 12, fontWeight: 700, color: "#0d4f52", backgroundColor: "#66c3c6",
            border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer",
          }}>
            追加する
          </button>
        )}
        <button onClick={dismiss} style={{
          fontSize: 12, color: "#a0d4d6", background: "none", border: "none", cursor: "pointer", padding: 4,
        }}>
          ✕
        </button>
      </div>
    </div>
  );
}
