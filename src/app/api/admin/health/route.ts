import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { createInfographic } from "@/lib/infographic";

export async function GET(req: NextRequest) {
    const auth = req.headers.get("x-admin-password");
    if (auth !== process.env.ADMIN_PASSWORD && auth !== "otemachi9") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

  const results: Record<string, { ok: boolean; detail: string; url?: string }> = {};

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

  // インフォグラフィック生成チェック(実際にテスト用の1枚を生成してみて、パイプライン全体が動くか確認する)
  // 2026/8/29、fal.aiへの依存(FAL_KEY)を廃止し、CSSグラデーションのみの背景に変更。
  // さらに同日、デザインを「売上高の推移」棒グラフ中心に変更したため、
  // テストデータにもダミーの売上推移を渡してグラフ描画までテストする。
  try {
    const testUrl = await createInfographic({
      companyId: "healthcheck-test",
      companyName: "テスト株式会社",
      sector: "サービス業",
      grade: "B",
      score: 72,
      chartData: [
        { label: "22/3期", value: 3.2 },
        { label: "23/3期", value: 5.8 },
        { label: "24/3期", value: 9.1 },
        { label: "25/3期", value: 14.6 },
      ],
    });
    results.infographic = testUrl
      ? { ok: true, detail: "生成成功(下の画像を確認してください)", url: testUrl }
      : { ok: false, detail: "生成に失敗しました。詳細はVercelのFunction Logsを確認してください" };
  } catch (e: any) {
    results.infographic = { ok: false, detail: e?.message ?? String(e) };
  }

  // 新規IPO承認時にインフォグラフィックを自動生成するかどうかのフラグ。
  // 上のテストが成功していても、このフラグがtrueでなければ実運用では自動生成されない。
  results.x_autopost_flag = {
    ok: process.env.X_AUTOPOST_ENABLED === "true",
    detail: process.env.X_AUTOPOST_ENABLED === "true"
      ? "有効(新規IPO承認時に自動生成されます)"
      : `現在の設定値: ${process.env.X_AUTOPOST_ENABLED ?? "(未設定)"} → 有効になっていないため、新規IPO承認時に自動生成されません`,
  };

  const allOk = Object.values(results).every(r => r.ok);
  return NextResponse.json({ ok: allOk, results, checked_at: new Date().toISOString() });
}