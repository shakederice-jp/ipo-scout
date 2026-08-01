import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { notifyAdmin } from "@/lib/notify-admin";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "IPO蛻・梵繝ｬ繝昴・繝・<onboarding@resend.dev>";
const ADMIN_EMAIL = "otemachi.sec9@gmail.com";

export async function POST(req: NextRequest) {
  try {
    const { name, email, category, message } = await req.json();

    if (!message || message.trim().length < 10) {
      return NextResponse.json({ error: "縺雁撫縺・粋繧上○蜀・ｮｹ繧・0譁・ｭ嶺ｻ･荳雁・蜉帙＠縺ｦ縺上□縺輔＞" }, { status: 400 });
    }

    const categoryLabel: Record<string, string> = {
      bug: "菅 繝舌げ繝ｻ荳榊・蜷亥ｱ蜻・,
      analysis: "投 蛻・梵蜀・ｮｹ縺ｸ縺ｮ雉ｪ蝠上・謖・遭",
      feature: "庁 讖溯・謾ｹ蝟・・縺疲署譯・,
      other: "町 縺昴・莉・,
    };
    const catLabel = categoryLabel[category] ?? "縺昴・莉・;
    const displayName = name?.trim() || "蛹ｿ蜷・;
    const hasEmail = email && email.trim().length > 0;

    // 竭 邂｡逅・・∈縺ｮ騾夂衍繝｡繝ｼ繝ｫ
    await notifyAdmin(
      `縺雁撫縺・粋繧上○・・{catLabel}`,
      `遞ｮ蛻･: ${catLabel}\n蜷榊燕: ${displayName}\n繝｡繝ｼ繝ｫ: ${hasEmail ? email : "譛ｪ險伜・"}\n\n蜀・ｮｹ:\n${message}`,
      "info"
    );

    // 竭｡ 繝ｦ繝ｼ繧ｶ繝ｼ縺ｸ縺ｮ閾ｪ蜍戊ｿ比ｿ｡繝｡繝ｼ繝ｫ・医Γ繝ｼ繝ｫ繧｢繝峨Ξ繧ｹ縺後≠繧句ｴ蜷医・縺ｿ・・
    if (hasEmail) {
      await resend.emails.send({
        from: FROM,
        to: email.trim(),
        subject: "縲仙､ｧ謇狗伴隱ｿ譟ｻ螳､荵晁ｪｲ縲代♀蝠上＞蜷医ｏ縺帙ｒ蜿励￠莉倥￠縺ｾ縺励◆",
        html: `
          <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f4fbfc">
            <div style="background:#0d4f52;padding:20px 28px;border-radius:12px 12px 0 0">
              <h2 style="color:white;margin:0;font-size:17px;font-weight:900">投 IPO莨∵･ｭ諠・ｱAI蛻・梵繝ｬ繝昴・繝・/h2>
              <p style="color:#a0d4d6;margin:4px 0 0;font-size:12px">螟ｧ謇狗伴隱ｿ譟ｻ螳､荵晁ｪｲ</p>
            </div>
            <div style="background:white;padding:28px;border-radius:0 0 12px 12px;border:1px solid #b3e8ea">

              <p style="color:#082b2e;font-size:15px;font-weight:700;margin:0 0 16px">
                ${displayName} 讒・
              </p>

              <p style="color:#374151;font-size:14px;line-height:1.9;margin:0 0 16px">
                縺薙・縺溘・縺ｯ縺雁撫縺・粋繧上○縺・◆縺縺阪∬ｪ縺ｫ縺ゅｊ縺後→縺・＃縺悶＞縺ｾ縺吶・br/>
                螟ｧ謇狗伴隱ｿ譟ｻ螳､荵晁ｪｲ縺ｮIPO蛻・梵繝ｬ繝昴・繝医ｒ縺泌茜逕ｨ縺・◆縺縺・※縺・ｋ縺薙→縲√せ繧ｿ繝・ヵ荳蜷悟､ｧ螟牙ｬ峨＠縺乗昴▲縺ｦ縺翫ｊ縺ｾ縺吶・
              </p>

              <p style="color:#374151;font-size:14px;line-height:1.9;margin:0 0 16px">
                縺・◆縺縺・◆<strong style="color:#0d4f52">縲・{catLabel}縲・/strong>縺ｮ縺秘｣邨｡縺ｯ縲∫｢ｺ縺九↓蜿励￠莉倥￠縺ｾ縺励◆縲・br/>
                蜀・ｮｹ繧剃ｸ∝ｯｧ縺ｫ遒ｺ隱阪・縺・∴縲√し繝ｼ繝薙せ縺ｮ謾ｹ蝟・・蜩∬ｳｪ蜷台ｸ翫↓蜷代￠縺ｦ逵滓賊縺ｫ讀懆ｨ弱＠縺ｦ縺ｾ縺・ｊ縺ｾ縺吶・
              </p>

              <div style="background:#f0fafa;border-left:4px solid #66c3c6;padding:14px 18px;border-radius:0 8px 8px 0;margin:20px 0">
                <p style="color:#0d4f52;font-size:13px;line-height:1.8;margin:0">
                  縺ｪ縺翫√＞縺溘□縺・◆縺疲э隕九・縺疲署譯医・繧ｵ繝ｼ繝薙せ謾ｹ蝟・・驥崎ｦ√↑蜿り・→縺輔○縺ｦ縺・◆縺縺阪∪縺吶′縲・
                  縺吶∋縺ｦ縺ｮ縺碑ｦ∵悍縺ｫ縺雁ｿ懊∴縺吶ｋ縺薙→繧・√＃諢剰ｦ九・蜀・ｮｹ縺後◎縺ｮ縺ｾ縺ｾ蜿肴丐縺輔ｌ繧九％縺ｨ繧偵♀邏・據縺吶ｋ繧ゅ・縺ｧ縺ｯ縺斐＊縺・∪縺帙ｓ縲・
                  菴募穀縺皮炊隗｣縺・◆縺縺代∪縺吶→蟷ｸ縺・〒縺吶・
                </p>
              </div>

              <p style="color:#374151;font-size:14px;line-height:1.9;margin:16px 0">
                蠑輔″邯壹″縲！PO謚戊ｳ・・蛻､譁ｭ縺ｫ縺雁ｽｹ遶九※縺・◆縺縺代ｋ繧医≧縲・
                繧ｳ繝ｳ繝・Φ繝・・蜈・ｮ溘→繧ｵ繝ｼ繝薙せ蜩∬ｳｪ縺ｮ蜷台ｸ翫↓蜉ｪ繧√※縺ｾ縺・ｊ縺ｾ縺吶・br/>
                莉雁ｾ後→繧ゅ←縺・◇繧医ｍ縺励￥縺企｡倥＞縺・◆縺励∪縺吶・
              </p>

              <div style="border-top:1px solid #e2e8f0;margin-top:24px;padding-top:16px">
                <p style="color:#082b2e;font-size:13px;font-weight:700;margin:0 0 4px">螟ｧ謇狗伴隱ｿ譟ｻ螳､荵晁ｪｲ</p>
                <p style="color:#64748b;font-size:12px;margin:0">IPO莨∵･ｭ諠・ｱAI蛻・梵繝ｬ繝昴・繝・/p>
                <a href="https://ipo.finance-tower.com" style="color:#66c3c6;font-size:12px;text-decoration:none">ipo.finance-tower.com</a>
              </div>

              <p style="margin-top:20px;font-size:11px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:12px;line-height:1.7">
                窶ｻ 縺薙・繝｡繝ｼ繝ｫ縺ｯ縺雁撫縺・粋繧上○繝輔か繝ｼ繝縺九ｉ縺ｮ閾ｪ蜍戊ｿ比ｿ｡縺ｧ縺吶ゅ％縺ｮ繝｡繝ｼ繝ｫ縺ｸ縺ｮ霑比ｿ｡縺ｯ蜿励￠莉倥￠縺ｦ縺翫ｊ縺ｾ縺帙ｓ縲・br/>
                ﾂｩ 螟ｧ謇狗伴隱ｿ譟ｻ螳､荵晁ｪｲ
              </p>
            </div>
          </div>
        `,
      });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("contact error:", e);
    return NextResponse.json({ error: "騾∽ｿ｡縺ｫ螟ｱ謨励＠縺ｾ縺励◆" }, { status: 500 });
  }
}