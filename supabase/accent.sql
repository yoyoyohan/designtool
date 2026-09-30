-- Paste into Supabase → SQL Editor → Run.
-- Adds a second school colour (Secondary) next to Bar and Text.
-- Existing rows keep an empty Secondary until you Save one in the logo library.

alter table public.bars add column if not exists accent text not null default '';
