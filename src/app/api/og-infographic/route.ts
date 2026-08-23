import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const companyName = searchParams.get("companyName") ?? "";
  const backgroundUrl = searchParams.get("backgroundUrl") ?? "";
  const listingDate = searchParams.get("listingDate") ?? "未定";
  const exchange = searchParams.get("exchange") ?? "不明";
  const ticker = searchParams.get("ticker") ?? "未定";
  const revenue = searchParams.get("revenue") ?? "不明";
  const profit = searchParams.get("profit") ?? "不明";
  const underwriter = searchParams.get("underwriter") ?? "未定";

  const fontUrl = new URL("/fonts/NotoSansJP-Bold.ttf", req.url).toString();
  const fontData = await fetch(fontUrl).then((res) => res.arrayBuffer());

  const rows = [
    { label: "上場日", value: listingDate },
    { label: "市場", value: exchange },
    { label: "コード", value: ticker },
    { label: "売上", value: revenue },
    { label: "利益", value: profit },
    { label: "主幹事", value: underwriter },
  ];

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
            position: "relative",
            backgroundImage: `url(${backgroundUrl})`,
            backgroundSize: "cover",
            fontFamily: "NotoSansJP",
          },
          children: [
            {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  flexDirection: "column",
                  width: "100%",
                  padding: "40px 60px",
                  backgroundColor: "rgba(30,58,102,0.88)",
                },
                children: [
                  {
                    type: "div",
                    props: { style: { fontSize: 52, color: "#F5F4EF" }, children: companyName },
                  },
                  {
                    type: "div",
                    props: { style: { fontSize: 24, color: "#B31942", marginTop: 8 }, children: "新規IPO承認" },
                  },
                ],
              },
            },
            {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  padding: "60px",
                  marginTop: "auto",
                  marginBottom: "60px",
                },
                children: rows.map((r) => ({
                  type: "div",
                  props: {
                    style: {
                      display: "flex",
                      backgroundColor: "rgba(255,255,255,0.92)",
                      borderRadius: "8px",
                      padding: "14px 24px",
                      fontSize: 26,
                    },
                    children: [
                      { type: "div", props: { style: { color: "#1E3A66", width: "180px" }, children: r.label } },
                      { type: "div", props: { style: { color: "#0D1B33" }, children: r.value } },
                    ],
                  },
                })),
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