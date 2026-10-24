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
        // 2026/10/24(束A・⑤): 運営の公式コード(キャンペーンページ経由)は、友達の紹介コードがすでに預かってある場合は上書きしない
        // (友達の紹介を優先し、紹介した友達に特典が付くようにするため)。
        if (urlRef.trim().toUpperCase() === "OTEMACHI9") {
          try {
            const old = JSON.parse(localStorage.getItem("pendingReferralCode") ?? "null");
            if (old?.code && Date.now() - Number(old.savedAt) < 30 * 86400000) return;
          } catch {}
        }
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
