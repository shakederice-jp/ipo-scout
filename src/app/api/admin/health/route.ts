import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, { ok: boolean; detail: string }> = {};

  // Supabase接続チェック
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { count } = await sb.from('ipo_companies').select('*', { count: 'exact', head: true });
    results.supabase = { ok: true, detail: `接続OK（ipo_companies: ${count}件）` };
  } catch (e: any) {
    results.supabase = { ok: false, detail: e?.message };
  }

  // Claude API チェック
  try {
    const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    await claude.messages.create({ model: "claude-haiku-4-5", max_tokens: 10, messages: [{ role: "user", content: "ping" }] });
    results.claude = { ok: true, detail: "接続OK" };
  } catch (e: any) {
    results.claude = { ok: false, detail: e?.message };
  }

  // EDINET APIチェック
  try {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(`https://disclosure.edinet-fsa.go.jp/api/v2/documents.json?date=${today}&type=2`);
    results.edinet = { ok: res.ok, detail: res.ok ? "接続OK" : `HTTP ${res.status}` };
  } catch (e: any) {
    results.edinet = { ok: false, detail: e?.message };
  }

  // 直近Cronの実行確認（最後のnotification_logs）
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data } = await sb.from('notification_logs').select('sent_at').order('sent_at', { ascending: false }).limit(1);
    const last = data?.[0]?.sent_at ?? '記録なし';
    results.last_cron = { ok: true, detail: `最終実行: ${last}` };
  } catch (e: any) {
    results.last_cron = { ok: false, detail: e?.message };
  }

  const allOk = Object.values(results).every(r => r.ok);
  return NextResponse.json({ ok: allOk, results, checked_at: new Date().toISOString() });
}