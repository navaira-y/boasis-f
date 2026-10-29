create table if not exists public.sharjah_next_leads (
  id            bigint generated always as identity primary key,
  ref           text        unique,
  full_name     text,
  email         text,
  phone         text,
  country_code  text,
  consent       boolean,
  source        text,
  at            timestamptz not null,
  received_at   timestamptz not null default now(),
  data          jsonb       not null
);

comment on table public.sharjah_next_leads is 'boasis.ae/sharjah-next form sign-ups, mirrored by the save-lead edge function · append only';

create index if not exists sharjah_next_leads_at_idx   on public.sharjah_next_leads (at desc);
create index if not exists sharjah_next_leads_email_idx on public.sharjah_next_leads (lower(email));

alter table public.sharjah_next_leads enable row level security;

revoke all on table public.sharjah_next_leads from anon, authenticated;
grant select, insert on table public.sharjah_next_leads to service_role;
grant update on table public.sharjah_next_leads to service_role;
