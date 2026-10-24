-- The Sharjah Next page at boasis.ae/spark-event · the second table, run in the Supabase SQL editor
--
-- Same columns, same rules and same shape as public.spark_leads, in its own table: the two pages ask
-- the same four things and hand the person to the same Mira, and the crowds are counted, exported and
-- cleared on different days. The functions decide which table a row lives in from the page that asks
-- for the pass, and afterwards a pass is found by itself, so the Brain is told nothing new.
--
-- Paste all of this at once: SQL Editor → New query → Run. Safe to run twice, everything is
-- if not exists. If you have never run demo/supabase/spark.sql, run that one first: this file
-- repeats the table it makes, so a fresh project gets both.

create table if not exists public.spark_event_leads (
  pass          text        primary key,                 -- PASSxxxxxxxx, the whole credential
  email_hash    text,                                    -- sha256 of salt + address, never the address's neighbours
  full_name     text,
  email         text,                                    -- lower cased, as every other form here keeps it
  phone         text,                                    -- dial code + number, spaces as the site writes them
  country_code  text,
  residence     text,                                    -- 'uae', 'abroad', or empty if they did not say
  consent       boolean,
  source        text,                                    -- 'sharjah-next-2026', what the page sends
  last_step     text,                                    -- describe, mira, activities, package
  steps_reached text[],                                  -- in the order they happened
  turns         integer     default 0,                   -- how many times the person typed something
  price_aed     numeric,                                 -- the estimate as the last step left it
  created_at    timestamptz,
  updated_at    timestamptz,
  expires_at    timestamptz,                             -- when the pass stops working
  data          jsonb       not null                     -- the whole record, exactly as the file version holds it
);

comment on table public.spark_event_leads is 'boasis.ae/spark-event · one row per visitor · written by the same spark edge functions, table chosen by the page';

-- the two lookups the code makes: by pass, and by address for a person who scans twice
create index if not exists spark_event_leads_email_hash_idx on public.spark_event_leads (email_hash);
create index if not exists spark_event_leads_updated_at_idx  on public.spark_event_leads (updated_at desc);

-- the lock, the same one as the first table: RLS enabled with no policies, so the anon key a browser
-- holds reads zero rows, and an empty query in the dashboard is fixed with the service key, never
-- with a policy.
alter table public.spark_event_leads enable row level security;

revoke all on table public.spark_event_leads from anon, authenticated;
grant select, insert, update on table public.spark_event_leads to service_role;
