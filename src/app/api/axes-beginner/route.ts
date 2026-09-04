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

// 元のレポートから「参考文献」セクションを除去したうえで、前半(なぜ重要か/データ分析/ポジティブ要因)と
// 後半(ネガティブ要因・リスク/投資する場合の留意点/まとめ)の2つに分割する。
// 1軸まるごと(6見出し分)を1回のAI呼び出しでリライトすると出力が長くなり、Vercel Hobbyプランの
// 関数タイムアウト(60秒)に達して失敗することがあったため、半分ずつ2回に分けて負荷を軽くする。
function splitReportForRewrite(originalReport: string): { part1: string; part2: string } {
  const withoutSources = originalReport.replace(/###\s*参考文献[\s\S]*$/, "").trim();
  const marker = "### ネガティブ要因・リスク";
  const idx = withoutSources.indexOf(marker);
  if (idx === -1) {
    // 想定外の見出し構成の場合は、無理に分割せず全体をpart1として扱う(part2は空)
    return { part1: withoutSources, part2: "" };
  }
  return {
    part1: withoutSources.slice(0, idx).trim(),
    part2: withoutSources.slice(idx).trim(),
  };
}

function buildRewritePrompt(periodLabel: string, axisId: string, reportChunk: string, includeSummaryLine: boolean): string {
  const axisName = AXIS_NAMES[axisId] ?? axisId;
  // 軸ごとに書き出しパターンを固定で変え、9軸まとめて読んだ時に単調にならないようにする
  const axisIndex = Object.keys(AXIS_NAMES).indexOf(axisId);
  const variationHint = OPENING_STYLES[(axisIndex >= 0 ? axisIndex : 0) % OPENING_STYLES.length];
  const summaryRule = includeSummaryLine
    ? "10. 最初の見出しの直後、本文に入る前に「結論：〇〇」という一言サマリー（30字以内、太字は使わず地の文でよい）を独立した1行として置くこと。読者がそれだけで要点をつかめる一文にすること"
    : "10. これは軸解説の後半部分です。冒頭に新しい結論サマリーや導入文を付け加えないこと。最初の見出し（###）からそのまま始めること";

  return `あなたは、投資初心者にもやさしく丁寧に説明するIPO解説者です。
以下は「${periodLabel}投資判断における『${axisName}』」について、専門的な視点でまとめられたレポートの一部です。
このレポートを、投資の勉強を始めたばかりの初心者にも理解できるように、やさしく書き直してください。

【元のレポート（一部）】
${reportChunk}

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
${summaryRule}
11. ${variationHint}

上に示した「元のレポート（一部）」の見出しだけを書き直してください。それ以外の見出しを新しく作ったり、続きを想像で書き足したりしないこと。書き直した部分のみを出力してください。`;
}

export async function POST(req: NextRequest) {
  try {
    const { company_id, period, single_axis, sub_part, save_results } = await req.json();

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

    // 1軸ぶんのレポートを前半・後半の2回に分けてリライトする(タイムアウト対策)。
    // sub_partが指定されない場合(旧クライアント互換)は前半のみを扱う。
    const subPart = sub_part === 2 ? 2 : 1;
    const { part1, part2 } = splitReportForRewrite(axisData.report);
    const reportChunk = subPart === 2 ? part2 : part1;

    if (!reportChunk) {
      // 後半が存在しない(想定外の見出し構成だった)場合は、書き直す内容が無いので空を返す
      return NextResponse.json({
        success: true,
        axis_id: axisId,
        label: AXIS_NAMES[axisId] ?? axisId,
        report_beginner: "",
      });
    }

    const prompt = buildRewritePrompt(config.label, axisId, reportChunk, subPart === 1);

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
        // Vercel Hobbyプランの関数タイムアウト上限は60秒。1回の生成に40〜50秒
        // かかることもあるため、同じ関数呼び出しの中で2回目を試すと合計で
        // 60秒を超えてしまう。そのため1回だけ、上限ギリギリまで待つ。
        signal: AbortSignal.timeout(50000),
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

    // 同じ関数呼び出し内での2回目のリトライは廃止(60秒の壁と相性が悪いため)。
    // 前半・後半に分割したことで1回あたりの出力量が半分程度になったため、上限も
    // 3500トークンに縮小した(以前は1軸まるごと6000トークンで、生成に時間がかかり
    // タイムアウトする原因になっていた)。それでも切れてしまった場合は、そのまま返す
    // (admin画面側の自動リトライが新しいリクエストとしてやり直すため、そちらで再挑戦できる)。
    const result = await callOnce(3500);
    if (result.truncated) {
      console.warn(`axes-beginner ${axisId} (part${subPart}): 3500トークンでもmax_tokensで打ち切り(そのまま返します)`);
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