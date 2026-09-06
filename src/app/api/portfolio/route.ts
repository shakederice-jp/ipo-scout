import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseRouteClient } from "@/lib/supabase/server";

// 2026/9/6新設: 「100万円投資シミュレーション」機能。ログイン中のユーザーが
// 分析ページの「もし実際に100万円投資していたら」ボタンを押した際に呼ばれる。
// 投資額は常に100万円固定・銘柄ごとに独立(ユーザーの他の資産とは無関係)で、
// entry_price は公募価格(ipo_price)を採用する。
export const dynamic = "force-dynamic";

const getServiceSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseRouteClient();
  if (!supabase) return NextResponse.json({ error: "認証エラー" }, { status: 401 });

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const userId = session.user.id;

  let companyId: string | undefined;
  try {
    const body = await req.json();
    companyId = body?.companyId;
  } catch {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  if (!companyId) {
    return NextResponse.json({ error: "companyIdが必要です" }, { status: 400 });
  }

  const serviceSupabase = getServiceSupabase();

  const { data: company, error: companyError } = await serviceSupabase
    .from("ipo_companies")
    .select("id, ipo_price")
    .eq("id", companyId)
    .single();

  if (companyError || !company) {
    return NextResponse.json({ error: "銘柄が見つかりません" }, { status: 404 });
  }

  if (!company.ipo_price) {
    return NextResponse.json({ error: "この銘柄はまだ公募価格が確定していません" }, { status: 400 });
  }

  const { error: insertError } = await serviceSupabase
    .from("virtual_investments")
    .insert({
      user_id: userId,
      company_id: companyId,
      invested_amount: 1000000,
      entry_price: company.ipo_price,
    });

  if (insertError) {
    // 23505 = unique制約違反(user_id, company_id) → すでに追跡中として扱う
    if (insertError.code === "23505") {
      return NextResponse.json({ success: true, alreadyExists: true });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, alreadyExists: false });
}

// 2026/9/6新設: マイページから、追跡が不要になった銘柄をユーザー自身が削除できるように。
// user_idも条件に含めて削除することで、他人のvirtual_investmentsを誤って(または
// 意図的に)消せないようにしている(DB側のRLS delete policyでも同様にauth.uid()=user_idを
// 要求しているため、実質的に二重のチェックになっている)。
export async function DELETE(req: NextRequest) {
  const supabase = await createSupabaseRouteClient();
  if (!supabase) return NextResponse.json({ error: "認証エラー" }, { status: 401 });

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const userId = session.user.id;

  let companyId: string | undefined;
  try {
    const body = await req.json();
    companyId = body?.companyId;
  } catch {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  if (!companyId) {
    return NextResponse.json({ error: "companyIdが必要です" }, { status: 400 });
  }

  const serviceSupabase = getServiceSupabase();

  const { error: deleteError } = await serviceSupabase
    .from("virtual_investments")
    .delete()
    .eq("user_id", userId)
    .eq("company_id", companyId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
