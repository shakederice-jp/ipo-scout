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

const OPENING_STYLES = [
  "本文の書き出しは、具体的な数値や事実から入ること（例：「〇〇円という数字は〜」）",
  "本文の書き出しは、読者への問いかけから入ること（例：「もし〜だったらどうなるでしょうか」）",
  "本文の書き出しは、身近な例え話から入ること（例：「これは〜のようなものです」）",
  "本文の書き出しは、一般的な事実の説明から入ること（例：「〜という仕組みがあります」）",
];

function buildRewritePrompt(periodLabel: string, axisId: string, originalReport: string): string {
  const axisName = AXIS_NAMES[axisId] ?? axisId;
  // 元のレポートから「参考文献」セクションを除去してから渡す(初心者向けには含めない方針のため)
  const reportWithoutSources = originalReport.replace(/###\s*参考文献[\s\S]*$/, "").trim();
  // 軸ごとに書き出しパターンを固定で変え、9軸まとめて読んだ時に単調にならないようにする
  const axisIndex = Object.keys(AXIS_NAMES).indexOf(axisId);
  const variationHint = OPENING_STYLES[(axisIndex >= 0 ? axisIndex : 0) % OPENING_STYLES.length];

  return `あなたは、投資初心者にもやさしく丁寧に説明するIPO解説者です。
以下は「${periodLabel}投資判断における『${axisName}』」について、専門的な視点でまとめられたレポートです。
このレポートを、投資の勉強を始めたばかりの初心者にも理解できるように、やさしく書き直してください。

【元のレポート】
${reportWithoutSources}

【書き直しのルール】
1. 専門用語（例：ロックアップ、VC、バリュエーション、PER、時価総額など）が出てきたら、必ずその場で一言かんたんな説明を添えること（例：「ロックアップ（＝株主が一定期間、株を売れなくなるルールのことです）」）
2. 文章はすべて「ですます調」で、やさしい言葉づかいにすること
3. 1つの段落は60〜80字程度までにし、こまめに改行(\\n\\n)を入れて区切ること。長い文章を1段落に詰め込まないこと
4. 元のレポートにある具体的な数値・事実は、省略せずそのまま引用すること（数字を削って抽象的な説明だけにしない）
5. 元のレポートの見出し構成（### で始まる部分）は、同じ見出し名のまま・同じ数のまま維持すること。見出しを増やしたり、統合したり、言い換えたりしないこと
6. 【厳禁】会社名・銘柄名・「〜分析レポート」「初心者向けやさしい解説版」「総合評価」といった、元のレポートに存在しないタイトルや見出しを新しく作らないこと。区切り線（"---"や"==="など）も一切使わないこと。出力は元のレポートの最初の見出し（###）からそのまま始めること
7. 【重複厳禁】同じ見出しを2回出力しない、同じ内容・同じ数値を複数のセクションで繰り返さないこと
8. 「なぜそれが大事なのか」を、初心者が実感できるような身近な例えを1つ以上使うこと（無理のない範囲で）
9. マークダウン形式で出力し、前後に余計な説明文を付けないこと
10. 最初の見出しの直後、本文に入る前に「結論：〇〇」という一言サマリー（30字以内、太字は使わず地の文でよい）を独立した1行として置くこと。読者がそれだけで要点をつかめる一文にすること
11. ${variationHint}

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

    async function callOnce(maxTokens: number): Promise<{ text: string; truncated: boolean }> {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: maxTokens,
          messages: [{ role: "user", content: prompt }],
        }),
        // Vercel Hobbyプランの関数タイムアウト上限(60秒)以内に、
        // 途中切れ時の再試行(最大2回)を含めて収まるよう、1回あたりの待ち時間を短縮
        signal: AbortSignal.timeout(25000),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Claude API error: ${err.slice(0, 200)}`);
      }

      const data = await res.json();
      const text = (data?.content?.[0]?.text ?? "").trim();
      const truncated = data?.stop_reason === "max_tokens";
      return { text, truncated };
    }

    let result = await callOnce(3000);
    if (result.truncated) {
      console.warn(`axes-beginner ${axisId}: max_tokensで打ち切り検知、再試行します`);
      result = await callOnce(4500);
    }
    const reportBeginner = result.text;

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