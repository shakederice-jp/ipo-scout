import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

// このインフォグラフィックの役割: 見た人が一瞬でこの銘柄の魅力に気づき、
// 「続きが気になる→サイトで詳しく読みたい」と思ってクリックしてもらうための
// X投稿用の"フック"画像。会社の詳細データを網羅する表ではなく、
// AIスコア(グレード)+ひとことインサイトの2点だけを大きく見せることに徹する。
//
// 背景は外部の画像生成(fal.ai)に依存すると、取得失敗時にレイアウトが崩れたり
// 生成のたびに絵柄が変わって見づらくなるため、CSSのグラデーションのみで組む
// (サイト本体のブランドカラーと統一・失敗しない・軽い)。

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
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
  const hook = truncate(searchParams.get("hook") || "AIがこの銘柄を分析しました。", 44);

  const gradeColor = score >= 80 ? "#4fd1c5" : score >= 60 ? "#f5a623" : "#ef6461";
  // 会社名の長さに応じてフォントサイズを落とし、幅1072px(1200-左右余白)からはみ出さないようにする
  const nameFontSize = companyName.length > 9 ? 52 : companyName.length > 6 ? 64 : 76;

  const fontUrl = new URL("/fonts/NotoSansJP-Bold.ttf", req.url).toString();
  const fontData = await fetch(fontUrl).then((res) => res.arrayBuffer());

  return new ImageResponse(
    (
      {
        type: "div",
        props: {
          style: {
            width: "1200px",
            height: "1200px",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#082b2e",
            backgroundImage: "linear-gradient(160deg, #082b2e 0%, #0d4f52 55%, #146669 100%)",
            fontFamily: "NotoSansJP",
            position: "relative",
          },
          children: [
            // 右上の大きな装飾円(奥行きを出すだけの飾り。テキストは含まない)
            {
              type: "div",
              props: {
                style: {
                  position: "absolute",
                  top: "-140px",
                  right: "-140px",
                  width: "420px",
                  height: "420px",
                  borderRadius: "999px",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  display: "flex",
                },
              },
            },
            // ヘッダー行: ブランド名 + 新規IPO承認バッジ
            {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "56px 64px 0",
                },
                children: [
                  { type: "div", props: { style: { display: "flex", fontSize: 26, fontWeight: 700, color: "#66c3c6" }, children: "📊 IPO Scout" } },
                  {
                    type: "div",
                    props: {
                      style: {
                        display: "flex",
                        fontSize: 22,
                        color: "#ffffff",
                        backgroundColor: "#b31942",
                        padding: "8px 20px",
                        borderRadius: "999px",
                        fontWeight: 700,
                      },
                      children: "新規IPO承認",
                    },
                  },
                ],
              },
            },
            // 会社名 + セクター
            {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  flexDirection: "column",
                  padding: "36px 64px 0",
                },
                children: [
                  { type: "div", props: { style: { display: "flex", fontSize: nameFontSize, fontWeight: 700, color: "#ffffff", lineHeight: 1.15 }, children: companyName } },
                  ...(sector
                    ? [{ type: "div", props: { style: { display: "flex", fontSize: 26, color: "#a0d4d6", marginTop: 14 }, children: sector } }]
                    : []),
                ],
              },
            },
            // 中央: スコアバッジ + フック文
            {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: "40px",
                  padding: "56px 64px 0",
                  flex: 1,
                },
                children: [
                  {
                    type: "div",
                    props: {
                      style: {
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "260px",
                        height: "260px",
                        borderRadius: "999px",
                        backgroundColor: "rgba(255,255,255,0.95)",
                        flexShrink: 0,
                      },
                      children: [
                        { type: "div", props: { style: { display: "flex", fontSize: 100, fontWeight: 700, color: gradeColor, lineHeight: 1 }, children: `${grade}` } },
                        { type: "div", props: { style: { display: "flex", fontSize: 22, fontWeight: 700, color: "#475569", marginTop: 6 }, children: "ランク" } },
                        { type: "div", props: { style: { display: "flex", fontSize: 26, fontWeight: 700, color: "#0d4f52", marginTop: 6 }, children: `${score}/100` } },
                      ],
                    },
                  },
                  {
                    type: "div",
                    props: {
                      style: {
                        display: "flex",
                        flexDirection: "column",
                        backgroundColor: "rgba(255,255,255,0.12)",
                        borderRadius: "20px",
                        padding: "32px 36px",
                        flex: 1,
                      },
                      children: [
                        { type: "div", props: { style: { display: "flex", fontSize: 30, color: "#e8f9f9", lineHeight: 1.6, fontWeight: 700 }, children: `「${hook}」` } },
                      ],
                    },
                  },
                ],
              },
            },
            // フッター: CTA
            {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "14px",
                  backgroundColor: "rgba(0,0,0,0.22)",
                  padding: "36px 64px",
                },
                children: [
                  { type: "div", props: { style: { display: "flex", fontSize: 30, color: "#ffffff", fontWeight: 700 }, children: "続きはIPO Scoutで読む" } },
                  { type: "div", props: { style: { display: "flex", fontSize: 30, color: "#66c3c6", fontWeight: 700 }, children: "→" } },
                ],
              },
            },
          ],
        },
      }
    ) as any,
    {
      width: 1200,
      height: 1200,
      fonts: [
        { name: "NotoSansJP", data: fontData, style: "normal", weight: 700 },
      ],
    }
  );
}
