"use client";

import { useEffect } from "react";

// 2026/9/6新設: 紹介プログラムが機能していなかった根本原因への対応。
// 招待リンクは `https://ipo.finance-tower.com/?ref=コード` のようにトップページへ
// 案内する形になっているが、これまでは新規登録画面(/auth)を直接開いた瞬間のURLに
// しか反応しなかったため、トップページを見てから別のリンクを辿って登録画面に進むと
// 紹介コードの情報が失われ、特典が一切適用されない状態だった。
// これを防ぐため、サイトのどのページであっても`?ref=`付きのURLで訪れた時点で
// コードをブラウザに一時保存しておき(30日間有効)、実際の登録時(/auth側)にそれを
// 読み取って使う。全ページ共通のlayout.tsxから読み込む、表示なしのコンポーネント。
export default function ReferralCapture() {
  useEffect(() => {
    try {
      const urlRef = new URLSearchParams(window.location.search).get("ref");
      if (urlRef && urlRef.trim()) {
        localStorage.setItem(
          "pendingReferralCode",
          JSON.stringify({ code: urlRef.trim(), savedAt: Date.now() })
        );
      }
    } catch {
      // localStorageが使えない環境では何もしない(紹介コードが保存されないだけ)
    }
  }, []);

  return null;
}
