"use client";
import { useState, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { User, CreditCard, Gift, Bell, ShoppingBag, Calendar, Copy, Check, LogOut, TrendingUp, Trash2 } from "lucide-react";
import { CheckoutButton } from "@/components/CheckoutButton";

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
  const [inviteCopied, setInviteCopied] = useState(false);
  const [notifyState, setNotifyState] = useState<any>(null);
  const [savingNotify, setSavingNotify] = useState(false);
  const [notifySaveResult, setNotifySaveResult] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [deletingPortfolioId, setDeletingPortfolioId] = useState<string | null>(null);

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
            virtualInvestments: [],
            latestPrices: {},
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

  // 2026/9/12改修: 「マイポートフォリオ」と「お気に入り銘柄」の削除ボタンを統合。
  // 銘柄がvirtual_investments(100万円シミュレーション追跡)・favorite_companies
  // (お気に入り登録)のどちらか、または両方に登録されている可能性があるため、
  // 該当する方だけ(両方登録されていれば両方)を削除する。
  const handleRemovePortfolioItem = async (companyId: string, name: string, hasInvestment: boolean, hasFavorite: boolean) => {
    if (!confirm(`「${name}」をマイポートフォリオから削除しますか？（元に戻せません）`)) return;
    setDeletingPortfolioId(companyId);
    try {
      const tasks: Promise<Response>[] = [];
      if (hasInvestment) {
        tasks.push(fetch("/api/portfolio", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId }),
        }));
      }
      if (hasFavorite) {
        tasks.push(fetch(`/api/favorite-companies?companyId=${companyId}`, { method: "DELETE" }));
      }
      const results = await Promise.all(tasks);
      if (results.some((r) => !r.ok)) {
        alert("削除に失敗しました");
        return;
      }
      setData((prev: any) => ({
        ...prev,
        virtualInvestments: (prev?.virtualInvestments ?? []).filter((v: any) => v.company_id !== companyId),
        favoriteCompanies: (prev?.favoriteCompanies ?? []).filter((f: any) => f.company_id !== companyId),
      }));
    } catch {
      alert("通信エラーが発生しました");
    } finally {
      setDeletingPortfolioId(null);
    }
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
  const handleOpenPortal = async () => {
    setPortalLoading(true);
    setPortalError(null);
    try {
      const res = await fetch("/api/portal", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setPortalError(body.error ?? "ポータルの起動に失敗しました");
        return;
      }
      window.location.href = body.url;
    } catch {
      setPortalError("通信エラーが発生しました");
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f4fbfc" }}>
      <p style={{ color: MID, fontSize: 14 }}>読み込み中...</p>
    </div>
  );

  if (!data || data.error) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f4fbfc" }}>
      {/* 2026/9/12改修: 「ログインが必要です」の一文だけでは、マイページで何が
          できるようになるのか(=無料会員登録だけで使える機能)が伝わらなかったため、
          具体的なメリットを添えた(サイト全体のフリー/有料導線見直しの一環)。 */}
      <div style={{ textAlign: "center", maxWidth: 320, padding: "0 16px" }}>
        <p style={{ color: "#64748b", marginBottom: 8, fontWeight: 700 }}>ログインが必要です</p>
        <p style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.8, marginBottom: 20 }}>
          無料会員登録（メールアドレスのみ・課金不要）だけで、お気に入り銘柄の登録・100万円投資シミュレーション・カレンダーメモ・友達紹介特典（2ヶ月無料）がご利用いただけます。
        </p>
        <a href="/auth" style={{ padding: "10px 24px", backgroundColor: PRIMARY, color: "white", borderRadius: 8, textDecoration: "none", fontWeight: 700 }}>ログイン / 無料会員登録</a>
      </div>
    </div>
  );

  const profile = data.profile ?? {};
  const plan = PLAN_LABELS[profile.plan ?? "free"] ?? PLAN_LABELS.free;
  const referralUrl = `https://ipo.finance-tower.com/?ref=${profile.referral_code ?? ""}`;
  const completedReferrals = (data.referralLogs ?? []).filter((r: any) => r.status === "completed").length;
  const freeMonthsEarned = completedReferrals * 2;

  // 2026/9/6新設: 「招待する側が招待文を自分で考えなければならず面倒」との指摘を受け、
  // サイトの魅力を端的に盛り込んだ招待文をあらかじめ用意し、X・LINE・メール・コピーの
  // ワンタップ導線を用意した(招待コード付きURLは共通、文面は各チャネルの慣習に合わせて微調整)。
  const inviteMessage =
    `📊 IPOの目論見書をAIが読み込んで分析してくれる「IPO企業情報AI分析レポート」を使っています。\n` +
    `初心者向け・中上級者向けどちらの分析も見られて、毎月最初の2社ぶんは無料。公募価格で100万円投資していたら今いくらか、というシミュレーションも見られて面白いです。\n\n` +
    `このリンクから登録すると、お互いにプレミアムプラン2ヶ月無料になります🎁（先着100名限定）\n${referralUrl}`;
  const inviteMessageX =
    `📊 目論見書をAIが解析して初心者にも分かりやすく教えてくれる「IPO企業情報AI分析レポート」を使ってます。毎月2社は無料、100万円投資シミュレーションも面白い。\n` +
    `このリンクから登録で、お互いプレミアム2ヶ月無料🎁（先着100名限定）\n${referralUrl}\n#IPO投資`;
  const inviteSubjectEmail = `「IPO企業情報AI分析レポート」のご紹介`;
  const inviteBodyEmail =
    `いつもお世話になっております。\n\n` +
    `IPO(新規上場株)の投資判断に役立つ「IPO企業情報AI分析レポート」というサービスを使っているのでご紹介します。\n\n` +
    `企業が金融庁に提出する目論見書をAIが読み込み、財務状況やリスクを初心者にも分かりやすくまとめてくれるサービスです。毎月最初の2社は無料で読めます。「公募価格で100万円投資していたら今いくらになっているか」を自動で計算してくれる機能もあり、なかなか面白いです。\n\n` +
    `以下の招待リンクから登録いただくと、お互いにプレミアムプラン2ヶ月無料の特典が付きます（先着100名限定）。よろしければ試してみてください。\n\n${referralUrl}`;

  const handleShareX = () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(inviteMessageX)}`, "_blank", "noopener,noreferrer");
  };
  const handleShareLine = () => {
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(inviteMessage)}`, "_blank", "noopener,noreferrer");
  };
  const handleShareEmail = () => {
    window.location.href = `mailto:?subject=${encodeURIComponent(inviteSubjectEmail)}&body=${encodeURIComponent(inviteBodyEmail)}`;
  };
  const handleCopyInvite = () => {
    // 2026/9/6: handleCopy()は既存の「招待URLコピー」ボタン用のcopiedを更新してしまうため、
    // 別ボタンであるここでは巻き込まないよう、あえてclipboard書き込みを直接行っている。
    navigator.clipboard.writeText(inviteMessage);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

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

  // 2026/9/12改修: 「マイポートフォリオ(100万円投資シミュレーション)」と「お気に入り銘柄」を
  // 1つの一覧に統合。上場前は「上場予定日」表示、上場後は「公募¥→現在¥」の投資
  // シミュレーション表示に自動的に切り替える(ユーザー指示: 2つを分ける意味がなくなったため)。
  const todayStr = new Date().toISOString().slice(0, 10);
  const portfolioMap = new Map<string, any>();
  (data.virtualInvestments ?? []).forEach((v: any) => {
    portfolioMap.set(v.company_id, {
      companyId: v.company_id,
      company: v.ipo_companies ?? {},
      investedAmount: v.invested_amount ?? 1000000,
      entryPrice: v.entry_price,
      hasInvestment: true,
      hasFavorite: false,
    });
  });
  (data.favoriteCompanies ?? []).forEach((f: any) => {
    const existing = portfolioMap.get(f.company_id);
    if (existing) {
      existing.hasFavorite = true;
    } else {
      const c = f.ipo_companies ?? {};
      portfolioMap.set(f.company_id, {
        companyId: f.company_id,
        company: c,
        investedAmount: 1000000,
        entryPrice: c.ipo_price ?? null,
        hasInvestment: false,
        hasFavorite: true,
      });
    }
  });
  const portfolioItems = Array.from(portfolioMap.values());

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

<a href="/cancel"
            style={{ display: "block", textAlign: "center", width: "100%", marginTop: 16, padding: "12px", backgroundColor: "white", color: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, textDecoration: "none", fontWeight: 700, fontSize: 13, boxSizing: "border-box" }}>
            🔓 プラン変更・解約はこちら
          </a>

<div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${LIGHT}` }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: DARK, marginBottom: 12 }}>プランに加入・アップグレード</p>
            <CheckoutButton availablePlans={["notify", "report", "complete"]} defaultPlan="notify" />
            <p style={{ fontSize: 11, color: "#64748b", marginTop: 10, lineHeight: 1.6 }}>
              💡 特定の1銘柄だけ読みたい場合は、各銘柄の分析ページから「シングルレポートを購入」できます。
            </p>
          </div>
        </Section>

        {/* 2.5 マイポートフォリオ（100万円投資シミュレーション） 2026/9/6新設、2026/9/12改修:
            従来の「マイポートフォリオ」(virtual_investments、追跡開始が必要)と
            「お気に入り銘柄」(favorite_companies、上場前から登録可)を1つの一覧に統合。
            上場前の銘柄は「上場予定日」、上場済みの銘柄は「公募¥→現在¥」の
            投資シミュレーション表示に自動的に切り替わる。 */}
        {portfolioItems.length > 0 && (
          <Section icon={<TrendingUp size={16} />} title="マイポートフォリオ（100万円投資シミュレーション）">
            <p style={{ fontSize: 11, color: "#64748b", marginBottom: 14, lineHeight: 1.6 }}>
              気になる銘柄・投資を追跡中の銘柄の一覧です。上場後は、公募価格で100万円ずつ投資したと仮定した場合の現在の評価額を表示します（銘柄ごとに独立した試算で、実際の売買ではありません）。
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {portfolioItems.map((item) => {
                const c = item.company;
                const isListed = !!c.listing_date && c.listing_date <= todayStr;
                const entryPrice = item.entryPrice ?? c.ipo_price ?? null;

                // 上場前(または上場済みでも公募価格が未確定)の銘柄: シンプルなカード表示
                if (!isListed || !entryPrice) {
                  return (
                    <div key={item.companyId}
                      style={{ padding: "12px 14px", backgroundColor: LIGHT, borderRadius: 10, border: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <a href={`/analysis/${item.companyId}`} style={{ textDecoration: "none", flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 900, color: DARK }}>{c.name ?? "不明"}</div>
                        <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
                          {[c.exchange, c.sector].filter(Boolean).join("・")}
                          {isListed ? (c.listing_date ? `（上場日：${c.listing_date}・公募価格未確定）` : "") : (c.listing_date ? `（上場予定日：${c.listing_date}）` : "")}
                        </div>
                      </a>
                      <button
                        onClick={() => handleRemovePortfolioItem(item.companyId, c.name ?? "この銘柄", item.hasInvestment, item.hasFavorite)}
                        disabled={deletingPortfolioId === item.companyId}
                        title="マイポートフォリオから削除"
                        style={{ background: "none", border: "none", cursor: deletingPortfolioId === item.companyId ? "default" : "pointer", padding: 2, color: "#94a3b8", flexShrink: 0 }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                }

                // 上場済みの銘柄: 公募¥→現在¥の投資シミュレーション表示
                const invested = item.investedAmount ?? 1000000;
                const latest = data.latestPrices?.[item.companyId];
                const currentPrice = latest?.price ?? entryPrice;
                const currentValue = entryPrice > 0 ? Math.round((invested / entryPrice) * currentPrice) : invested;
                const pnl = currentValue - invested;
                const pnlPercent = invested > 0 ? Math.round((pnl / invested) * 1000) / 10 : 0;
                const isGain = pnl >= 0;
                return (
                  <div key={item.companyId}
                    style={{ padding: "12px 14px", backgroundColor: isGain ? "#f0fdf4" : "#fef2f2", borderRadius: 10, border: `1px solid ${isGain ? "#bbf7d0" : "#fecaca"}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <a href={`/analysis/${item.companyId}`} style={{ textDecoration: "none", flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 900, color: DARK }}>{c.name ?? "不明"}</div>
                        <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
                          公募¥{entryPrice?.toLocaleString()} → 現在¥{currentPrice?.toLocaleString()}
                          {latest?.price_date && <>（{latest.price_date}時点）</>}
                        </div>
                      </a>
                      <div style={{ textAlign: "right", flexShrink: 0, display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <a href={`/analysis/${item.companyId}`} style={{ textDecoration: "none" }}>
                          <div style={{ fontSize: 14, fontWeight: 900, color: isGain ? "#15803d" : "#b91c1c" }}>
                            {isGain ? "+" : ""}{pnlPercent}%
                          </div>
                          <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
                            評価額 ¥{currentValue.toLocaleString()}
                          </div>
                        </a>
                        <button
                          onClick={() => handleRemovePortfolioItem(item.companyId, c.name ?? "この銘柄", item.hasInvestment, item.hasFavorite)}
                          disabled={deletingPortfolioId === item.companyId}
                          title="マイポートフォリオから削除"
                          style={{ background: "none", border: "none", cursor: deletingPortfolioId === item.companyId ? "default" : "pointer", padding: 2, color: "#94a3b8", flexShrink: 0 }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* 3. 友達招待プログラム */}
        <Section icon={<Gift size={16} />} title="友達招待プログラム">
          {/* 2026/9/6追加: X(旧Twitter)のプロフィールで「先着100名限定」特典を
              打ち出したのにあわせ、アプリ側の招待プログラムにも同じ訴求を表示する。
              (実際の残り人数を数える仕組みはまだ無く、あくまで訴求文言としての表示) */}
          <div style={{ marginBottom: 12 }}>
            <span style={{ display: "inline-block", fontSize: 10, fontWeight: 900, color: "white", backgroundColor: "#dc2626", borderRadius: 6, padding: "3px 10px" }}>
              🎉 先着100名限定キャンペーン実施中
            </span>
          </div>
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

          {/* 2026/9/6追加: 「招待する側が招待文を自分で考えなければならず面倒」との指摘を受け、
              サイトの魅力を端的に盛り込んだ招待文つきのワンタップ共有ボタンを用意した。 */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: MID, marginBottom: 6, fontWeight: 700 }}>かんたん招待（招待文つき）</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={handleShareX}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px", borderRadius: 8, border: "none", backgroundColor: "#000", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                𝕏 でシェア
              </button>
              <button onClick={handleShareLine}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px", borderRadius: 8, border: "none", backgroundColor: "#06C755", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                💬 LINEで送る
              </button>
              <button onClick={handleShareEmail}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px", borderRadius: 8, border: "none", backgroundColor: MID, color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                📧 メールで送る
              </button>
              <button onClick={handleCopyInvite}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px", borderRadius: 8, border: `1.5px solid ${PRIMARY}`, backgroundColor: inviteCopied ? "#dcfce7" : "white", color: inviteCopied ? "#15803d" : MID, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                {inviteCopied ? <><Check size={14} />招待文をコピーしました</> : <><Copy size={14} />招待文をコピー（Slack・Discordなど）</>}
              </button>
            </div>
          </div>

          <InfoRow label="招待コード" value={<span style={{ fontFamily: "monospace", letterSpacing: 2 }}>{profile.referral_code ?? "-"}</span>} />
          <InfoRow label="招待済み人数" value={`${completedReferrals}名`} />
          <InfoRow label="獲得した無料月数" value={<span style={{ color: "#15803d", fontWeight: 900 }}>{freeMonthsEarned}ヶ月</span>} />
          <div style={{ marginTop: 12, padding: "10px 12px", backgroundColor: "#fffbeb", borderRadius: 8, border: "1px solid #fde68a", fontSize: 11, color: "#92400e" }}>
            💡 友達が登録すると、あなたと友達の両方に<strong>2ヶ月無料</strong>が付与されます（<strong>先着100名限定</strong>・予告なく終了する場合があります）
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