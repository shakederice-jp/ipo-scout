import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedUser, getServiceSupabase } from '@/lib/member-auth';

// 通知設定(銘柄ごと・全体)の取得・保存・削除。
// 2026/9/26修正: 以前はブラウザから送られてきた user_id をそのまま信じて読み書きしていたため、
// 他人の会員IDを指定すれば、その人の通知設定を見たり、勝手に登録・削除したりできてしまっていた。
// 現在は、ログイン情報からサーバー側で本人を確認し(src/lib/member-auth.ts)、本人の設定だけを扱う。
// (画面側から user_id が送られてきても使わない。互換のため受け取ること自体はエラーにしない)

const unauthorized = () =>
  NextResponse.json({ error: 'ログインが必要です', needsPlan: true }, { status: 401 });

export async function GET(req: NextRequest) {
  const user = await getVerifiedUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get('company_id');

  const supabase = getServiceSupabase();
  let query = supabase.from('notification_settings').select('*').eq('user_id', user.id);
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const user = await getVerifiedUser();
  if (!user) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'リクエストの形式が不正です' }, { status: 400 });
  const { company_id, notify_listing, notify_bb, notify_apply, notify_daily_reminder, notify_lockup_90, notify_lockup_180, method_email } = body;
  if (company_id === undefined) return NextResponse.json({ error: 'company_id required' }, { status: 400 });

  const supabase = getServiceSupabase();

  const { data: profile } = await supabase.from('user_profiles').select('plan, email').eq('id', user.id).single();
  const allowedPlans = ['notify', 'report', 'complete'];
  if (!profile || !allowedPlans.includes(profile.plan ?? '')) {
    return NextResponse.json({ error: 'この機能は通知プラン以上でご利用いただけます。', needsPlan: true }, { status: 403 });
  }

  const { error } = await supabase.from('notification_settings').upsert({
    user_id: user.id, company_id,
    notify_listing: notify_listing ?? true,
    notify_bb: notify_bb ?? true,
    notify_apply: notify_apply ?? true,
    notify_daily_reminder: notify_daily_reminder ?? false,
    notify_lockup_90: notify_lockup_90 ?? false,
    notify_lockup_180: notify_lockup_180 ?? false,
    method_email: method_email ?? true,
    method_push: false,
  }, { onConflict: 'user_id,company_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getVerifiedUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get('company_id');
  if (!companyId) return NextResponse.json({ error: 'required' }, { status: 400 });

  const supabase = getServiceSupabase();
  const { error } = await supabase.from('notification_settings').delete().eq('user_id', user.id).eq('company_id', companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
