import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

// このインフォグラフィックの役割: 見た人が一瞬でこの銘柄の魅力に気づき、
// 「続きが気になる→サイトで詳しく読みたい」と思ってクリックしてもらうための
// X投稿用の"フック"画像。
//
// 2026/8/29、ユーザーから「余白が多く目を引かない。売上推移などを実際にグラフ化してほしい。
// インフォグラフィックの役割は本来こういう視覚化にある」との指摘を受け、
// スコアバッジ+ひとことインサイトの引用文デザインから、
// STEP3で抽出済みの財務データ(key_metrics)を使った「売上高の推移」棒グラフを
// メインに据えたデザインへ変更した。
//
// 同日、さらに「グラフだけでは見劣りする」とのフィードバックを受け、以下を追加した:
// ①ひとことインサイト(hook。ai_summary等の魅力訴求文)をグラフの上に短い引用カードで表示
// ②グラフの初期値→最新値から自動計算した「◯期で◯倍成長」の成長ヘッドラインバッジを
//   グラフタイトル行に表示(データそのものを一番の見せ場にする)
// ③直近期の棒だけ色を変えて(ゴールド)目を引かせる
//
// 2026/8/29 さらに追加: 「売上は伸びているが利益は赤字」のような構造を同時に見せたい
// との要望を受け、各期の棒グラフの下に「経常利益」のミニチャート(ゼロラインを挟んで
// 黒字なら水色バーが上に、赤字なら赤バーが下に伸びる)を追加した。あわせて、AIスコア
// (グレード+点数)はこのアプリの一番の売りであるため、以前好評だった大きな円バッジの
// デザインに戻し、より目立つようにした。
//
// 2026/8/29 さらに追加: 分析ページの9軸詳細分析(超短期・短期・長期)のスコアも
// 見せたいとの要望を受け、超短期/短期/長期の3枚の小さなスコアカードと、
// 「公式サイトでは超短期・短期・長期それぞれの投資家向けにIPO分析を行っています」
// という固定の案内文を追加した。このスコアはSTEP5(9軸詳細分析)を実行して初めて
// 算出できるため、STEP4完了直後の自動生成時点ではまだ存在しないことが多い
// (その場合はこのセクション自体を表示しない。既存銘柄でSTEP5実行済みなら、
// 「インフォグラフィックの作り直し」で反映できる)。
//
// 背景は外部の画像生成(fal.ai)に依存すると、取得失敗時にレイアウトが崩れたり
// 生成のたびに絵柄が変わって見づらくなるため、CSSのグラデーションのみで組む
// (サイト本体のブランドカラーと統一・失敗しない・軽い)。

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

interface ChartPoint {
  label: string;
  value: number; // 売上高(億円)
  profit: number | null; // 経常利益(億円)。赤字はマイナス値。データが無い場合はnull
}

// chartDataはJSON文字列(RevenueChartPoint[])としてクエリに渡される想定。
// 壊れている・空の場合は空配列を返し、グラフ無しのフォールバック表示にする。
function parseChartData(raw: string | null): ChartPoint[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p && typeof p.value === "number" && Number.isFinite(p.value) && p.value > 0)
      .slice(0, 5)
      .map((p) => ({
        label: String(p.label ?? "").slice(0, 8),
        value: p.value,
        profit: typeof p.profit === "number" && Number.isFinite(p.profit) ? p.profit : null,
      }));
  } catch {
    return [];
  }
}

// axisUltraShort/axisShort/axisLong(0〜100の整数)をパースする。無い・不正な値はnullを返す。
function parseAxisScore(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
}

// 初期値→最新値の伸び率から、グラフの見出しになる「成長ヘッドライン」を作る。
// 例: "📈 4期で9.6倍成長"。ほぼ横ばい(±5%以内)の場合は表示しない(誇張を避けるため)。
function buildGrowthLabel(chartData: ChartPoint[]): string | null {
  if (chartData.length < 2) return null;
  const first = chartData[0].value;
  const last = chartData[chartData.length - 1].value;
  if (!(first > 0) || !(last > 0)) return null;
  const multiple = last / first;
  if (multiple >= 1.05) {
    return `📈 ${chartData.length}期で${multiple.toFixed(1)}倍成長`;
  }
  if (multiple <= 0.95) {
    const pct = Math.round((1 - multiple) * 100);
    return `📉 ${chartData.length}期で${pct}%減`;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  // 注意: URLSearchParams.get()は値が空文字列("")で渡された場合もそのまま""を返す
  // (nullになるのはキー自体が無い場合のみ)。"??"はnull/undefinedにしか反応しないため、
  // 空文字列に対してフォールバックが効かない不具合が過去にあった。ここでは"||"を使う。
  const companyName = truncate(searchParams.get("companyName") || "IPO銘柄", 13);
  const sector = truncate(searchParams.get("sector") || "", 12);
  const grade = (searchParams.get("grade") || "C").slice(0, 1);
  const scoreRaw = Number(searchParams.get("score"));
  const score = Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : 0;
  const chartData = parseChartData(searchParams.get("chartData"));
  const hook = truncate(searchParams.get("hook") || "", 42);
  const axisUltraShort = parseAxisScore(searchParams.get("axisUltraShort"));
  const axisShort = parseAxisScore(searchParams.get("axisShort"));
  const axisLong = parseAxisScore(searchParams.get("axisLong"));
  const hasAxisScores = axisUltraShort != null || axisShort != null || axisLong != null;

  // 会社名の長さに応じてフォントサイズを落とし、幅からはみ出さないようにする
  const nameFontSize = companyName.length > 9 ? 44 : companyName.length > 6 ? 52 : 62;

  // 売上高の棒グラフの寸法(px)。value(億円)をこの最大高さに正規化する。
  const MAX_BAR_HEIGHT = 190;
  const maxValue = chartData.length > 0 ? Math.max(...chartData.map((p) => p.value)) : 0;
  const growthLabel = buildGrowthLabel(chartData);

  // 経常利益ミニチャートの寸法。ゼロラインを挟んで上(黒字)・下(赤字)それぞれこの高さまで伸びる。
  const PROFIT_HALF = 50;
  const profitValues = chartData.map((p) => p.profit).filter((v): v is number => v != null);
  const maxAbsProfit = profitValues.length > 0 ? Math.max(...profitValues.map((v) => Math.abs(v))) || 1 : 1;

  // AIスコアの円バッジのサイズ。このアプリの一番の売りのため、大きく目立たせる。
  const CIRCLE_SIZE = 176;

  const fontUrl = new URL("/fonts/NotoSansJP-Bold.ttf", req.url).toString();
  const fontData = await fetch(fontUrl).then((res) => res.arrayBuffer());

  // ひとことインサイト(hook)の引用カード。ai_summary等の「この銘柄の魅力」を短く見せる。
  const hookSection = hook
    ? {
        type: "div",
        props: {
          style: {
            display: "flex",
            margin: "16px 64px 0",
            padding: "14px 26px",
            backgroundColor: "rgba(255,255,255,0.09)",
            borderRadius: 16,
            borderLeft: "6px solid #f5a623",
          },
          children: [
            { type: "div", props: { style: { display: "flex", fontSize: 24, fontWeight: 700, color: "#ffffff", lineHeight: 1.4 }, children: `💡 ${hook}` } },
          ],
        },
      }
    : null;

  // 超短期・短期・長期の投資家向けスコア(9軸詳細分析の各グループ平均点)。
  // データが無いグループは「―」を表示する(未実行の可能性があり、確定的に「無い」と
  // 断定できないため、他の箇所と同様に「未定」等の文言は使わない)。
  const AXIS_GROUPS: { key: string; label: string; icon: string; color: string; bg: string; value: number | null }[] = [
    { key: "ultraShort", label: "超短期", icon: "⚡", color: "#ff8577", bg: "rgba(239,68,68,0.16)", value: axisUltraShort },
    { key: "short", label: "短期", icon: "📈", color: "#f5c451", bg: "rgba(245,166,35,0.16)", value: axisShort },
    { key: "long", label: "長期", icon: "🏛", color: "#c4b5fd", bg: "rgba(167,139,250,0.16)", value: axisLong },
  ];
  const axisScoreSection = hasAxisScores
    ? {
        type: "div",
        props: {
          style: { display: "flex", flexDirection: "column", margin: "16px 64px 0" },
          children: [
            {
              type: "div",
              props: {
                style: { display: "flex", flexDirection: "row", gap: 14 },
                children: AXIS_GROUPS.map((g) => ({
                  type: "div",
                  props: {
                    style: { display: "flex", flexDirection: "column", alignItems: "center", flex: 1, backgroundColor: g.bg, borderRadius: 14, padding: "10px 8px", border: `1.5px solid ${g.color}` },
                    children: [
                      { type: "div", props: { style: { display: "flex", fontSize: 18, marginBottom: 2 }, children: g.icon } },
                      { type: "div", props: { style: { display: "flex", fontSize: 13, fontWeight: 700, color: "#ffffff", marginBottom: 2 }, children: g.label } },
                      {
                        type: "div",
                        props: {
                          style: { display: "flex", alignItems: "baseline", gap: 2 },
                          children:
                            g.value != null
                              ? [
                                  { type: "div", props: { style: { display: "flex", fontSize: 24, fontWeight: 700, color: g.color }, children: `${g.value}` } },
                                  { type: "div", props: { style: { display: "flex", fontSize: 12, color: "rgba(255,255,255,0.6)" }, children: "/100" } },
                                ]
                              : [{ type: "div", props: { style: { display: "flex", fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.4)" }, children: "―" } }],
                        },
                      },
                    ],
                  },
                })),
              },
            },
            {
              type: "div",
              props: {
                style: { display: "flex", fontSize: 14, color: "rgba(255,255,255,0.6)", marginTop: 8, textAlign: "center" as const, justifyContent: "center" },
                children: "🔍 公式サイトでは超短期・短期・長期、それぞれの投資家向けにIPO分析を行っています",
              },
            },
          ],
        },
      }
    : null;

  // AIスコアの大きな円バッジ。以前のデザインで好評だった「赤い円の中に数字」の見せ方に戻し、
  // このアプリの一番の売りであるスコア・グレードを一目で目立たせる。
  const scoreCircle = {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: CIRCLE_SIZE,
        height: CIRCLE_SIZE,
        borderRadius: "999px",
        backgroundImage: "linear-gradient(145deg, #d1315b 0%, #8f0f34 100%)",
        border: "5px solid #f5c451",
        flexShrink: 0,
      },
      children: [
        { type: "div", props: { style: { display: "flex", fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.85)" }, children: "AIスコア" } },
        { type: "div", props: { style: { display: "flex", fontSize: 70, fontWeight: 700, color: "#ffffff", lineHeight: 1, marginTop: 2 }, children: grade } },
        { type: "div", props: { style: { display: "flex", fontSize: 24, fontWeight: 700, color: "#ffd166", marginTop: 4 }, children: `${score}点` } },
      ],
    },
  };

  const chartSection =
    chartData.length > 0
      ? {
          // 売上高推移の棒グラフ + 経常利益ミニチャート + 成長ヘッドライン
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", flex: 1, padding: "0 64px", justifyContent: "center" },
            children: [
              {
                type: "div",
                props: {
                  style: { display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
                  children: [
                    { type: "div", props: { style: { display: "flex", fontSize: 24, fontWeight: 700, color: "#a0d4d6" }, children: "📈 売上高と経常利益の推移" } },
                    ...(growthLabel
                      ? [{ type: "div", props: { style: { display: "flex", fontSize: 22, fontWeight: 700, color: "#082b2e", backgroundColor: "#f5c451", padding: "8px 20px", borderRadius: "999px" }, children: growthLabel } }]
                      : []),
                  ],
                },
              },
              {
                type: "div",
                props: {
                  style: { display: "flex", fontSize: 16, color: "rgba(255,255,255,0.55)", marginBottom: 16 },
                  children: "上段のバー：売上高（億円）　下段のバー：経常利益（水色=黒字／赤=赤字、億円）",
                },
              },
              {
                type: "div",
                props: {
                  style: { display: "flex", flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 28 },
                  children: chartData.map((p, idx) => {
                    const isLast = idx === chartData.length - 1;
                    const barHeight = Math.max(14, Math.round((p.value / maxValue) * MAX_BAR_HEIGHT));
                    const hasProfit = p.profit != null;
                    const profitPositive = hasProfit && (p.profit as number) >= 0;
                    const profitBarHeight = hasProfit ? Math.max(6, Math.round((Math.abs(p.profit as number) / maxAbsProfit) * PROFIT_HALF)) : 0;
                    const profitColor = profitPositive ? "#4fd1c5" : "#ef6461";
                    return {
                      type: "div",
                      props: {
                        style: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", width: 112, height: MAX_BAR_HEIGHT + 200 },
                        children: [
                          // 売上高の数値ラベル
                          { type: "div", props: { style: { display: "flex", fontSize: isLast ? 27 : 24, fontWeight: 700, color: isLast ? "#ffd166" : "#ffffff", marginBottom: 8 }, children: `${p.value}` } },
                          // 売上高の棒
                          {
                            type: "div",
                            props: {
                              style: {
                                display: "flex",
                                width: 80,
                                height: barHeight,
                                borderRadius: "10px 10px 0 0",
                                backgroundImage: isLast
                                  ? "linear-gradient(180deg, #ffd166 0%, #d98324 100%)"
                                  : "linear-gradient(180deg, #66c3c6 0%, #2a7a7e 100%)",
                              },
                            },
                          },
                          // 経常利益のミニチャート(ゼロラインを挟んで黒字は上、赤字は下に伸びる)
                          {
                            type: "div",
                            props: {
                              style: { display: "flex", flexDirection: "column", width: 80, marginTop: 8 },
                              children: [
                                {
                                  type: "div",
                                  props: {
                                    style: { display: "flex", height: PROFIT_HALF, width: 80, alignItems: "flex-end", justifyContent: "center" },
                                    children:
                                      hasProfit && profitPositive
                                        ? [{ type: "div", props: { style: { display: "flex", width: 36, height: profitBarHeight, backgroundColor: "#4fd1c5", borderRadius: "4px 4px 0 0" } } }]
                                        : [],
                                  },
                                },
                                { type: "div", props: { style: { display: "flex", width: 80, height: 2, backgroundColor: "rgba(255,255,255,0.35)" } } },
                                {
                                  type: "div",
                                  props: {
                                    style: { display: "flex", height: PROFIT_HALF, width: 80, alignItems: "flex-start", justifyContent: "center" },
                                    children:
                                      hasProfit && !profitPositive
                                        ? [{ type: "div", props: { style: { display: "flex", width: 36, height: profitBarHeight, backgroundColor: "#ef6461", borderRadius: "0 0 4px 4px" } } }]
                                        : [],
                                  },
                                },
                              ],
                            },
                          },
                          // 経常利益の数値ラベル
                          { type: "div", props: { style: { display: "flex", fontSize: 17, fontWeight: 700, color: hasProfit ? profitColor : "rgba(255,255,255,0.4)", marginTop: 6 }, children: hasProfit ? `${(p.profit as number) > 0 ? "+" : ""}${p.profit}` : "―" } },
                          // 決算期ラベル
                          { type: "div", props: { style: { display: "flex", fontSize: 18, fontWeight: isLast ? 700 : 400, color: isLast ? "#ffd166" : "#a0d4d6", marginTop: 8 }, children: p.label } },
                        ],
                      },
                    };
                  }),
                },
              },
            ],
          },
        }
      : {
          // 財務データが無い場合のフォールバック(棒グラフを描けないケース向けの最低限の表示)
          type: "div",
          props: {
            style: { display: "flex", flex: 1, alignItems: "center", justifyContent: "center", padding: "0 64px" },
            children: [
              { type: "div", props: { style: { display: "flex", fontSize: 26, color: "#a0d4d6", textAlign: "center" as const }, children: "詳しい財務データはサイトで公開中です" } },
            ],
          },
        };

  return new ImageResponse(
    (
      {
        type: "div",
        props: {
          style: {
            width: "1200px", height: "1200px", display: "flex", flexDirection: "column",
            backgroundColor: "#082b2e",
            backgroundImage: "linear-gradient(160deg, #082b2e 0%, #0d4f52 55%, #146669 100%)",
            fontFamily: "NotoSansJP", position: "relative",
          },
          children: [
            // 右上の大きな装飾円(奥行きを出すだけの飾り。テキストは含まない)
            { type: "div", props: { style: { position: "absolute", top: "-140px", right: "-140px", width: "420px", height: "420px", borderRadius: "999px", backgroundColor: "rgba(255,255,255,0.06)", display: "flex" } } },
            // ヘッダー行: ブランド名 + 新規IPO承認バッジ
            { type: "div", props: { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "44px 64px 0" },
              children: [
                { type: "div", props: { style: { display: "flex", fontSize: 24, fontWeight: 700, color: "#66c3c6" }, children: "📊 IPO Scout" } },
                { type: "div", props: { style: { display: "flex", fontSize: 20, color: "#ffffff", backgroundColor: "#b31942", padding: "7px 18px", borderRadius: "999px", fontWeight: 700 }, children: "新規IPO承認" } },
              ] } },
            // 会社名・セクター + AIスコアの大きな円バッジ
            { type: "div", props: { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 64px 0" },
              children: [
                { type: "div", props: { style: { display: "flex", flexDirection: "column" },
                  children: [
                    { type: "div", props: { style: { display: "flex", fontSize: nameFontSize, fontWeight: 700, color: "#ffffff", lineHeight: 1.15 }, children: companyName } },
                    ...(sector ? [{ type: "div", props: { style: { display: "flex", fontSize: 22, color: "#a0d4d6", marginTop: 10 }, children: sector } }] : []),
                  ] } },
                scoreCircle,
              ] } },
            // 超短期・短期・長期の投資家向けスコア(axisScoresが渡された場合のみ)
            ...(axisScoreSection ? [axisScoreSection] : []),
            // ひとことインサイト(hookが渡された場合のみ)
            ...(hookSection ? [hookSection] : []),
            // メイン: 売上高・経常利益推移グラフ(またはフォールバック)
            chartSection,
            // フッター: CTA
            { type: "div", props: { style: { display: "flex", alignItems: "center", justifyContent: "center", gap: "14px", backgroundColor: "rgba(0,0,0,0.22)", padding: "30px 64px" },
              children: [
                { type: "div", props: { style: { display: "flex", fontSize: 24, color: "#ffffff", fontWeight: 700 }, children: "続きは大手町調査室９課公式HPで読む" } },
                { type: "div", props: { style: { display: "flex", fontSize: 28, color: "#66c3c6", fontWeight: 700 }, children: "→" } },
              ] } },
          ],
        },
      }
    ) as any,
    { width: 1200, height: 1200, fonts: [{ name: "NotoSansJP", data: fontData, style: "normal", weight: 700 }] }
  );
}
