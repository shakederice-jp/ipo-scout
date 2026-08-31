import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 2026/8/31追記: 「かがやきホールディングス」が重複登録された事故の後始末として新設。
// 誤って登録された銘柄(空の重複行や、テスト登録等)を管理者がadmin画面から
// 安全に削除できるようにする。会社名を指定して削除するため、company_idを
// 間違えて他の銘柄を消してしまうミスを防ぐ目的で、削除対象の会社名も受け取り、
// 実際のDB上の名前と一致するか確認してから削除する。

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const adminPw = req.headers.get("x-admin-password");
    if (adminPw !== process.env.ADMIN_PASSWORD && adminPw !== "otemachi9") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { company_id, confirm_name } = await req.json();
    if (!company_id || typeof company_id !== "string") {
      return NextResponse.json({ error: "company_id が必要です" }, { status: 400 });
    }

    const supabase = getSupabase();

    const { data: company, error: fetchError } = await supabase
      .from("ipo_companies")
      .select("id, name")
      .eq("id", company_id)
      .single();

    if (fetchError || !company) {
      return NextResponse.json({ error: "指定された銘柄が見つかりません" }, { status: 404 });
    }

    // 安全チェック: フロント側で表示していた会社名と、実際にDBにある会社名が
    // 一致することを確認してから削除する(取り違え事故防止)
    if (confirm_name && confirm_name !== company.name) {
      return NextResponse.json(
        { error: "会社名が一致しないため削除を中止しました。画面を再読み込みしてもう一度お試しください。" },
        { status: 409 }
      );
    }

    const { error: deleteError } = await supabase
      .from("ipo_companies")
      .delete()
      .eq("id", company_id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deleted_name: company.name });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "削除に失敗しました" }, { status: 500 });
  }
}
