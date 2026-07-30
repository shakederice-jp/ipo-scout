import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const AXIS_CONFIG = {
  ultra_short: {
    axes: ["float", "lockup", "timing"],
    label: "超短期（初値〜当日）",
    dbColumn: "analysis_axes_short",
  },
  short: {
    axes: ["valuation", "vc_sell", "growth"],
    label: "短期（1〜3ヶ月）",
    dbColumn: "analysis_axes_mid",
  },
  long: {
    axes: ["management", "unit_econ", "competitor"],
    label: "長期（数年〜）",
    dbColumn: "analysis_axes_long",
  },
};

const AXIS_NAMES: Record<string, string> = {
  float: "需給の軽さ（Float）",
  lockup: "ロックアップ",
  timing: "上場タイミング",
  valuation: "バリュエーション",
  vc_sell: "VC・大株主売り圧力",
  growth: "成長性",
  management: "経営陣",
  unit_econ: "ユニットエコノミクス",
  competitor: "競合環境",
};

function buildRewritePrompt(periodLabel: string, axisId: string, originalReport: string): string {
  const axisName = AXIS_NAMES[axisId] ?? axisId;
  return `あなたは、投資初心者にもやさしく丁寧に説明するIPO解説者です。
以下は「${periodLabel}投資判断における『${axisName}』」について、専門的な視点でまとめられたレポートです。
このレポートを、投資の勉強を始めたばかりの初心者にも理解できるように、やさしく書き直してください。

【元のレポート】
${originalReport}

【書き直しのルール】
1. 専門用語（例：ロックアップ、VC、バリュエーション、PER、時価総額など）が出てきたら、必ずその場で一言かんたんな説明を添えること（例：「ロックアップ（＝株主が一定期間、株を売れなくなるルールのことです）」）
2. 文章はすべて「ですます調」で、やさしい言葉づかいにすること
3. 1つの段落は60〜80字程度までにし、こまめに改行(\\n\\n)を入れて区切ること。長い文章を1段落に詰め込まないこと
4. 元のレポートにある具体的な数値・事実は、省略せずそのまま引用すること（数字を削って抽象的な説明だけにしない）
5. 元のレポートの見出し構成（### で始まる部分）は、同じ見出し名のまま維持すること
6. 「なぜそれが大事なのか」を、初心者が実感できるような身近な例えを1つ以上使うこと（無理のない範囲で）
7. マークダウン形式で出力し、前後に余計な説明文を付けないこと

書き直したレポートのみを出力してください。`;
}

export async function POST(req: NextRequest) {
  try {
    const { company_id, period, single_axis, save_results } = await req.json();

    if (!period || !AXIS_CONFIG[period as keyof typeof AXIS_CONFIG]) {
      return NextResponse.json(
        { error: "periodは ultra_short / short / long のいずれかを指定してください" },
        { status: 400 }
      );
    }

    const config = AXIS_CONFIG[period as keyof typeof AXIS_CONFIG];
    const supabase = getSupabase();

    // 保存モード：フロントから3軸分（初心者向けreport付き）まとめて受け取って保存
    if (save_results) {
      const { data: co } = await supabase.from("ipo_companies").select(config.dbColumn).eq("id", company_id).single();
      if (!co) return NextResponse.json({ error: "銘柄が見つかりません" }, { status: 404 });

      const existing = (co as any)[config.dbColumn] ?? {};
      const updated: Record<string, any> = { ...existing };

      save_results.forEach((item: any) => {
        if (updated[item.id]) {
          updated[item.id] = { ...updated[item.id], report_beginner: item.report_beginner };
        }
      });

      await supabase.from("ipo_companies")
        .update({ [config.dbColumn]: updated })
        .eq("id", company_id);

      return NextResponse.json({ success: true, message: `✅ ${config.label}の初心者向けリライト保存完了！` });
    }

    // 生成モード：1軸分、既存reportを初心者向けにリライトして返すのみ（保存しない）
    const { data: co, error } = await supabase
      .from("ipo_companies")
      .select(`id, ${config.dbColumn}`)
      .eq("id", company_id)
      .single();

    if (error || !co) {
      return NextResponse.json({ error: "銘柄が見つかりません" }, { status: 404 });
    }

    const axisId = single_axis ?? config.axes[0];
    const axesData = (co as any)[config.dbColumn] ?? {};
    const axisData = axesData[axisId];

    if (!axisData || !axisData.report) {
      return NextResponse.json(
        { error: `${AXIS_NAMES[axisId] ?? axisId}の元となる分析（report）が未生成です。先に④⑤⑥の9軸分析を実行してください。` },
        { status: 400 }
      );
    }

    const prompt = buildRewritePrompt(config.label, axisId, axisData.report);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 3000,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(55000),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Claude API error: ${err.slice(0, 200)}`);
    }

    const data = await res.json();
    const reportBeginner = (data?.content?.[0]?.text ?? "").trim();

    return NextResponse.json({
      success: true,
      axis_id: axisId,
      label: AXIS_NAMES[axisId] ?? axisId,
      report_beginner: reportBeginner,
    });

  } catch (e: any) {
    console.error("axes-beginner error:", e?.message);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}