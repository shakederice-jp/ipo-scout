"use client";
import { useState, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { User, CreditCard, Gift, Bell, ShoppingBag, Calendar, Copy, Check, LogOut } from "lucide-react";

const PRIMARY = "#66c3c6";
const DARK = "#082b2e";
const MID = "#0d4f52";
const LIGHT = "#e8f9f9";
const BORDER = "#b3e8ea";

const PLAN_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  free:     { label: "無料プラン",           color: "#64748b", bg: "#f1f5f9" },
  notify:   { label: "通知プラン",           color: "#0369a1", bg: "#eff6ff" },
  report:   { label: "レポート無制限プラン", color: "#7c3aed", bg: "#f5f3ff" },
  complete: { label: "コンプリートパック",   color: "#d97706", bg: "#fffbeb" },
};

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "white", borderRadius: 16, border: `1px solid ${BORDER}`, padding: "20px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${LIGHT}` }}>
        <span style={{ color: PRIMARY }}>{icon}</span>
        <h2 style={{ fontSize: 15, fontWeight: 900, color: DARK, margin: 0 }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${LIGHT}` }}>
      <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 13, color: DARK, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

export default function MyPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [notifyState, setNotifyState] = useState<any>(null);
  const [savingNotify, setSavingNotify] = useState(false);
  const [notifySaveResult, setNotifySaveResult] = useState<string | null>(null);

  useEffect(() => {
    // 管理者プレビューモード（URLに?admin=1がある場合）
    const isAdminPreview = new URLSearchParams(window.location.search).get("admin") === "1";
    
    fetch("/api/mypage", { cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        if (d.error && isAdminPreview) {
          // 管理者プレビュー用ダミーデータ
          setData({
            email: "shakederice@gmail.com",
            profile: {
              id: "749843f1-8dd5-4fd7-8e1b-43933af8a8cf",
              plan: "free",
              referral_code: "DEMO1234",
              referral_count: 0,
              referral_credits: 0,
              created_at: new Date().toISOString(),
            },
            referralLogs: [],
            purchases: [],
            notifySettings: {
              notify_bb: true,
              notify_daily_reminder: false,
              notify_apply: true,
              notify_listing: true,
              notify_lockup_90: false,
              notify_lockup_180: false,
              method_email: true,
            },
            calendarNotes: [],
          });
        } else {
          setData(d);
          setNotifyState(d.notifySettings);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveNotify = async () => {
    if (!notifyState) return;
    setSavingNotify(true);
    setNotifySaveResult(null);
    try {
      const res = await fetch("/api/notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: data.profile?.id,
          company_id: null,
          ...notifyState,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotifySaveResult(`❌ ${json.error ?? "保存に失敗しました"}`);
      } else {
        setNotifySaveResult("✅ 通知設定を保存しました");
      }
    } catch (e) {
      setNotifySaveResult("❌ 通信エラーが発生しました");
    }
    setSavingNotify(false);
  };

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f4fbfc" }}>
      <p style={{ color: MID, fontSize: 14 }}>読み込み中...</p>
    </div>
  );

  if (!data || data.error) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f4fbfc" }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ color: "#64748b", marginBottom: 16 }}>ログインが必要です</p>
        <a href="/auth" style={{ padding: "10px 24px", backgroundColor: PRIMARY, color: "white", borderRadius: 8, textDecoration: "none", fontWeight: 700 }}>ログイン</a>
      </div>
    </div>
  );

  const profile = data.profile ?? {};
  const plan = PLAN_LABELS[profile.plan ?? "free"] ?? PLAN_LABELS.free;
  const referralUrl = `https://ipo-jp.vercel.app/?ref=${profile.referral_code ?? ""}`;
  const completedReferrals = (data.referralLogs ?? []).filter((r: any) => r.status === "completed").length;
  const freeMonthsEarned = completedReferrals * 2;

  // カレンダーメモの月別損益集計
  const pnlByMonth: Record<string, number> = {};
  (data.calendarNotes ?? []).forEach((n: any) => {
    if (n.pnl == null) return;
    const month = n.note_date.slice(0, 7);
    pnlByMonth[month] = (pnlByMonth[month] ?? 0) + n.pnl;
  });

  const toggleNotify = (key: string) => {
    setNotifyState((prev: any) => ({ ...prev, [key]: !prev?.[key] }));
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f4fbfc", fontFamily: "'Noto Sans JP',sans-serif" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px 48px" }}>

        {/* ヘッダー */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: DARK, margin: 0 }}>マイページ</h1>
            <p style={{ fontSize: 11, color: "#64748b", margin: "4px 0 0" }}>大手町調査室九課</p>
          </div>
          <button onClick={handleLogout}
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 12px", borderRadius: 8, border: `1px solid ${BORDER}`, backgroundColor: "white", cursor: "pointer", fontSize: 12, color: "#64748b" }}>
            <LogOut size={13} />ログアウト
          </button>
        </div>

        {/* 1. アカウント情報 */}
        <Section icon={<User size={16} />} title="アカウント情報">
          <InfoRow label="メールアドレス" value={data.email ?? "-"} />
          <InfoRow label="登録日" value={profile.created_at ? new Date(profile.created_at).toLocaleDateString("ja-JP") : "-"} />
          <InfoRow label="ユーザーID" value={<span style={{ fontSize: 10, color: "#94a3b8" }}>{profile.id?.slice(0, 8)}...</span>} />
        </Section>

        {/* 2. プラン・契約状況 */}
        <Section icon={<CreditCard size={16} />} title="プラン・契約状況">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 900, padding: "6px 14px", borderRadius: 20, backgroundColor: plan.bg, color: plan.color }}>
              {plan.label}
            </span>
          </div>
          {profile.subscription_end_at && (
            <InfoRow label="次回更新日" value={new Date(profile.subscription_end_at).toLocaleDateString("ja-JP")} />
          )}
          {profile.free_until && new Date(profile.free_until) > new Date() && (
            <InfoRow label="無料期間終了日" value={
              <span style={{ color: "#15803d", fontWeight: 700 }}>
                {new Date(profile.free_until).toLocaleDateString("ja-JP")}（紹介特典）
              </span>
            } />
          )}
          <div style={{ marginTop: 12 }}>
            <a href="/" style={{ fontSize: 12, color: PRIMARY, fontWeight: 700, textDecoration: "none" }}>
              プランを変更する →
            </a>
          </div>
        </Section>

        {/* 3. 友達招待プログラム */}
        <Section icon={<Gift size={16} />} title="友達招待プログラム">
          <div style={{ backgroundColor: LIGHT, borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: MID, marginBottom: 6, fontWeight: 700 }}>あなたの招待URL</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input readOnly value={referralUrl}
                style={{ flex: 1, fontSize: 11, padding: "6px 8px", borderRadius: 6, border: `1px solid ${BORDER}`, backgroundColor: "white", color: DARK }} />
              <button onClick={() => handleCopy(referralUrl)}
                style={{ padding: "6px 12px", backgroundColor: copied ? "#15803d" : PRIMARY, color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
                {copied ? <><Check size={11} />コピー済</> : <><Copy size={11} />コピー</>}
              </button>
            </div>
          </div>
          <InfoRow label="招待コード" value={<span style={{ fontFamily: "monospace", letterSpacing: 2 }}>{profile.referral_code ?? "-"}</span>} />
          <InfoRow label="招待済み人数" value={`${completedReferrals}名`} />
          <InfoRow label="獲得した無料月数" value={<span style={{ color: "#15803d", fontWeight: 900 }}>{freeMonthsEarned}ヶ月</span>} />
          <div style={{ marginTop: 12, padding: "10px 12px", backgroundColor: "#fffbeb", borderRadius: 8, border: "1px solid #fde68a", fontSize: 11, color: "#92400e" }}>
            💡 友達が登録すると、あなたと友達の両方に<strong>2ヶ月無料</strong>が付与されます
          </div>
        </Section>

        {/* 4. 通知設定 */}
        <Section icon={<Bell size={16} />} title="通知設定">
          <p style={{ fontSize: 11, color: "#64748b", marginBottom: 14 }}>毎週金曜18時に翌週のIPOイベントをメールでお知らせします。</p>
          {[
            { key: "notify_bb",      label: "🟦 BB開始日" },
            { key: "notify_apply",   label: "📝 申込開始日" },
            { key: "notify_listing", label: "🔴 上場日" },
            { key: "notify_daily_reminder", label: "⏰ 前日リマインダー（毎日12時・翌日分のみ）" },
            { key: "notify_lockup_90",  label: "🔓 ロックアップ90日解除" },
            { key: "notify_lockup_180", label: "🔓 ロックアップ180日解除" },
            { key: "method_email",   label: "📧 メール通知" },
          ].map(({ key, label }) => (
            <div key={key} onClick={() => toggleNotify(key)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${LIGHT}`, cursor: "pointer" }}>
              <span style={{ fontSize: 13, color: DARK }}>{label}</span>
              <div style={{ width: 36, height: 20, borderRadius: 10, backgroundColor: notifyState?.[key] ? PRIMARY : "#e2e8f0", position: "relative", transition: "background 0.2s" }}>
                <div style={{ position: "absolute", top: 2, left: notifyState?.[key] ? 18 : 2, width: 16, height: 16, borderRadius: "50%", backgroundColor: "white", transition: "left 0.2s" }} />
              </div>
            </div>
          ))}
          <button onClick={handleSaveNotify} disabled={savingNotify}
            style={{ width: "100%", marginTop: 14, padding: "10px", backgroundColor: savingNotify ? "#94a3b8" : PRIMARY, color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
            {savingNotify ? "保存中..." : "通知設定を保存する"}
          </button>
          {notifySaveResult && (
            <p style={{ marginTop: 10, fontSize: 12, textAlign: "center", color: notifySaveResult.startsWith("❌") ? "#dc2626" : "#15803d", fontWeight: 700 }}>
              {notifySaveResult}
            </p>
          )}
        </Section>

        {/* 5. 購入済みレポート */}
        <Section icon={<ShoppingBag size={16} />} title="購入済みレポート">
          {data.purchases.length === 0 ? (
            <p style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: "16px 0" }}>購入済みのレポートはありません</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.purchases.map((p: any) => (
                <a key={p.id} href={`/analysis/${p.company_id}`}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", backgroundColor: LIGHT, borderRadius: 8, border: `1px solid ${BORDER}`, textDecoration: "none" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: DARK }}>{p.ipo_companies?.name ?? "不明"}</div>
                    <div style={{ fontSize: 10, color: "#64748b" }}>{p.ipo_companies?.listing_date} · ¥{p.amount?.toLocaleString()}</div>
                  </div>
                  <span style={{ fontSize: 11, color: PRIMARY, fontWeight: 700 }}>レポートを見る →</span>
                </a>
              ))}
            </div>
          )}
        </Section>

        {/* 6. カレンダーメモ・損益履歴 */}
        <Section icon={<Calendar size={16} />} title="IPOカレンダー 損益履歴（直近3ヶ月）">
          {Object.keys(pnlByMonth).length === 0 ? (
            <p style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: "16px 0" }}>記録はありません</p>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                {Object.entries(pnlByMonth).sort((a, b) => b[0].localeCompare(a[0])).map(([month, pnl]) => (
                  <div key={month} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", backgroundColor: (pnl as number) >= 0 ? "#f0fdf4" : "#fef2f2", borderRadius: 8, border: `1px solid ${(pnl as number) >= 0 ? "#bbf7d0" : "#fecaca"}` }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: DARK }}>{month.replace("-", "年")}月</span>
                    <span style={{ fontSize: 14, fontWeight: 900, color: (pnl as number) >= 0 ? "#15803d" : "#b91c1c" }}>
                      {(pnl as number) >= 0 ? "+" : ""}{(pnl as number).toLocaleString()}円
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {(data.calendarNotes ?? []).filter((n: any) => n.pnl != null || n.memo).slice(0, 10).map((n: any) => (
                  <div key={n.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 10px", backgroundColor: "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0" }}>
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: MID }}>{n.note_date}</span>
                      {n.memo && <p style={{ fontSize: 11, color: "#475569", margin: "2px 0 0", lineHeight: 1.5 }}>{n.memo}</p>}
                    </div>
                    {n.pnl != null && (
                      <span style={{ fontSize: 12, fontWeight: 900, color: n.pnl >= 0 ? "#15803d" : "#b91c1c", flexShrink: 0, marginLeft: 8 }}>
                        {n.pnl >= 0 ? "+" : ""}{n.pnl.toLocaleString()}円
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </Section>

      </div>
    </div>
  );
}