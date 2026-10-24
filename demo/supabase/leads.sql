-- the site's sign-ups · the one table the mirror writes, run in the Supabase SQL editor
--
-- Every form on boasis.ae keeps its own JSON file and, once the mirror is on, also puts a row here:
-- the early access form, the two dialogs on the home page and the contact form. `data` is the record
-- exactly as the site wrote it, and the four columns beside it are copies of what you sort and filter
-- on the morning after, written by the function from that same object, so they cannot drift.
--
-- One row per submit, not one per person: the early access form adds nothing twice to its file while
-- this table keeps every arrival, which is the history you want when someone signs up at the stand,
-- then again from the hotel. Count people with `count(distinct email)` and you have the other number.
--
-- Paste all of this at once: SQL Editor → New query → Run. It is safe to run twice, everything is
-- if not exists.

create table if not exists public.site_leads (
  id            bigint generated always as identity primary key,
  kind          text        not null check (kind in ('early_access','waitlist','demo','contact','sharjah_next')),
  full_name     text,
  email         text,                                    -- lower cased, as every form here keeps it
  phone         text,                                    -- dial code + number, spaces as typed
  company       text,                                    -- what the form called it: authority, organisation, who
  at            timestamptz not null,                    -- when the site accepted it, in its own clock
  received_at   timestamptz not null default now(),      -- when this table got it, for the odd delayed copy
  data          jsonb       not null                     -- the whole record, as data/*.json holds it
);

comment on table public.site_leads is 'boasis.ae form sign-ups, mirrored by the save-lead edge function · append only';

create index if not exists site_leads_kind_at_idx on public.site_leads (kind, at desc);

/* The Sharjah Next stand page posts kind 'sharjah_next'. A table created before that name existed
   still holds the older check, and this pair is what widens it. Safe to paste twice: it drops the
   constraint by name and puts it back, and it reads every row first, so if a value outside the list
   is already in the table the paste fails loudly instead of stranding those rows. */
alter table public.site_leads drop constraint if exists site_leads_kind_check;
alter table public.site_leads add constraint site_leads_kind_check
  check (kind in ('early_access','waitlist','demo','contact','sharjah_next'));
create index if not exists site_leads_email_idx   on public.site_leads (lower(email));

-- the lock, same as spark_leads: Supabase grants the browser roles on new tables in public/, so
-- row level security enabled with no policies is what leaves them with zero rows, and the function
-- writes with the service role, which walks past it. This door also wants a key in the header.
alter table public.site_leads enable row level security;

-- insert and read only, never update and never delete: the mirror appends, and a row here is a
-- record of something a person chose to tell us at a given minute.
revoke all on table public.site_leads from anon, authenticated;
grant select, insert on table public.site_leads to service_role;

/* ── the two people already taken, optional, run once ───────────────────────────
   They exist in data/manage.json on the server, written on Oct 6. The lines below copy them in and
   skip anyone already there, so it can be run twice without a double row. Your own test sign-up is
   deliberately left out, it says "testing mails" and is not a lead. */

insert into public.site_leads (kind, full_name, email, phone, company, at, data)
select v.* from (values
  ('early_access', 'Mehran Zare', 'mezz@hq.coach', '+971 557895626',
   'CoachHQ Apps FZCO and WedShape transformations FZCO',
   timestamptz '2026-10-06 10:16:01+00',
   '{"name":"Mehran Zare","email":"mezz@hq.coach","phone":"+971 557895626","have":"yes","count":"1-3","authority":"CoachHQ Apps FZCO and WedShape transformations FZCO","plans":"","at":"2026-10-06T10:16:01.672Z"}'::jsonb),
  ('early_access', 'Arvind Verma', 'arvind@nodowntime.co', '+91 9599971218',
   'NoDowntime Technologies FZCO',
   timestamptz '2026-10-06 17:41:03+00',
   '{"name":"Arvind Verma","email":"arvind@nodowntime.co","phone":"+91 9599971218","have":"yes","count":"1","authority":"NoDowntime Technologies FZCO","plans":"","at":"2026-10-06T17:41:03.041Z"}'::jsonb)
) as v(kind, full_name, email, phone, company, at, data)
where not exists (
  select 1 from public.site_leads s where s.kind = v.kind and s.email = v.email
);

/* the CSV, whenever you want one: SQL Editor → paste → Run → Download results. */
-- select to_char(at at time zone 'Asia/Dubai', 'YYYY-MM-DD HH24:MI') as joined_dubai,
--        kind, full_name, email, phone, company, data
-- from public.site_leads order by at desc;
