import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { notifyAdmin } from "@/lib/notify-admin";

// 2026/9/1新設。「その時期その時期に大化けするIPOテーマ」と「新興・グロース市場、
// 日経平均、世界的な株式市場の地合い」をAI Web検索で毎週月曜に調査し、
// market_snapshotsテーブルに保存する。保存した内容は、超短期軸のスコア・コメント
// (src/app/api/analyze/route.ts, src/app/api/axes/route.ts)と、マーケットトレンド
// ページの「新規IPO紹介」記事に、あくまで補助的な参考情報として反映される
// (src/lib/market-snapshot.ts 参照)。
//
// vercel.jsonのcronから毎週月曜朝に自動実行されるほか、admin画面の
// 「🛠 手動実行ツール」からいつでも手動実行できる(x-admin-passwordヘッダ)。

export const maxDuration = 90;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const getSupabase = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// JST基準で「今週の月曜日」の日付(YYYY-MM-DD)を求める。
// 日曜や火曜以降に手動実行した場合でも、同じ週なら同じ月曜日付になり、
// market_snapshots側のweek_startユニーク制約でその週の最新調査に上書きされる。
function getJstMonday(): string {
  const jstNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const day = jstNow.getDay(); // 0=日,1=月,...6=土
  const diffToMonday = day === 0 ? -6 : 1 - day;
  jstNow.setDate(jstNow.getDate() + diffToMonday);
  return jstNow.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const adminPw = req.headers.get("x-admin-password");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && adminPw !== "otemachi9") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getSupabase();
    const weekStart = getJstMonday();

    // Step1: Web検索で情報収集
    const searchResponse = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 3000,
      tools: [{ type: "web_search_20250305", name: "web_search" } as any],
      messages: [
        {
          role: "user",
          content: `あなたは日本の株式市場・IPO市場を専門とするアナリストです。直近1〜2週間の情報を検索して、以下を調べてください。

1. 個人投資家の資金が集まりやすい「大化けテーマ」（業種・キーワード単位で2〜5個）。赤字幅が大きくても財務面を度外視して思惑・期待感で買われやすい分野を、具体的な理由・関連銘柄例とともに教えてください。
2. 新興市場・グロース市場全体の地合い（資金流入状況、投資家心理、直近IPOの初値動向の傾向）
3. 日経平均株価の直近の状況・トレンド
4. 世界的な株式市場の地合い（米国株(NYダウ・S&P500・ナスダック)の動向、金利・為替など投資家心理に影響する要因）

複数の情報源を検索し、できるだけ具体的な数値・事実を集めてください。`,
        },
      ],
    });

    const searchText = searchResponse.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");

    // Step2: 収集した情報をJSONに整形
    const formatResponse = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `以下の調査結果を元に、JSONのみで出力してください。マークダウン不要。

調査結果：
${searchText}

出力形式（JSONのみ、説明文不要）：
{
  "hot_themes": [
    {"theme": "テーマ名（例：AIエージェント関連）", "reason": "なぜ資金が集まりやすいか、40〜80字程度", "examples": "関連する銘柄名・キーワードの例（分かる範囲で、無ければ空文字）"}
  ],
  "sentiment": {
    "growth_market": "新興市場・グロース市場全体の地合いの説明。80〜150字程度",
    "nikkei": "日経平均の直近の状況・トレンド。60〜100字程度",
    "global": "世界的な株式市場の地合い（米国株・金利・為替など）。60〜100字程度",
    "overall_label": "強気 / 中立 / 弱気 のいずれか（新興・グロース市場のIPO需給という観点での総合判断）",
    "overall_comment": "上記を踏まえた総合コメント。100〜150字程度"
  }
}
hot_themesは2〜5個含めてください。情報が見つからない場合は空配列にしてください。`,
        },
      ],
    });

    const formatText = formatResponse.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");

    let snapshotData: any = { hot_themes: [], sentiment: {} };
    try {
      const clean = formatText.replace(/```json|```/g, "").trim();
      const jsonMatch = clean.match(/\{[\s\S]*\}/);
      if (jsonMatch) snapshotData = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("market-snapshot: JSON解析失敗", e, formatText.slice(0, 300));
    }

    const { error } = await supabase.from("market_snapshots").upsert(
      {
        week_start: weekStart,
        hot_themes: snapshotData.hot_themes ?? [],
        sentiment: snapshotData.sentiment ?? {},
      },
      { onConflict: "week_start" }
    );

    if (error) {
      throw new Error(`market_snapshots保存失敗: ${error.message}`);
    }

    const themesText =
      (snapshotData.hot_themes ?? []).map((t: any) => `・${t.theme}：${t.reason}`).join("\n") || "（該当なし）";

    await notifyAdmin(
      `📈 週次マーケット地合い・大化けテーマ更新（${weekStart}週）`,
      `▼ 大化けテーマ\n${themesText}\n\n` +
        `▼ 地合い\n・グロース市場: ${snapshotData.sentiment?.growth_market ?? ""}\n` +
        `・日経平均: ${snapshotData.sentiment?.nikkei ?? ""}\n` +
        `・世界市場: ${snapshotData.sentiment?.global ?? ""}\n` +
        `・総合判断: ${snapshotData.sentiment?.overall_label ?? ""}\n\n` +
        `この内容は超短期軸のスコア・コメントと、マーケットトレンドページの「新規IPO紹介」記事に、次回以降の分析から自動的に反映されます。`,
      "info"
    );

    return NextResponse.json({ success: true, week_start: weekStart, data: snapshotData });
  } catch (err: any) {
    console.error("market-snapshot cron error:", err);
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
