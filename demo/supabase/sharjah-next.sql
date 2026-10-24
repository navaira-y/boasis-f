-- the Sharjah Next stand · its own table, run in the Supabase SQL editor
--
-- One row per form submission at the stand, kept apart from the site's own sign-ups (which live in
-- public.site_leads) so the two lists can be exported, counted and cleaned up on different days. The
-- event is two days long and the follow up is somebody else's calendar; the website's early access
-- list is not.
--
-- `data` is the record exactly as the site wrote it, and the columns beside it are the few you
-- actually sort and filter on the morning after, written by the same function from that same object,
-- so they cannot drift.
--
-- Paste all of this at once: SQL Editor → New query → Run. Safe to run twice, everything is
-- if not exists, and nothing here drops or rewrites a row.

create table if not exists public.sharjah_next_leads (
  id            bigint generated always as identity primary key,
  ref           text        unique,                      -- SN-XXXXXX, what the page shows and the mails quote
  full_name     text,
  email         text,                                    -- lower cased, as every form here keeps it
  phone         text,                                    -- dial code + number, spaces as typed
  country_code  text,
  consent       boolean,                                 -- the tick box, kept as the proof somebody agreed
  source        text,                                    -- 'sharjah-next-2026', the offer they came for
  at            timestamptz not null,                    -- when the site accepted it, in its own clock
  received_at   timestamptz not null default now(),      -- when this table got it, for the odd delayed copy
  data          jsonb       not null                     -- the whole record, as data/sharjah-next/*.json holds it
);

comment on table public.sharjah_next_leads is 'boasis.ae/sharjah-next form sign-ups, mirrored by the save-lead edge function · append only';

create index if not exists sharjah_next_leads_at_idx   on public.sharjah_next_leads (at desc);
create index if not exists sharjah_next_leads_email_idx on public.sharjah_next_leads (lower(email));

-- the lock, same as every other table here: Supabase grants the browser roles on new tables in
-- public/, so row level security enabled with no policies is what leaves them with zero rows, and
-- the function writes with the service role, which walks past it. This door also wants a key.
alter table public.sharjah_next_leads enable row level security;

-- insert and read only, never update and never delete: the mirror appends, and a row here is a
-- record of something a person chose to tell us at a given minute.
revoke all on table public.sharjah_next_leads from anon, authenticated;
grant select, insert on table public.sharjah_next_leads to service_role;

/* whenever you want the list, or the CSV: SQL Editor → paste → Run → Download results. */
-- select to_char(at at time zone 'Asia/Dubai', 'YYYY-MM-DD HH24:MI') as at_dubai,
--        ref, full_name, email, phone, country_code, source, data
-- from public.sharjah_next_leads order by at desc;
