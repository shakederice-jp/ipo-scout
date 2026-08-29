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
// メインに据えたデザインへ変更した(文章による魅力訴求はトレンドページの本文側に役割を移した)。
//
// 背景は外部の画像生成(fal.ai)に依存すると、取得失敗時にレイアウトが崩れたり
// 生成のたびに絵柄が変わって見づらくなるため、CSSのグラデーションのみで組む
// (サイト本体のブランドカラーと統一・失敗しない・軽い)。

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

interface ChartPoint {
  label: string;
  value: number;
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
      .map((p) => ({ label: String(p.label ?? "").slice(0, 8), value: p.value }));
  } catch {
    return [];
  }
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

  const gradeColor = score >= 80 ? "#4fd1c5" : score >= 60 ? "#f5a623" : "#ef6461";
  // 会社名の長さに応じてフォントサイズを落とし、幅1072px(1200-左右余白)からはみ出さないようにする
  const nameFontSize = companyName.length > 9 ? 46 : companyName.length > 6 ? 56 : 66;

  // 棒グラフの寸法(px)。value(億円)をこの最大高さに正規化する。
  const MAX_BAR_HEIGHT = 280;
  const maxValue = chartData.length > 0 ? Math.max(...chartData.map((p) => p.value)) : 0;

  const fontUrl = new URL("/fonts/NotoSansJP-Bold.ttf", req.url).toString();
  const fontData = await fetch(fontUrl).then((res) => res.arrayBuffer());

  const chartSection =
    chartData.length > 0
      ? {
          // 売上高推移の棒グラフ
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", flex: 1, padding: "0 64px", justifyContent: "center" },
            children: [
              { type: "div", props: { style: { display: "flex", fontSize: 24, fontWeight: 700, color: "#a0d4d6", marginBottom: 20 }, children: "📈 売上高の推移（億円）" } },
              {
                type: "div",
                props: {
                  style: { display: "flex", flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 32 },
                  children: chartData.map((p) => {
                    const barHeight = Math.max(14, Math.round((p.value / maxValue) * MAX_BAR_HEIGHT));
                    return {
                      type: "div",
                      props: {
                        style: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", width: 100, height: MAX_BAR_HEIGHT + 90 },
                        children: [
                          { type: "div", props: { style: { display: "flex", fontSize: 24, fontWeight: 700, color: "#ffffff", marginBottom: 8 }, children: `${p.value}` } },
                          {
                            type: "div",
                            props: {
                              style: {
                                display: "flex",
                                width: 84,
                                height: barHeight,
                                borderRadius: "10px 10px 0 0",
                                backgroundImage: "linear-gradient(180deg, #66c3c6 0%, #2a7a7e 100%)",
                              },
                            },
                          },
                          { type: "div", props: { style: { display: "flex", fontSize: 20, color: "#a0d4d6", marginTop: 10 }, children: p.label } },
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
            { type: "div", props: { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "48px 64px 0" },
              children: [
                { type: "div", props: { style: { display: "flex", fontSize: 24, fontWeight: 700, color: "#66c3c6" }, children: "📊 IPO Scout" } },
                { type: "div", props: { style: { display: "flex", fontSize: 20, color: "#ffffff", backgroundColor: "#b31942", padding: "7px 18px", borderRadius: "999px", fontWeight: 700 }, children: "新規IPO承認" } },
              ] } },
            // 会社名・セクター + スコアバッジ
            { type: "div", props: { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "28px 64px 0" },
              children: [
                { type: "div", props: { style: { display: "flex", flexDirection: "column" },
                  children: [
                    { type: "div", props: { style: { display: "flex", fontSize: nameFontSize, fontWeight: 700, color: "#ffffff", lineHeight: 1.15 }, children: companyName } },
                    ...(sector ? [{ type: "div", props: { style: { display: "flex", fontSize: 22, color: "#a0d4d6", marginTop: 10 }, children: sector } }] : []),
                  ] } },
                { type: "div", props: { style: { display: "flex", alignItems: "center", gap: 10, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: "999px", padding: "10px 20px", flexShrink: 0 },
                  children: [
                    { type: "div", props: { style: { display: "flex", fontSize: 30, fontWeight: 700, color: gradeColor }, children: grade } },
                    { type: "div", props: { style: { display: "flex", fontSize: 20, fontWeight: 700, color: "#ffffff" }, children: `ランク・${score}点` } },
                  ] } },
              ] } },
            // メイン: 売上高推移グラフ(またはフォールバック)
            chartSection,
            // フッター: CTA
            { type: "div", props: { style: { display: "flex", alignItems: "center", justifyContent: "center", gap: "14px", backgroundColor: "rgba(0,0,0,0.22)", padding: "32px 64px" },
              children: [
                { type: "div", props: { style: { display: "flex", fontSize: 28, color: "#ffffff", fontWeight: 700 }, children: "続きはIPO Scoutで読む" } },
                { type: "div", props: { style: { display: "flex", fontSize: 28, color: "#66c3c6", fontWeight: 700 }, children: "→" } },
              ] } },
          ],
        },
      }
    ) as any,
    { width: 1200, height: 1200, fonts: [{ name: "NotoSansJP", data: fontData, style: "normal", weight: 700 }] }
  );
}
