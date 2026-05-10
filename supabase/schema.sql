-- IPO Scout: Supabase に貼り付けて実行してください（SQL エディタ / migration）

create table if not exists public.ipo_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sector text,
  ticker text,
  listing_date date,
  ai_summary text,
  created_at timestamptz not null default now()
);

alter table public.ipo_companies enable row level security;

drop policy if exists "ipo_companies_select_public" on public.ipo_companies;

create policy "ipo_companies_select_public"
  on public.ipo_companies
  for select
  to anon, authenticated
  using (true);

insert into public.ipo_companies (name, sector, ticker, listing_date, ai_summary)
values
  (
    'テック・イノベーション株式会社',
    '情報通信',
    '未上場',
    current_date + interval '45 days',
    '成長ドライバーはクラウド基盤の外販と大手向け受託の二本柱。営業利益率は業界平均を上回るが、大型案件の集中により四半期ごとのブレに注意。IPO 後のガバナンス強化が鍵。'
  ),
  (
    'グリーンエナジー開発',
    '電力・ガス',
    '未上場',
    current_date + interval '90 days',
    '再エネ設備の O&M と蓄電池事業が収益の主軸。政策依存度は高いが、長期 PP 契約でレベニュー性は確保。金利上昇局面での設備投資ペースがリスク要因。'
  )
;
