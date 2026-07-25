import { NextRequest, NextResponse } from "next/server";

const EDINET_KEY = process.env.EDINET_API_KEY!;

export async function POST(req: NextRequest) {
  try {
    const { company_name } = await req.json();
    if (!company_name) {
      return NextResponse.json({ error: "company_name required" }, { status: 400 });
    }

    // デバッグ:6/9固定で直接テスト
    const testUrl = `https://api.edinet-fsa.go.jp/api/v2/documents.json?date=2026-06-09&type=2&Subscription-Key=${EDINET_KEY}`;
    try {
      const res = await fetch(testUrl, {
        signal: AbortSignal.timeout(8000),
      });
      const bodyText = await res.text();
      console.error(`[EDINET直接テスト] status=${res.status} bodyLength=${bodyText.length} body先頭300文字=${bodyText.slice(0, 300)}`);
    } catch (e: any) {
      console.error(`[EDINET直接テスト] fetch失敗 error=${e?.message || e}`);
    }

    return NextResponse.json({ error: "デバッグ実行中です" }, { status: 404 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}