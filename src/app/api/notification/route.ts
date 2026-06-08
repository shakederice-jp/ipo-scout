import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: 通知設定を取得
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('user_id');
  const companyId = searchParams.get('company_id');
  if (!userId) return NextResponse.json({ error: 'user_id required' }, { status: 400 });

  const supabase = getSupabase();
  const query = supabase.from('notification_settings').select('*').eq('user_id', userId);
  if (companyId) query.eq('company_id', companyId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// POST: 通知設定を保存
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { user_id, company_id, notify_listing, notify_bb, notify_lockup_90, notify_lockup_180, method_email } = body;
  if (!user_id || !company_id) return NextResponse.json({ error: 'user_id and company_id required' }, { status: 400 });

  const supabase = getSupabase();

  // プランチェック
  const { data: profile } = await supabase.from('user_profiles').select('plan, email').eq('id', user_id).single();
  const allowedPlans = ['notify', 'report', 'complete'];
  if (!profile || !allowedPlans.includes(profile.plan ?? '')) {
    return NextResponse.json({ error: 'この機能は通知プラン以上でご利用いただけます。', needsPlan: true }, { status: 403 });
  }

  const { error } = await supabase.from('notification_settings').upsert({
    user_id, company_id,
    notify_listing: notify_listing ?? true,
    notify_bb: notify_bb ?? true,
    notify_lockup_90: notify_lockup_90 ?? false,
    notify_lockup_180: notify_lockup_180 ?? false,
    method_email: method_email ?? true,
    method_push: false,
  }, { onConflict: 'user_id,company_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE: 通知設定を削除
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('user_id');
  const companyId = searchParams.get('company_id');
  if (!userId || !companyId) return NextResponse.json({ error: 'required' }, { status: 400 });

  const supabase = getSupabase();
  const { error } = await supabase.from('notification_settings').delete().eq('user_id', userId).eq('company_id', companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}