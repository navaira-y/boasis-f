create table if not exists public.spark_leads (
  pass          text        primary key,
  email_hash    text,
  full_name     text,
  email         text,
  phone         text,
  country_code  text,
  residence     text,
  consent       boolean,
  source        text,
  last_step     text,
  steps_reached text[],
  turns         integer     default 0,
  price_aed     numeric,
  created_at    timestamptz,
  updated_at    timestamptz,
  expires_at    timestamptz,
  data          jsonb       not null
);

comment on table public.spark_leads is 'SPARK demo at boasis.ae/try-mira · one row per visitor · written by the spark edge functions only';

create index if not exists spark_leads_email_hash_idx on public.spark_leads (email_hash);
create index if not exists spark_leads_updated_at_idx  on public.spark_leads (updated_at desc);

alter table public.spark_leads enable row level security;

revoke all on table public.spark_leads from anon, authenticated;
grant select, insert, update on table public.spark_leads to service_role;
