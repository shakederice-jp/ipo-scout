"use client";

import { useEffect, useState } from "react";

// 2026/11/13新設: 紹介特典の「受付中/受付終了」を、公開API(/api/referral/status)から取得する。
// 取得できないとき(通信エラーなど)は null を返し、画面は従来どおり「受付中」の表示にする。
export type ReferralOpenStatus = { open: boolean; remaining: number; cap: number } | null;

export function useReferralStatus(): ReferralOpenStatus {
  const [status, setStatus] = useState<ReferralOpenStatus>(null);
  useEffect(() => {
    let alive = true;
    fetch("/ipo-jp/api/referral/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j && typeof j.open === "boolean") setStatus(j); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return status;
}
