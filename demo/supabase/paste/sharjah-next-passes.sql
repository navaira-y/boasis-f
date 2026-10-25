create table if not exists public.sharjah_next_passes (
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

comment on table public.sharjah_next_passes is 'boasis.ae/sharjah-next · one row per visitor · written by the same spark edge functions, table chosen by the page';

create index if not exists sharjah_next_passes_email_hash_idx on public.sharjah_next_passes (email_hash);
create index if not exists sharjah_next_passes_updated_at_idx  on public.sharjah_next_passes (updated_at desc);

alter table public.sharjah_next_passes enable row level security;

revoke all on table public.sharjah_next_passes from anon, authenticated;
grant select, insert, update on table public.sharjah_next_passes to service_role;
