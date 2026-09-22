-- Ranking Studio shared logo desk
-- Paste this into Supabase → SQL Editor → Run.
--
-- Then: Authentication → Users → Add user
--   Email: desk@sportsbusiness.local   (or set VITE_DESK_EMAIL to match)
--   Password: the sports business desk key
-- Turn off "Confirm email" in Authentication → Providers → Email so that login works immediately.

create table if not exists public.logos (
  id text primary key,
  name text not null,
  aliases text[] not null default '{}',
  tags text[] not null default '{}',
  mime text not null default 'image/png',
  uploaded_at bigint not null,
  updated_at bigint not null
);

alter table public.logos enable row level security;

drop policy if exists "Anyone can read crests" on public.logos;
drop policy if exists "Signed-in staff can insert crests" on public.logos;
drop policy if exists "Signed-in staff can update crests" on public.logos;
drop policy if exists "Signed-in staff can delete crests" on public.logos;

create policy "Anyone can read crests"
  on public.logos for select
  using (true);

create policy "Signed-in staff can insert crests"
  on public.logos for insert
  to authenticated
  with check (true);

create policy "Signed-in staff can update crests"
  on public.logos for update
  to authenticated
  using (true)
  with check (true);

create policy "Signed-in staff can delete crests"
  on public.logos for delete
  to authenticated
  using (true);

insert into storage.buckets (id, name, public)
values ('crests', 'crests', true)
on conflict (id) do update set public = true;

drop policy if exists "Anyone can view crest files" on storage.objects;
drop policy if exists "Signed-in staff can upload crest files" on storage.objects;
drop policy if exists "Signed-in staff can replace crest files" on storage.objects;
drop policy if exists "Signed-in staff can delete crest files" on storage.objects;

create policy "Anyone can view crest files"
  on storage.objects for select
  using (bucket_id = 'crests');

create policy "Signed-in staff can upload crest files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'crests');

create policy "Signed-in staff can replace crest files"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'crests')
  with check (bucket_id = 'crests');

create policy "Signed-in staff can delete crest files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'crests');
