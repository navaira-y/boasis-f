# The mirror: every form sign-up, in your own table

Four forms take names on this site, and until now each one's list was a JSON file under `DATA_DIR`:

| the form | where it is | the endpoint | the kind in the table |
|---|---|---|---|
| Early access | `/early-access` | `POST /api/manage` | `early_access` |
| Join early access, the dialog | home page | `POST /api/waitlist` | `waitlist` |
| Book a demo, the setup dialog | home page | `POST /api/demo` | `demo` |
| Contact us | `/contact` | `POST /api/contact` | `contact` |

The files stay. They are written first, in the same request, and a sign-up that reaches the file is a
sign-up we have. What this adds is a **copy** in `public.site_leads` in the Supabase project, which
fixes the one thing the files cannot do on their own: survive a deploy.

Hostinger puts each build in `domains/boasis.ae/hbuilds/versions/<id>/` and points `current` at it, so
an app that writes into its own folder writes into the build. The next deploy is a new folder with a new
empty `data`, and the live path stops showing the names taken before it. That is how an early access
list from Oct 6 became invisible on Oct 12, and it is why the list now goes somewhere a symlink cannot
move.

## What a row holds

```
kind, full_name, email, phone, company, at, received_at, data
```

`data` is the record exactly as the site built it, so nothing the form asked is lost to a column list.
The five beside it are the ones worth sorting and filtering the morning after, and they are written by
the function from `data`, never from a caller's claim about its own fields. One row per submit, not one
per person: the site's own file still refuses to add the same address twice, while the table keeps every
arrival, which is the history you want when someone signs up at the stand and again from the hotel.

`email` is lower cased in the table, as it is in the files. `at` is the minute the site accepted it.
Nothing else about the visitor is copied: no IP, no hash, no cookie, no user agent, and never the
captcha puzzle or the mailbox code, because a solved puzzle sitting in a table is an invitation.

## Turning it on

One secret and two pastes. Nothing in this changes what a visitor sees, and with the secret unset the
site behaves exactly as it did before, files only.

1. **The table.** Supabase dashboard → SQL Editor → New query → paste all of `demo/supabase/leads.sql`
   → Run. It creates `public.site_leads`, its two indexes, and the lock. Safe to run twice. The file
   ends with an optional block that copies in the sign-ups already taken, so a migration does not lose
   the morning.
2. **The door.** Supabase dashboard → Edge Functions → `save-lead` → paste
   `demo/supabase/dashboard/save-lead.js` → Save, Deploy if it asks. `Verify JWT` off, like the other
   three, because this door has its own key.
3. **The key.** Project Settings → Edge Functions → Secrets → add `LEADS_PUSH_KEY` with a long random
   string. `SPARK_SUPABASE_URL` and `SPARK_SERVICE_ROLE_KEY` are the pair the SPARK functions already
   use, so on that project there is one new value.
4. **The site.** hPanel → Environment variables → `LEADS_PUSH_KEY`, the same string. That is the whole
   change on the host: the URL to post to is the SPARK project's, `/functions/v1/save-lead`, and
   `LEADS_PUSH_URL` overrides it only if the mirror ever moves.

Then `https://boasis.ae/api/health` answers `leads: { enabled: true, host: "...supabase.co", sent: 0,
failed: 0, lastError: "" }`, and one test sign-up moves `sent` to 1. If `enabled` is false, the key did
not reach the app; if `failed` climbs while `sent` sits still, the door refused and `lastError` says
what it said.

## Getting the list out

Supabase dashboard → SQL Editor, paste, Run, **Download results**:

```sql
select to_char(at at time zone 'Asia/Dubai', 'YYYY-MM-DD HH24:MI') as joined_dubai,
       kind, full_name, email, phone, company, data
from public.site_leads
order by at desc;
```

That is the whole export, and it is the reason this exists: no SSH, no file manager, no question about
which build folder the process happens to be standing in. For one form, `where kind = 'early_access'`.
For people rather than submits, `count(distinct email)`.

## Why the door and not the table

The site could talk to PostgREST directly with the service key in an environment variable on the web
host, and that key reads and writes every table in the project. The mirror instead calls one function
that can do one thing, append a row to one table, to anyone who knows a key that never leaves two
secret stores. The service key stays inside Supabase, out of Hostinger's `.env`, out of any other app on
that account, and out of this repo.

The door refuses: a call without the key (`401 auth`), any call when its own secret is missing
(`500 config`, which is what "off" looks like from the outside), a body that is not JSON, one bigger
than 16 KB, a `kind` that is not one of the four, and anything that is not a POST. It never updates and
never deletes, so the table is an append log and the site's file remains the last word.

## What a failure costs

Nothing the visitor feels. `leads.push()` is awaited inside the request, before the mail, with a
2 second ceiling, and it cannot throw. A dead or slow mirror adds up to two seconds to a submit and
otherwise changes nothing: the row is in the file, the confirmation still says what it says, and the
only trace is one line, `[leads] mirror unreachable for contact: ...`. Mail is best effort here for the
same reason, and in the same order: store, then copy, then write to people.

## The files, in case

They are still the place to look if Supabase is ever unreachable, and they need one thing to be worth
reading after a redeploy: a home outside the build. Set `DATA_DIR=/home/u801320412/boasis-data` on
Hostinger, move the folder once, and the files survive every deploy as well as the table does.

```
mkdir -p /home/u801320412/boasis-data
cp -a /home/u801320412/domains/boasis.ae/hbuilds/current/nodejs/data/. /home/u801320412/boasis-data/
```

`scripts/spark-leads.js` reads the SPARK files; `lib/protect.js` keeps `/data/` unfetchable from the
web, wherever `DATA_DIR` points.
