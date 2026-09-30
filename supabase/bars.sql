-- Paste into Supabase → SQL Editor → Run.
-- Adds the shared school bar colours (the board behind the crest and name).
-- Unlock the desk once after this so Ranking Studio can store the rest of the pack.

create table if not exists public.bars (
  id text primary key,
  name text not null,
  aliases text[] not null default '{}',
  bar_fill text not null,
  name_ink text not null,
  updated_at bigint not null
);

alter table public.bars enable row level security;

drop policy if exists "Anyone can read bars" on public.bars;
drop policy if exists "Signed-in staff can insert bars" on public.bars;
drop policy if exists "Signed-in staff can update bars" on public.bars;
drop policy if exists "Signed-in staff can delete bars" on public.bars;

create policy "Anyone can read bars"
  on public.bars for select
  using (true);

create policy "Signed-in staff can insert bars"
  on public.bars for insert
  to authenticated
  with check (true);

create policy "Signed-in staff can update bars"
  on public.bars for update
  to authenticated
  using (true)
  with check (true);

create policy "Signed-in staff can delete bars"
  on public.bars for delete
  to authenticated
  using (true);

insert into public.bars (id, name, aliases, bar_fill, name_ink, updated_at) values
  ('bar-lawrenceville', 'Lawrenceville', '{}', '#c21d41', '#ffffff', 0),
  ('bar-summit', 'Summit', '{}', '#fdc953', '#6b1c34', 0),
  ('bar-chatham', 'Chatham', '{}', '#122e59', '#ffffff', 0),
  ('bar-seton-hall-prep', 'Seton Hall Prep', '{}', '#005ba5', '#ffffff', 0),
  ('bar-delbarton', 'Delbarton', '{}', '#218954', '#ffffff', 0),
  ('bar-don-bosco-prep', 'Don Bosco Prep', '{}', '#6b1c34', '#ffffff', 0),
  ('bar-st-augustine', 'St. Augustine', '{}', '#042d5d', '#ffffff', 0),
  ('bar-shawnee', 'Shawnee', '{}', '#031a4b', '#ffffff', 0),
  ('bar-rumson-fair-haven', 'Rumson-Fair Haven', '{}', '#8d83a6', '#1a2748', 0),
  ('bar-westfield', 'Westfield', '{}', '#ffffff', '#122e59', 0),
  ('bar-scotch-plains-fanwood', 'Scotch Plains-Fanwood', '{}', '#1e3391', '#ffffff', 0),
  ('bar-christian-brothers', 'Christian Brothers', '{}', '#89bce5', '#1a2748', 0),
  ('bar-bridgewater-raritan', 'Bridgewater-Raritan', '{}', '#1a1a1a', '#ffffff', 0),
  ('bar-ridgewood', 'Ridgewood', '{}', '#ffffff', '#7c0202', 0),
  ('bar-gill-st-bernard-s', 'Gill St. Bernard''s', '{}', '#1a1a16', '#ffffff', 0),
  ('bar-kent-place', 'Kent Place', '{}', '#218954', '#ffffff', 0),
  ('bar-oak-knoll', 'Oak Knoll', '{}', '#0b1e3a', '#ffffff', 0),
  ('bar-morristown', 'Morristown', '{}', '#7a3040', '#f3ead2', 0),
  ('bar-mendham', 'Mendham', '{}', '#c41d32', '#ffffff', 0),
  ('bar-moorestown', 'Moorestown', '{}', '#111111', '#f5c518', 0),
  ('bar-trinity-hall', 'Trinity Hall', '{}', '#f4832a', '#1a2748', 0),
  ('bar-haddonfield', 'Haddonfield', '{}', '#c50c21', '#ffffff', 0),
  ('bar-pingry', 'Pingry', '{}', '#0072c8', '#ffffff', 0),
  ('bar-montclair-kimberley', 'Montclair Kimberley', '{}', '#142451', '#ffffff', 0)
on conflict (id) do nothing;
