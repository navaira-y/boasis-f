create table if not exists public.site_leads (
  id            bigint generated always as identity primary key,
  kind          text        not null check (kind in ('early_access','waitlist','demo','contact','sharjah_next')),
  full_name     text,
  email         text,
  phone         text,
  company       text,
  at            timestamptz not null,
  received_at   timestamptz not null default now(),
  data          jsonb       not null
);

comment on table public.site_leads is 'boasis.ae form sign-ups, mirrored by the save-lead edge function · append only';

create index if not exists site_leads_kind_at_idx on public.site_leads (kind, at desc);

alter table public.site_leads drop constraint if exists site_leads_kind_check;
alter table public.site_leads add constraint site_leads_kind_check
  check (kind in ('early_access','waitlist','demo','contact','sharjah_next'));
create index if not exists site_leads_email_idx   on public.site_leads (lower(email));

alter table public.site_leads enable row level security;

revoke all on table public.site_leads from anon, authenticated;
grant select, insert on table public.site_leads to service_role;

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
