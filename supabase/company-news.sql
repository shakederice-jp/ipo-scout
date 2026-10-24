-- 2026/10/24新設(束D・⑦): 分析ページの「この銘柄の最新情報」欄用の新情報テーブル。
-- 2026/10/30以降に作る表は、service_role への権限付与(grant)を明示しないとAPIから読み書きできないため、
-- grant を含めている。
create table if not exists public.company_news (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.ipo_companies(id) on delete cascade,
  published_on date not null,                 -- ニュースの日付(出典の日付)
  headline text not null,                     -- 見出し(1文)
  summary text,                               -- 要点(1〜2文・事実のみ)
  source_name text,                           -- 出典名(例: 会社のIR・日本経済新聞)
  source_url text not null,                   -- 出典のURL(確認できたものだけ保存)
  category text,                              -- 上場前の動き / 決算・業績 / 資本政策 / 株価 / その他
  importance text not null default 'normal',  -- normal / high(決算・増資・株価の急変など)
  dedupe_key text not null,                   -- 同じ出典を二重に載せないための印
  created_at timestamptz not null default now(),
  unique (company_id, dedupe_key)
);
create index if not exists company_news_company_date_idx on public.company_news (company_id, published_on desc);

-- 銘柄ごとの「最後に調べた日時」(調べる頻度を変えるため)
create table if not exists public.company_news_state (
  company_id uuid primary key references public.ipo_companies(id) on delete cascade,
  last_checked_at timestamptz not null default now()
);

alter table public.company_news enable row level security;
alter table public.company_news_state enable row level security;

grant select, insert, update, delete on public.company_news to service_role;
grant select, insert, update, delete on public.company_news_state to service_role;
