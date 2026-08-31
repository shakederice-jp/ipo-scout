import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 2026/8/31追記: Skyfall(625A)がEDINET自動検出のスキャン窓(直近5日)を過ぎて
// 見落とされたまま二度と自動登録されない不具合が発覚したことを受けて新設。
// isProspectus()側の根本原因は別途修正済みだが、スキャン窓を過ぎてしまった銘柄は
// 恒久修正だけでは救済できないため、admin画面から手動でipo_companiesに
// 新規行を追加できる救済手段をあわせて用意した。
// 会社名以外は全て任意項目とし、未入力の項目はnullのまま登録する
// (STEP1〜STEP4の各実行で後から埋まっていく想定のため)。

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "会社名を入力してください" }, { status: 400 });
    }

    const supabase = getSupabase();

    // 重複登録防止: 同名の銘柄が既に存在する場合は登録せずエラーにする
    const { data: existing } = await supabase
      .from("ipo_companies")
      .select("id, name")
      .ilike("name", name);
    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: `「${existing[0].name}」は既に登録されています（重複登録を防ぐため中止しました）` },
        { status: 409 }
      );
    }

    const insertRow: Record<string, any> = {
      name,
      status: "手動登録・要確認",
    };
    const optionalFields = [
      "ticker", "exchange", "listing_date", "sector", "biz_type", "ai_summary", "edinet_doc_id",
    ];
    for (const field of optionalFields) {
      const v = body[field];
      if (typeof v === "string" && v.trim()) insertRow[field] = v.trim();
    }

    const { data, error } = await supabase
      .from("ipo_companies")
      .insert(insertRow)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, company: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "登録に失敗しました" }, { status: 500 });
  }
}
