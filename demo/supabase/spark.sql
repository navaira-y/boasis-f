-- SPARK demo · the one table, run in the Supabase SQL editor
--
-- One row per person, at the stand. `pass` is the key the QR gives out, and `data` is the whole
-- book: the form answers, every step, what the person typed and what the page said back. The other
-- columns are copies of the handful of fields you will want to sort, filter or count on the
-- morning after, and they are written by the functions from the same object, so they cannot drift.
--
-- Paste all of this at once, in the dashboard: SQL Editor → New query → Run.
-- It is safe to run twice: everything is if not exists.

create table if not exists public.spark_leads (
  pass          text        primary key,                 -- PASSxxxxxxxx, the whole credential
  email_hash    text,                                    -- sha256 of salt + address, never the address's neighbours
  full_name     text,
  email         text,                                    -- lower cased, as every other form here keeps it
  phone         text,                                    -- dial code + number, spaces as the site writes them
  country_code  text,
  residence     text,                                    -- 'uae', 'abroad', or empty if they did not say
  consent       boolean,
  source        text,                                    -- which stand, which link: 'ai-everything-2026'
  last_step     text,                                    -- describe, mira, activities, package
  steps_reached text[],                                  -- in the order they happened
  turns         integer     default 0,                   -- how many times the person typed something
  price_aed     numeric,                                 -- the estimate as the last step left it
  created_at    timestamptz,
  updated_at    timestamptz,
  expires_at    timestamptz,                             -- when the pass stops working
  data          jsonb       not null                     -- the whole record, exactly as the file version holds it
);

comment on table public.spark_leads is 'SPARK demo at boasis.ae/try-mira · one row per visitor · written by the spark edge functions only';

-- the two lookups the code actually makes: by pass, and by address for a person who scans twice
create index if not exists spark_leads_email_hash_idx on public.spark_leads (email_hash);
create index if not exists spark_leads_updated_at_idx  on public.spark_leads (updated_at desc);

-- the lock. Supabase grants the anon and authenticated roles on new tables in public/, so a table
-- with row level security ENABLED and no policies at all is a table those keys cannot read or
-- write: they get zero rows, not an error. Nothing in this demo ever needs an exception, because
-- every door goes through a function, and the service role inside a function walks past RLS.
-- That is why there is no `create policy` line below, and why adding one is the wrong fix when a
-- query in the dashboard comes back empty: use the service key, or read the table in the editor.
alter table public.spark_leads enable row level security;
