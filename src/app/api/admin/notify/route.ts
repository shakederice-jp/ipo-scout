import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const resend = new Resend(process.env.RESEND_API_KEY);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST() {
  // 鄙碁ｱ譛域屆縲懈律譖懊・遽・峇繧定ｨ育ｮ・
  const now = new Date();
  const dow = now.getDay(); // 0=譌･, 5=驥・
  const daysUntilMonday = dow === 0 ? 1 : 8 - dow;
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + daysUntilMonday);
  nextMonday.setHours(0, 0, 0, 0);
  const nextSunday = new Date(nextMonday);
  nextSunday.setDate(nextMonday.getDate() + 6);
  nextSunday.setHours(23, 59, 59, 999);

  const fromDate = nextMonday.toISOString().split("T")[0];
  const toDate   = nextSunday.toISOString().split("T")[0];

  // 鄙碁ｱ縺ｮBB髢句ｧ九・逕ｳ霎ｼ髢句ｧ九・荳雁ｴ驫俶氛繧貞叙蠕・
  const { data: bbCompanies } = await supabase
    .from("ipo_companies")
    .select("*")
    .gte("bb_start_date", fromDate)
    .lte("bb_start_date", toDate);

  const { data: applyCompanies } = await supabase
    .from("ipo_companies")
    .select("*")
    .gte("apply_start_date", fromDate)
    .lte("apply_start_date", toDate);

  const { data: listingCompanies } = await supabase
    .from("ipo_companies")
    .select("*")
    .gte("listing_date", fromDate)
    .lte("listing_date", toDate);

  const hasAny = (bbCompanies?.length ?? 0) + (applyCompanies?.length ?? 0) + (listingCompanies?.length ?? 0) > 0;
  if (!hasAny) {
    return NextResponse.json({ message: "鄙碁ｱ縺ｮ騾夂衍蟇ｾ雎｡縺ｪ縺・, sent: 0 });
  }

  // 騾夂衍險ｭ螳壹ｒ蜿門ｾ・
  const { data: settings } = await supabase
    .from("notification_settings")
    .select("user_id, notify_bb, notify_apply, notify_listing, method_email")
    .eq("method_email", true);

  if (!settings || settings.length === 0) {
    return NextResponse.json({ message: "騾夂衍繝ｦ繝ｼ繧ｶ繝ｼ縺ｪ縺・, sent: 0 });
  }

  // auth.users縺九ｉ繝｡繝ｼ繝ｫ繧｢繝峨Ξ繧ｹ蜿門ｾ・
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const emailMap: Record<string, string> = {};
  users.forEach(u => { if (u.email) emailMap[u.id] = u.email; });

  const formatDate = (d: string) => {
    const dt = new Date(d);
    const dow = ["譌･","譛・,"轣ｫ","豌ｴ","譛ｨ","驥・,"蝨・][dt.getDay()];
    return `${dt.getMonth()+1}/${dt.getDate()}・・{dow}・荏;
  };

  let sent = 0;

  for (const setting of settings) {
    const email = emailMap[setting.user_id];
    if (!email) continue;

    const rows: string[] = [];

    if (setting.notify_bb && bbCompanies?.length) {
      bbCompanies.forEach(c => {
        rows.push(`<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0"><strong>${c.name}</strong>・・{c.ticker ?? ""}・・/td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#0369a1;font-weight:700">BB髢句ｧ・/td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${formatDate(c.bb_start_date)}</td></tr>`);
      });
    }
    if (setting.notify_apply && applyCompanies?.length) {
      applyCompanies.forEach(c => {
        rows.push(`<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0"><strong>${c.name}</strong>・・{c.ticker ?? ""}・・/td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#d97706;font-weight:700">逕ｳ霎ｼ髢句ｧ・/td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${formatDate(c.apply_start_date)}</td></tr>`);
      });
    }
    if (setting.notify_listing && listingCompanies?.length) {
      listingCompanies.forEach(c => {
        rows.push(`<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0"><strong>${c.name}</strong>・・{c.ticker ?? ""}・・/td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#15803d;font-weight:700">荳雁ｴ譌･</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${formatDate(c.listing_date)}</td></tr>`);
      });
    }

    if (rows.length === 0) continue;

    try {
      await resend.emails.send({
        from:    "IPO蛻・梵繝ｬ繝昴・繝・<noreply@ipo.finance-tower.com>",
        to:      email,
        subject: `縲蝕PO騾ｱ谺｡騾夂衍縲醍ｿ碁ｱ・・{fromDate}縲・{toDate}・峨・IPO繧､繝吶Φ繝・,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f4fbfc">
            <div style="background:#0d4f52;padding:16px 24px;border-radius:12px 12px 0 0">
              <h2 style="color:white;margin:0;font-size:16px">投 IPO莨∵･ｭ諠・ｱAI蛻・梵繝ｬ繝昴・繝・/h2>
              <p style="color:#a0d4d6;margin:4px 0 0;font-size:12px">諡・ｽ難ｼ壼､ｧ謇狗伴隱ｿ譟ｻ螳､荵晁ｪｲ</p>
            </div>
            <div style="background:white;padding:24px;border-radius:0 0 12px 12px;border:1px solid #b3e8ea">
              <p style="color:#082b2e;font-size:14px;margin-bottom:16px">
                鄙碁ｱ・・strong>${fromDate}縲・{toDate}</strong>・峨・IPO繧､繝吶Φ繝医ｒ縺顔衍繧峨○縺励∪縺吶・
              </p>
              <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
                <thead>
                  <tr style="background:#f4fbfc">
                    <th style="padding:8px 12px;text-align:left;color:#2a7a7e;font-size:11px">驫俶氛</th>
                    <th style="padding:8px 12px;text-align:left;color:#2a7a7e;font-size:11px">繧､繝吶Φ繝・/th>
                    <th style="padding:8px 12px;text-align:left;color:#2a7a7e;font-size:11px">譌･莉・/th>
                  </tr>
                </thead>
                <tbody>${rows.join("")}</tbody>
              </table>
              <a href="https://ipo.finance-tower.com"
                style="display:inline-block;padding:12px 24px;background:#66c3c6;color:white;text-decoration:none;border-radius:8px;font-weight:bold;margin-top:20px;font-size:14px">
                蛻・梵繝ｬ繝昴・繝医ｒ遒ｺ隱阪☆繧・竊・
              </a>
              <p style="margin-top:24px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px">
                縺薙・繝｡繝ｼ繝ｫ縺ｯ豈朱ｱ驥第屆譌･18譎ゅ↓騾夂衍險ｭ螳壹ｒ譛牙柑縺ｫ縺励※縺・ｋ繝ｦ繝ｼ繧ｶ繝ｼ縺ｸ騾∽ｿ｡縺輔ｌ縺ｾ縺吶・br/>
                ﾂｩ 螟ｧ謇狗伴隱ｿ譟ｻ螳､荵晁ｪｲ
              </p>
            </div>
          </div>
        `,
      });
      sent++;
    } catch (e) {
      console.error(`繝｡繝ｼ繝ｫ騾∽ｿ｡螟ｱ謨・ ${email}`, e);
    }
  }

  // 騾∽ｿ｡繝ｭ繧ｰ繧定ｨ倬鹸
  await supabase.from("notification_logs").insert({
    sent_at:    new Date().toISOString(),
    recipients: sent,
    companies:  [
      ...(bbCompanies ?? []),
      ...(applyCompanies ?? []),
      ...(listingCompanies ?? []),
    ].map(c => c.name).join(", "),
  });

  return NextResponse.json({ success: true, sent, nextWeek: `${fromDate}縲・{toDate}` });
}