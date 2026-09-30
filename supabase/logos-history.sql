-- Paste into Supabase → SQL Editor → Run.
-- Remembers the first crest and the last crop so Original / Undo work for everyone.

alter table public.logos add column if not exists has_original boolean not null default false;
alter table public.logos add column if not exists has_previous boolean not null default false;
