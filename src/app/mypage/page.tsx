"use client";
import { useState, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { User, CreditCard, Gift, Bell, ShoppingBag, Calendar, Copy, Check, LogOut } from "lucide-react";
import { CheckoutButton } from "@/components/CheckoutButton";

const PRIMARY = "#66c3c6";
const DARK = "#082b2e";
const MID = "#0d4f52";
const LIGHT = "#e8f9f9";
const BORDER = "#b3e8ea";

const PLAN_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  free:     { label: "辟｡譁吶・繝ｩ繝ｳ",           color: "#64748b", bg: "#f1f5f9" },
  notify:   { label: "騾夂衍繝励Λ繝ｳ",           color: "#0369a1", bg: "#eff6ff" },
  report:   { label: "繝ｬ繝昴・繝育┌蛻ｶ髯舌・繝ｩ繝ｳ", color: "#7c3aed", bg: "#f5f3ff" },
  complete: { label: "繧ｳ繝ｳ繝励Μ繝ｼ繝医ヱ繝・け",   color: "#d97706", bg: "#fffbeb" },
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
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  useEffect(() => {
    // 邂｡逅・・・繝ｬ繝薙Η繝ｼ繝｢繝ｼ繝会ｼ・RL縺ｫ?admin=1縺後≠繧句ｴ蜷茨ｼ・
    const isAdminPreview = new URLSearchParams(window.location.search).get("admin") === "1";
    
    fetch("/api/mypage", { cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        if (d.error && isAdminPreview) {
          // 邂｡逅・・・繝ｬ繝薙Η繝ｼ逕ｨ繝繝溘・繝・・繧ｿ
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
        setNotifySaveResult(`笶・${json.error ?? "菫晏ｭ倥↓螟ｱ謨励＠縺ｾ縺励◆"}`);
      } else {
        setNotifySaveResult("笨・騾夂衍險ｭ螳壹ｒ菫晏ｭ倥＠縺ｾ縺励◆");
      }
    } catch (e) {
      setNotifySaveResult("笶・騾壻ｿ｡繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆");
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
        setPortalError(body.error ?? "繝昴・繧ｿ繝ｫ縺ｮ襍ｷ蜍輔↓螟ｱ謨励＠縺ｾ縺励◆");
        return;
      }
      window.location.href = body.url;
    } catch {
      setPortalError("騾壻ｿ｡繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆");
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f4fbfc" }}>
      <p style={{ color: MID, fontSize: 14 }}>隱ｭ縺ｿ霎ｼ縺ｿ荳ｭ...</p>
    </div>
  );

  if (!data || data.error) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f4fbfc" }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ color: "#64748b", marginBottom: 16 }}>繝ｭ繧ｰ繧､繝ｳ縺悟ｿ・ｦ√〒縺・/p>
        <a href="/auth" style={{ padding: "10px 24px", backgroundColor: PRIMARY, color: "white", borderRadius: 8, textDecoration: "none", fontWeight: 700 }}>繝ｭ繧ｰ繧､繝ｳ</a>
      </div>
    </div>
  );

  const profile = data.profile ?? {};
  const plan = PLAN_LABELS[profile.plan ?? "free"] ?? PLAN_LABELS.free;
  const referralUrl = `https://ipo.finance-tower.com/?ref=${profile.referral_code ?? ""}`;
  const completedReferrals = (data.referralLogs ?? []).filter((r: any) => r.status === "completed").length;
  const freeMonthsEarned = completedReferrals * 2;

  // 繧ｫ繝ｬ繝ｳ繝繝ｼ繝｡繝｢縺ｮ譛亥挨謳咲寢髮・ｨ・
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

        {/* 繝倥ャ繝繝ｼ */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: DARK, margin: 0 }}>繝槭う繝壹・繧ｸ</h1>
            <p style={{ fontSize: 11, color: "#64748b", margin: "4px 0 0" }}>螟ｧ謇狗伴隱ｿ譟ｻ螳､荵晁ｪｲ</p>
          </div>
          <button onClick={handleLogout}
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 12px", borderRadius: 8, border: `1px solid ${BORDER}`, backgroundColor: "white", cursor: "pointer", fontSize: 12, color: "#64748b" }}>
            <LogOut size={13} />繝ｭ繧ｰ繧｢繧ｦ繝・
          </button>
        </div>

        {/* 1. 繧｢繧ｫ繧ｦ繝ｳ繝域ュ蝣ｱ */}
        <Section icon={<User size={16} />} title="繧｢繧ｫ繧ｦ繝ｳ繝域ュ蝣ｱ">
          <InfoRow label="繝｡繝ｼ繝ｫ繧｢繝峨Ξ繧ｹ" value={data.email ?? "-"} />
          <InfoRow label="逋ｻ骭ｲ譌･" value={profile.created_at ? new Date(profile.created_at).toLocaleDateString("ja-JP") : "-"} />
          <InfoRow label="繝ｦ繝ｼ繧ｶ繝ｼID" value={<span style={{ fontSize: 10, color: "#94a3b8" }}>{profile.id?.slice(0, 8)}...</span>} />
        </Section>

       {/* 2. 繝励Λ繝ｳ繝ｻ螂醍ｴ・憾豕・*/}
       <Section icon={<CreditCard size={16} />} title="繝励Λ繝ｳ繝ｻ螂醍ｴ・憾豕・>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 900, padding: "6px 14px", borderRadius: 20, backgroundColor: plan.bg, color: plan.color }}>
              {plan.label}
            </span>
          </div>
          {profile.subscription_end_at && (
            <InfoRow label="谺｡蝗樊峩譁ｰ譌･" value={new Date(profile.subscription_end_at).toLocaleDateString("ja-JP")} />
          )}
          {profile.free_until && new Date(profile.free_until) > new Date() && (
            <InfoRow label="辟｡譁呎悄髢鍋ｵゆｺ・律" value={
              <span style={{ color: "#15803d", fontWeight: 700 }}>
                {new Date(profile.free_until).toLocaleDateString("ja-JP")}・育ｴｹ莉狗音蜈ｸ・・
              </span>
            } />
          )}

<a href="/cancel"
            style={{ display: "block", textAlign: "center", width: "100%", marginTop: 16, padding: "12px", backgroundColor: "white", color: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, textDecoration: "none", fontWeight: 700, fontSize: 13, boxSizing: "border-box" }}>
            箔 繝励Λ繝ｳ螟画峩繝ｻ隗｣邏・・縺薙■繧・
          </a>

<div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${LIGHT}` }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: DARK, marginBottom: 12 }}>繝励Λ繝ｳ縺ｫ蜉蜈･繝ｻ繧｢繝・・繧ｰ繝ｬ繝ｼ繝・/p>
            <CheckoutButton availablePlans={["notify", "report", "complete"]} defaultPlan="notify" />
            <p style={{ fontSize: 11, color: "#64748b", marginTop: 10, lineHeight: 1.6 }}>
              庁 迚ｹ螳壹・1驫俶氛縺縺題ｪｭ縺ｿ縺溘＞蝣ｴ蜷医・縲∝推驫俶氛縺ｮ蛻・梵繝壹・繧ｸ縺九ｉ縲後す繝ｳ繧ｰ繝ｫ繝ｬ繝昴・繝医ｒ雉ｼ蜈･縲阪〒縺阪∪縺吶・
            </p>
          </div>
        </Section>

        {/* 3. 蜿矩＃諡帛ｾ・・繝ｭ繧ｰ繝ｩ繝 */}
        <Section icon={<Gift size={16} />} title="蜿矩＃諡帛ｾ・・繝ｭ繧ｰ繝ｩ繝">
          <div style={{ backgroundColor: LIGHT, borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: MID, marginBottom: 6, fontWeight: 700 }}>縺ゅ↑縺溘・諡帛ｾ・RL</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input readOnly value={referralUrl}
                style={{ flex: 1, fontSize: 11, padding: "6px 8px", borderRadius: 6, border: `1px solid ${BORDER}`, backgroundColor: "white", color: DARK }} />
              <button onClick={() => handleCopy(referralUrl)}
                style={{ padding: "6px 12px", backgroundColor: copied ? "#15803d" : PRIMARY, color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
                {copied ? <><Check size={11} />繧ｳ繝斐・貂・/> : <><Copy size={11} />繧ｳ繝斐・</>}
              </button>
            </div>
          </div>
          <InfoRow label="諡帛ｾ・さ繝ｼ繝・ value={<span style={{ fontFamily: "monospace", letterSpacing: 2 }}>{profile.referral_code ?? "-"}</span>} />
          <InfoRow label="諡帛ｾ・ｸ医∩莠ｺ謨ｰ" value={`${completedReferrals}蜷港} />
          <InfoRow label="迯ｲ蠕励＠縺溽┌譁呎怦謨ｰ" value={<span style={{ color: "#15803d", fontWeight: 900 }}>{freeMonthsEarned}繝ｶ譛・/span>} />
          <div style={{ marginTop: 12, padding: "10px 12px", backgroundColor: "#fffbeb", borderRadius: 8, border: "1px solid #fde68a", fontSize: 11, color: "#92400e" }}>
            庁 蜿矩＃縺檎匳骭ｲ縺吶ｋ縺ｨ縲√≠縺ｪ縺溘→蜿矩＃縺ｮ荳｡譁ｹ縺ｫ<strong>2繝ｶ譛育┌譁・/strong>縺御ｻ倅ｸ弱＆繧後∪縺・
          </div>
        </Section>

        {/* 4. 騾夂衍險ｭ螳・*/}
        <Section icon={<Bell size={16} />} title="騾夂衍險ｭ螳・>
          <p style={{ fontSize: 11, color: "#64748b", marginBottom: 14 }}>豈朱ｱ驥第屆18譎ゅ↓鄙碁ｱ縺ｮIPO繧､繝吶Φ繝医ｒ繝｡繝ｼ繝ｫ縺ｧ縺顔衍繧峨○縺励∪縺吶・/p>
          {[
            { key: "notify_bb",      label: "洶 BB髢句ｧ区律" },
            { key: "notify_apply",   label: "統 逕ｳ霎ｼ髢句ｧ区律" },
            { key: "notify_listing", label: "閥 荳雁ｴ譌･" },
            { key: "notify_daily_reminder", label: "竢ｰ 蜑肴律繝ｪ繝槭う繝ｳ繝繝ｼ・域ｯ取律12譎ゅ・鄙梧律蛻・・縺ｿ・・ },
            { key: "notify_lockup_90",  label: "箔 繝ｭ繝・け繧｢繝・・90譌･隗｣髯､" },
            { key: "notify_lockup_180", label: "箔 繝ｭ繝・け繧｢繝・・180譌･隗｣髯､" },
            { key: "method_email",   label: "透 繝｡繝ｼ繝ｫ騾夂衍" },
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
            {savingNotify ? "菫晏ｭ倅ｸｭ..." : "騾夂衍險ｭ螳壹ｒ菫晏ｭ倥☆繧・}
          </button>
          {notifySaveResult && (
            <p style={{ marginTop: 10, fontSize: 12, textAlign: "center", color: notifySaveResult.startsWith("笶・) ? "#dc2626" : "#15803d", fontWeight: 700 }}>
              {notifySaveResult}
            </p>
          )}
        </Section>

        {/* 5. 雉ｼ蜈･貂医∩繝ｬ繝昴・繝・*/}
        <Section icon={<ShoppingBag size={16} />} title="雉ｼ蜈･貂医∩繝ｬ繝昴・繝・>
          {data.purchases.length === 0 ? (
            <p style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: "16px 0" }}>雉ｼ蜈･貂医∩縺ｮ繝ｬ繝昴・繝医・縺ゅｊ縺ｾ縺帙ｓ</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.purchases.map((p: any) => (
                <a key={p.id} href={`/analysis/${p.company_id}`}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", backgroundColor: LIGHT, borderRadius: 8, border: `1px solid ${BORDER}`, textDecoration: "none" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: DARK }}>{p.ipo_companies?.name ?? "荳肴・"}</div>
                    <div style={{ fontSize: 10, color: "#64748b" }}>{p.ipo_companies?.listing_date} ﾂｷ ﾂ･{p.amount?.toLocaleString()}</div>
                  </div>
                  <span style={{ fontSize: 11, color: PRIMARY, fontWeight: 700 }}>繝ｬ繝昴・繝医ｒ隕九ｋ 竊・/span>
                </a>
              ))}
            </div>
          )}
        </Section>

        {/* 6. 繧ｫ繝ｬ繝ｳ繝繝ｼ繝｡繝｢繝ｻ謳咲寢螻･豁ｴ */}
        <Section icon={<Calendar size={16} />} title="IPO繧ｫ繝ｬ繝ｳ繝繝ｼ 謳咲寢螻･豁ｴ・育峩霑・繝ｶ譛茨ｼ・>
          {Object.keys(pnlByMonth).length === 0 ? (
            <p style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: "16px 0" }}>險倬鹸縺ｯ縺ゅｊ縺ｾ縺帙ｓ</p>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                {Object.entries(pnlByMonth).sort((a, b) => b[0].localeCompare(a[0])).map(([month, pnl]) => (
                  <div key={month} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", backgroundColor: (pnl as number) >= 0 ? "#f0fdf4" : "#fef2f2", borderRadius: 8, border: `1px solid ${(pnl as number) >= 0 ? "#bbf7d0" : "#fecaca"}` }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: DARK }}>{month.replace("-", "蟷ｴ")}譛・/span>
                    <span style={{ fontSize: 14, fontWeight: 900, color: (pnl as number) >= 0 ? "#15803d" : "#b91c1c" }}>
                      {(pnl as number) >= 0 ? "+" : ""}{(pnl as number).toLocaleString()}蜀・
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
                        {n.pnl >= 0 ? "+" : ""}{n.pnl.toLocaleString()}蜀・
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