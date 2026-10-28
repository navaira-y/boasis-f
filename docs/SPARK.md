# SPARK demo · form to Brain

Task 1 of the plan (`SPARK Demo Form to Brain Plan.pdf`, 5 October 2026): the offer page and
its form, placeholder text, hidden from Google, handing a pass to the Brain.

The plan is the authority on what is built and what is not. This file is the part the plan
leaves open: the exact bytes on the wire, the shape of the one JSON file per person, and the
clicks a developer has to make tonight.

## What is in the repo

```
try-mira.html                         the page, at boasis.ae/try-mira: the design file's markup,
                                        copy and fields, in the site's own look, with its styles
                                        inline in the one file
js/try-mira.js                        the form: validation, the pass, the handoff, and the two
                                        addresses a developer pastes in at the top
demo/supabase/functions/create-pass     the function the form posts to
demo/supabase/functions/save-step     the function the Brain UI posts to after every step
demo/supabase/functions/_shared/spark-core.js
                                      every rule, pure and testable in Node
lib/spark.js                          the three doors the demo needs, on this server, in data/
scripts/spark-leads.js                read the leads: a list, one person, or a CSV
scripts/spark-stub.js                 the same rules on a laptop, no Supabase needed
scripts/make-qr.js                    the stand QR, made here rather than at a web generator
scripts/make-supabase-single.js       the three Supabase functions, each as one file to paste in
demo/supabase/spark.sql               the one table: one row per person
scripts/make-supabase-single.js       the two Supabase functions, each written as one file to paste
demo/supabase/dashboard/              those three, generated from the folders, never edited here
docs/qr/try-mira.png                  the code, 1200px, for screens and slides
docs/qr/try-mira.svg                  the same code as vector, for print, with the orb inside it
docs/qr/try-mira-card.html            the one file to open and crop: the picture is inside it
```

The three demo files sit where the site's own files sit, so there is nothing to assemble and
nothing to copy: the orb, its video and the logo are the site's `/assets/` and `/js/` files, used
in place. The `demo/` folder holds only the two functions and the shared rules, and `server.js`
refuses it outright, because nothing in it is a page.

**What living on boasis.ae costs, said plainly.** Merging to main deploys the page, so the moment
to open the demo is a merge and the moment to close it is a delete. The page is invisible apart
from the QR: no link anywhere on the site, no sitemap entry, `noindex` in the header and the
meta tag, and a `Disallow` line in robots.txt (a test asserts all of it). The header is
`X-Robots-Tag: noindex, nofollow`, set by `server.js` for this one path, so the Nginx header the
plan asked for is already done. And because the POST
goes from the browser to Supabase directly, the plan's per-address Nginx limit cannot sit in
front of it: what stands between a flood and a hundred duplicate leads is Supabase's own limits,
plus the rules in the function, which are a honeypot, a too-fast refuse, and one pass per address
per day. A separate host would have had the Nginx counter as well. Say so if the stand is
expected to draw a crowd; `limit_req` on `location = /try-mira` covers the page loads only.

## What the page is, and the twelve things that differ from the design file

`try-mira.html` carries `Page salon Mira - EN.html`: its markup, its copy, its four points, its
two offers, its form fields and its footer, with the styles inline in the one file. A test reads
the page and refuses anything else. Eleven differences, each for a reason that is not taste:

1. the two base64 pictures are the site's own files, `/assets/logo/orb-160.png` for the mark and
   `/assets/logo/orb-512.png` for the still behind the orb, the same artwork at a usable size;
2. the video is `/assets/orb/orb.mp4` rather than 627 KB of text in the page, which is the same
   file the home page already streams;
3. three scripts, all of them files under `/js/`, because a content policy of this site refuses
   inline script on every page: `/js/yara-orb.js` for the orb, `/js/countries.js` for the country
   code (the site's own picker, shared with the dialogs, `/early-access` and `/contact`), and
   `/js/try-mira.js` for this form;
4. the form's `data-endpoint="/api/event"` is gone. Nothing lives at that address. The function url
   is set in `js/try-mira.js`, where a person can see it and change it;
5. `First name` and `Last name` are one `Full name` field, because the owner asked for one;
6. one empty `<p class="err" data-note></p>` above the button, for the sentences a field cannot
   carry, and `.err:empty{display:none}` keeps it invisible until it is needed;
7. the `noindex, nofollow` meta tag, plus the `X-Robots-Tag` header and the `Disallow` lines;
8. the page is night on every machine. The design page has two skins and picks one by the setting
   of the laptop that opens it, so the same page was white on one screen and dark on another;
   `data-theme="dark"`, `color-scheme: dark` and `theme-color` settle it;
9. the site's `favicon.ico`, `favicon-32.png` and `apple-touch-icon.png` are in the head, so the
   tab carries the mark. The design file shipped none;
10. the paint is boasis.ae's own, which the owner asked for on 5 October 2026, in these words:
    the header as the home page writes it, the capsule at its measure, its height and its fill, with
    only the logo inside and no links,
    the orb in the middle of its space, no
    second background behind the form, one gradient across the whole page, the glass of the site,
    the form on the right and the other things on the left, and the four points of `How it works`
    joined by one line that lights its way from 1 to 2 to 3 to 4 and then again. The light is `css/site.css`'s own
    `.sky` (three drifting lights) plus `css/early-access.css`'s wash behind that panel, the mix
    of navy into teal the registration page uses. The test reads those four values out of the two
    site stylesheets and requires them here, so the light stays the site's light and cannot
    quietly become someone's taste;
11. the phone is the page's main size, because it is the size a stand is. Under 700px the first
    section reads down the middle, the three tags centre under it, the form moves above the four
    points, the fields go to 54px and the button to the full width of the card, and the last line
    clears the bar at the bottom of the screen. The country panel is clamped to the viewport so it
    cannot hang off the side. A test reads those rules and requires them;
12. the country code is not a `<select>`. The owner asked for the picker the other forms use, so
    the markup is `/early-access`'s word for word, the `.cc-*` and `.mf-*` rules are copied out of
    `css/site.css` as written there, and the behaviour is the shared `js/countries.js`: a closed
    control that says `AE +971`, a panel with a search box, the list of dial codes in the file,
    alphabetical, and the hidden `country_code` input that the form posts.

Four things from the file are deliberately overridden by points 10 and 11: its light skin, its dark
plate behind the hero, its form on the left, and its native select. Everything a person reads is
still the file's words, and the fields are still the ones the plan allows.

The bar is `css/site.css`'s `.nav`, `.nav-bar`, `.brand` and `.nav .brand` copied rule for rule, and
a test rebuilds the site's `.nav-bar` line and requires the two strings to match, property for
property. For a while it matched with `background:rgba(11,13,18,.97)` deleted, which is what was
asked for and what then read as nothing at all over the drifting light; the owner asked for the
solid bar back, and there is now no difference between the two files to explain. The page's own measure is `min(100% - 56px, 1124px)`, which is the site's `.wrap` (1180
less 28px each side) and the width the bar is cut to, so the mark lines up with the headings under
it the way it does on the home page.

One trap, because it cost an hour: the page's night goes on `body` and nowhere else. Put a
background on `html` too and the browser stops carrying the body's to the canvas, paints it as a
box over the sky, and the whole page reads flat black with the lights hidden underneath.

The connector needs no geometry at run time. Each `.step` owns the piece of line that leaves it:
`top:36px; bottom:-10px`, that is from the bottom of its own number to the top of the next one, the
10px being the grid's own row gap. So the line is exact whatever the text does and whatever the
width is. The light is a second copy of that same piece, one per point, each on the same 5.6s
clock and each waiting `--i * 1.4s`, where `--i` is written by four `:nth-child` rules. A piece
fills, hands off at 25% at half light, and the next one is already starting, so it reads as one
head travelling down the list. The point and its words take a `brightness` pulse on the same clock
and the same delay, which is why they cannot drift out of step with the line. `mix-blend-mode:
plus-lighter` is what makes it add light rather than paint over it.

Under `prefers-reduced-motion: reduce` the travelling copy is switched off and the line itself
takes the teal once, so the four points stay joined and nothing moves.

## The QR for the stand

`docs/qr/try-mira.png` and `docs/qr/try-mira.svg` encode one address, `https://boasis.ae/try-mira`
and nothing else, so scanning lands the visitor on the form with Mira's orb in the middle of it.

For the picture on a screen or in a slide, open `docs/qr/try-mira-card.html`: it is one file with the
PNG inside it as data, nothing external to load, the code on the night of the brand with the address
under it. Crop tight around the white square and you have the print file; take the whole picture and
you have the one for the stand screen. Printing it sends the dark and the address away by itself.

Four things about it are not taste:

- **error correction H**, which is what lets the orb stand in the middle at all. The ring is 8
  modules of the 33 across, and every module it touches is left out whole rather than painted over
  in part, so the code gives up 4.7% of itself where a camera would otherwise see a half module
  and guess.
- **four modules of white on every side**, the quiet zone, which is what makes a code on a busy
  poster read on the first try.
- **near-black on white**, `#0B0D12` on `#fff`, with no tint on the modules. A coloured code is a
  nicer picture and a worse scan, and a hall is not good light.
- **it lives under `docs/`**, which `lib/protect.js` refuses to serve. The same file in
  `/assets/` would be a guessable download whose first line is the entrance address in plain text.

To print it, use the SVG, and go as large as the distance needs. The usual rule is a tenth: 10 cm
for someone standing a metre away, 30 cm for a banner read from three. It is vector and it carries
the orb inside it, so there is nothing to place and nothing to line up.

To remake it, or to point it somewhere else:

```
npm i --no-save qrcode sharp jsqr          the three packages the site itself does not use
node scripts/make-qr.js                    writes both files, then reads them back
node scripts/make-qr.js --size=2400
node scripts/make-qr.js --url=https://…    another address, the same rules
```

The script ends by decoding the picture at 1200, 600, 320 and 160 px and printing what it found.
It exits non-zero if any size stops reading, so a QR that cannot be scanned never reaches a
printer. A test runs it, and another test asserts the two files are not fetchable from the site.

**Before the QR is handed out, the page has to be on main.** Until then that address has nothing
behind it, and a code is a promise to a 404.

## The one file per person

One file per lead, named by the pass, written by the form and added to by every step. The whole
visit ends up in it: the name, the number, what the person typed, and what the page said back.

By default it lives on boasis.ae itself, in the folder the site already keeps its waitlist and its
contact messages in:

```
data/leads/PASSR4RK96R4.json
data/spark-by-email/<sha256 of salt + address>.json      → { "pass": "PASSR4RK96R4" }
```

`DATA_DIR` moves it, `data/` is in `.gitignore`, and `lib/protect.js` refuses to serve anything
under it, so the folder is on the server and never on the web. The second file exists so that a
person who reloads, or scans the QR twice, is handed the same pass and the same record rather
than a second stranger. The address itself never appears in a file name, only its hash.

The same object also goes into Supabase, if that is preferred: `demo/supabase/spark.sql` makes a
table `spark_leads` with **one row per person**, keyed by the pass, and a `data` column that is
this object entire. It is the same
module and the same rules either way, so the choice is only about where the bytes sit. See
"Both back ends" below.

```json
{
  "pass": "PASSR4RK96R4",
  "version": 7,
  "created_at": "2026-10-05T10:00:00.000Z",
  "updated_at": "2026-10-05T10:06:00.000Z",
  "expires_at": "2026-10-06T10:00:00.000Z",
  "source": "ai-everything-2026",
  "contact": {
    "full_name": "Lena Bisht",
    "email": "lena@corp.com", "phone": "+971 551112222",
    "country_code": "+971", "residence": "uae", "consent": true
  },
  "brain": {
    "steps_reached": ["describe", "mira", "activities", "package"],
    "last_step": "package",
    "description": "what they typed, as typed",
    "mira": [ { "at": "…", "question": "…", "answer": "…" } ],
    "activities": { "shown": ["…"], "picked": ["…"], "confirmed": true },
    "package": { "shareholders": ["…"], "visas": ["…"], "premises": "…", "price_aed": 15000, "confirmed": false },
    "log":    [ { "at": "…", "in": "what the person typed", "out": "what the page said" } ],
    "output": { "describe": "…", "package": "the estimate as the step ended with it" }
  }
}
```

`log` and `output` are the part that makes it one book rather than a form receipt: every turn of
the conversation, in order, plus how each step ended. Both are capped so that one person's file
stays a page (60 turns, 6 KB each), and both are optional: a Brain that only knows the four tidy
fields still produces a complete record.

Not stored, because the plan keeps the application part out of this demo: no passport, no
Emirates ID, no KYC video. The page has no field for them and the merge has no step that
would accept them.

One object per person, rather than rows of columns, is what makes both back ends the same demo: the
Brain keeps its sessions in memory and gains no database, so one JSON record is the smallest thing
both sides can agree on. On Supabase it is one row whose `data` column holds that object, and the
flat columns beside it are copies made from it, so a query can sort by step or count how many asked
about visas without anyone having to agree on a schema first. Two consequences to accept, both
written into the code:

- the record is written whole, so nothing queries across half a person's journey. The columns are a
  summary, and `data` is the truth.
- a step is a read, a merge and a write. The merge is additive and never deletes, so the worst a
  collision can do is lose one step of one person, not the record.

### Reading them

On the server, or from a copy of the folder:

```
node scripts/spark-leads.js                      every lead, newest first, one line each
node scripts/spark-leads.js --pass=PASSR4RK96R4  one person, the whole visit, as a page of text
node scripts/spark-leads.js --csv > leads.csv    all of it, for SPARK or for Sheets
node scripts/spark-leads.js --day=2026-10-06     one day of the event
```

It writes nothing, so it is safe to run beside a live stand. The output is names and phone
numbers: read it in a terminal, send a CSV to one address, and do not leave either in the repo,
in a chat, or in an email to a list.

## The three doors

```
POST /api/spark-pass    the form, and it answers with the pass and where to take the person
POST /api/spark-step    the Brain, after every step
GET  /api/spark-lead    the Brain, when it wants to know where that person stopped
```

Mounted by `require('./lib/spark')(app, …)` in `server.js`, implemented in `lib/spark.js`, and
named in the guard's `API_ROUTES` list, which is closed by default: a route mounted but not named
there is a 404 that looks healthy in the code, and a test compares the two lists so that cannot
stay unfound.

## create pass

`POST` from the page, JSON in, JSON out.

```
{ "full_name":"Lena Bisht", "email":"lena@corp.com",
  "phone":"0551112222", "country_code":"+971", "residence":"uae",
  "consent":true, "hp":"", "source":"ai-everything-2026", "_t":9000 }

200 { "ok":true, "pass":"PASSR4RK96R4", "brain_url":"https://brain.boasis.ae/demo", "reused":false }
400 { "ok":false, "error":"email" | "consent" | "phone" | "full_name" }
400 { "ok":false, "error":"bot" | "too-fast" }        503 { "ok":false, "error":"busy" }
```

`_t` is the milliseconds the page was open before the tap. Under 1200 is refused as a machine.
`hp` is a field no person can see; anything in it is refused. Both are checked in the function,
not only in the page, because the page is the least trusted part of the system.

The answer carries no row key, no file name and no table name, and accepts none: the caller cannot
name the thing it writes, only the four fields the form has.

## save step

`POST` from the Brain UI after each step, the same way, and this is the only write the journey
needs:

```
{ "pass":"PASSR4RK96R4", "step":"mira",
  "data":{ "question":"…", "answer":"…",
           "output":"how that step ended",
           "log":[ { "in":"what the person typed", "out":"what Mira said" } ] } }

200 { "ok":true, "version":4, "steps_reached":["describe","mira"] }
400 { "ok":false, "error":"pass" | "step" | "json" }     404 { "ok":false, "error":"unknown" | "expired" }
```

## read lead

```
GET /api/spark-lead?pass=PASSR4RK96R4

200 { "ok":true, "lead":{ …the file above, as it stands… } }
400 { "ok":false, "error":"pass" }        404 { "ok":false, "error":"unknown" | "expired" }
```

This is what makes the journey resumable: a person who closes the page and opens the QR again
comes back to their own step. It is answered `no-store`, it is rate limited with the other two,
and it is CORS-closed to the origins in `SPARK_ORIGINS`. Like everything else here, the pass is
the credential: whoever holds it reads and updates that one file, which is what a browser at
another subdomain can do without a login. A pass is eight characters, lives a day, and is not
written in any link the site publishes.

`step` is one of `describe`, `mira`, `activities`, `package`. Anything else is refused. The
pass is the whole credential: no account, no token, and the pass shape is checked
`PASS` + eight characters from an alphabet with no `I`, `O`, `0` or `1`, no slash and no dot,
**before** a single character of it is used as an object name.

## Tonight, in order

The default is the folder the site already keeps its waitlist in, so there is nothing to sign up
to. If you decided on Supabase instead, the steps are the section "Supabase, all of it in the
browser, no CLI" further down, and from step 3 below onward nothing else about this list changes.

1. **Merge, and the page is live.** The form points at the `create-pass` function of the
   `boasis-spark` project, and the frame at `https://brain.boasis.ae`, so there is no key to paste
   and no address to type. No Supabase account is needed to run the demo at all: `endpoint` in
   `js/try-mira.js` back to `'/api/spark-pass'` moves it to this server, where `data/leads` is
   made by the app on the first submit. `SPARK_PROJECT_URL` in the site's `.env` moves the
   `connect-src` allowance with it, and a test fails if the two hosts disagree.
2. **Only if the Brain address is not that one:** `SPARK_BRAIN_URL=https://…` in the site's
   `.env`, and `SPARK_ORIGINS=https://boasis.ae,https://brain.boasis.ae` if the Brain is served
   from another name. `RATE_LIMIT_SPARK_PER_MIN` is 40 and covers all three doors, counted apart
   from the site's own forms so that a hall of phones behind one address cannot spend the contact
   form's budget. Restart the app after changing any of them.
3. **The Brain side, three things, all small.** The pass check on `boasis-brain` is what closes
   the demo off from anyone without a pass. Then, on the pages we frame:
   - send `Content-Security-Policy: frame-ancestors https://boasis.ae` and no
     `X-Frame-Options` on the framed route, or the frame stays blank and the page's own link
     under it is how people get in;
   - read `?pass=` and keep the header and the account menu out when `?embed=1` is there;
   - after every step, `POST https://boasis.ae/api/spark-step` with `pass`, `step`, and a `data`
     object holding what the person typed, what Mira said, and how the step ended. That is the
     whole write, and it is what makes the file the record of the visit rather than of the form.
4. **Check it on a phone, on the venue wifi.** Open `boasis.ae/try-mira`, fill it in, and Mira
   should appear in the page, under the same header, with the four points gone. Then
   `node scripts/spark-leads.js --pass=…` on the server and the answer is the visit.
5. **Optional, for a busy stand:** one line in Nginx in front of boasis.ae, and the log to read
   afterwards.

   ```
   limit_req_zone $binary_remote_addr zone=spark:2m rate=12r/m;
   location = /try-mira { limit_req zone=spark burst=12 nodelay; try_files $uri =404; access_log /var/log/nginx/spark-demo.log; }
   ```
6. **Rehearse without the site at all:** `node scripts/spark-stub.js`, open
   `http://localhost:8090`. Same page at the same address, same rules module, files in a temp
   folder, plus a one-step stub Brain so the handoff can be walked through and the JSON seen on
   disk. The stub answers the three paths the Supabase functions use, at the same names, and the
   page is rewritten to them on the way out, so the rehearsal is not a different site.

## Both back ends

The same rules, in two shapes, chosen by where you want the files:

| | on boasis.ae | in Supabase |
| --- | --- | --- |
| what writes | `lib/spark.js`, mounted in `server.js` | three functions in `demo/supabase/functions` |
| where a lead sits | `data/leads/PASSxxxxxxxx.json`, one file each | one row in `public.spark_leads`, `data` holds the record |
| to switch it on | merge, done | project, one SQL paste, three function pastes, five secrets |
| to read the leads | `node scripts/spark-leads.js` on the server | Table editor for a grid, SQL for anything else, Download result for a CSV |
| what it costs | stand traffic on the site's own box, and the disk it writes | a second host the venue wifi must reach, and a project to keep an eye on |

### Supabase, all of it in the browser, no CLI

Nothing here needs a Supabase account, and none exists until you make one. Take this route if you
would rather read the leads in a browser, sort them, and download a CSV, than open a folder on the
web server. Twenty minutes, four pastes, and the only machine you touch is the one with the browser.

The store is one table, `public.spark_leads`, **one row per person**. The columns worth sorting on
(`full_name`, `email`, `phone`, `last_step`, `steps_reached`, `turns`, `price_aed`, `updated_at`)
are written out of the record itself, and `data` is the record entire: every step, what the person
typed and what Mira said back, in order. The same object the folder back end keeps, so nothing
about a person is split over two places.

1. **supabase.com** → Sign up with your own email → **New project**. Name `boasis-spark`, region
   **Frankfurt** (nearest to Dubai), set a database password and keep it. Wait until it says active.
2. **SQL Editor** (left side) → **New query** → paste the whole of `demo/supabase/spark.sql` →
   **Run**. It answers "There are no rows to show", which is right: it makes a table, not data.
   Safe to run twice, because every statement in it is `if not exists`.
3. **Project Settings → API** → copy two values into a note: the **Project URL**
   (`https://<ref>.supabase.co`) and the **service_role** key. That key reads and writes the whole
   project, so it goes into a function secret and into nothing else. The `anon` key is wanted by
   nothing in this demo.
4. **Edge Functions → New function** → name it `create-pass` → paste the whole of
   `demo/supabase/dashboard/create-pass.js` → Save, and Deploy if it asks. Then the same twice
   more: `save-step` from `demo/supabase/dashboard/save-step.js`, and `get-lead` from
   `demo/supabase/dashboard/get-lead.js`.
   Those three are generated from the folders in `demo/supabase/functions`, and a test fails if the
   two copies ever disagree, so never type into the `dashboard/` copies. After a change to a rule:
   `node scripts/make-supabase-single.js`, then paste again.
5. **Edge Functions → Secrets** → **Bulk save**, these five, once for the whole project:

   ```
   SPARK_SUPABASE_URL=https://<ref>.supabase.co
   SPARK_SERVICE_ROLE_KEY=<the service_role key from step 3>
   ALLOW_ORIGIN=https://boasis.ae,https://brain.boasis.ae
   EMAIL_SALT=<any long random string you keep, and keep it>
   BRAIN_URL=https://brain.boasis.ae
   ```

   You cannot name a secret `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY`: the screen says "Name
   must not start with the SUPABASE_ prefix", because the platform hands those two to every function
   itself. Each function looks for the `SPARK_` name first and falls back to the platform's own
   value, so both work, and the `SPARK_` pair is the one you can read and change.
   That page holds secrets for the project, with no picker for a single function, so all three
   functions can see all five. Only `create-pass` reads the salt and the Brain address, and it is
   the code, not the secret list, that decides what a door may do: `save-step` cannot mint a pass or
   open a row that does not exist, and `get-lead` cannot write at all. Keep the service key off the
   page and off the Brain, and that is the secret that actually matters.
6. **One line in the page**, then merge. Top of `js/try-mira.js`, `endpoint` is the URL the
   function page shows for `create-pass`, and `brainUrl` stays `https://brain.boasis.ae`.
   `/try-mira` is served with `connect-src 'self' <that project host>` and nothing else, taken
   from `SPARK_PROJECT_URL` in `config/env.js`, which defaults to the `boasis-spark` project. Change
   one, change both: the test that reads them is there to make that unmissable.

   **And one setting on each function:** Settings → **Verify JWT with legacy secret** → off. It
   arrives on, and with it on, the page's request is refused before our code runs, because the page
   holds no key of any kind on purpose. `save-step` and `get-lead` are the same: the pass in the body
   is the whole credential, and it is checked in the function, where a 400 for a bad pass is a
   sentence rather than a browser error.
7. **Table editor** → `spark_leads`. That is the stand, as a grid. For the cut the client will ask
   for, **SQL Editor** → Run → **Download result** as CSV:

   ```sql
   select full_name, email, phone, last_step, turns, price_aed, updated_at
   from public.spark_leads
   order by updated_at desc;
   ```

**Why a browser key cannot read that table.** Supabase grants `anon` and `authenticated` on new
tables in `public/`, so the SQL does three things about it: `enable row level security`, which with
no policy means those roles see zero rows; `revoke all ... from anon, authenticated`, so they do not
even hold the permission; and `grant select, insert, update ... to service_role`, which is the role
the three functions connect with. Two locks instead of one, because a table of names and phone
numbers is not the place to trust a default. There is deliberately no `create policy` line in the
file, and if a query typed in the dashboard comes back empty the fix is the editor or the service
key, never a policy that opens the table to the web.

The box on that screen worth ticking is **Enable automatic RLS**, and the one worth unticking is
**Automatically expose new tables**: with it off, a table is reachable by a browser key only if
someone grants it later, and this SQL grants what it needs by name. If you leave it on, nothing is
wrong either, since the revoke line and the empty policy set do the work anyway.

For two days at a stand the folder on the web server is still the honest answer: wired, tested,
and it needs nothing from anyone on the night. Supabase buys the grid, the sorting, the CSV and a
disk that is not yours, and costs a project somebody keeps an eye on and a second host the venue
wifi has to reach.

## Closing it

Four things, and it is gone: `try-mira.html`, `js/try-mira.js`, the three `/api/spark-*` lines
(the `require('./lib/spark')` call in `server.js`, and the three names in `API_ROUTES` in
`lib/protect.js`, which is what keeps the guard closed by default), and the `Disallow: /try-mira`
lines in `robots.txt`. Nothing on the site ever linked to it and no sitemap entry mentions it, so
there is nothing to unpublish and no redirect to leave behind.

Then read the folder and empty it, on the owner's schedule rather than the deploy's:

```
node scripts/spark-leads.js --csv > spark-leads.csv     # while the files are still there
rm -rf data/leads data/spark-by-email                    # and after the follow up is done
```

The QR is not part of the site, so it needs nothing here: it is a picture of an address, and when
the address is gone it stops working by itself.

`js/countries.js` and `js/yara-orb.js` are not part of the demo and stay: the home page dialogs,
`/early-access` and `/contact` all use them. Only the two files named above belong to this page.

## Open, and who owes what

- **the Brain, framed.** `brain.boasis.ae` is what `brainUrl` says now, and the page frames it.
  That needs one header on the Brain's side (`frame-ancestors https://boasis.ae`) and one look at
  `?embed=1`. Until the header is there the frame is blank, and the line under it, "Open Mira in
  a new tab", is how a person gets in. Nothing else about the demo waits on it.
- **a pass check on the Brain.** `boasis-brain` has to answer `/api/spark-lead?pass=` or refuse
  the journey. Without it the entrance is a nice form that leads to an open door.
- **how long a pass lives.** 24 hours, `MAX_AGE_HOURS = 24` in `spark-core.js`, one line to
  change. To be confirmed with the client, since it only matters if someone fills the form on
  day one and opens Mira on day two.
- **the email after the answers.** Wanted by the owner, and **not built**, because it can only be
  sent at the end of the journey in the Brain, and there is no Brain link to end yet. It belongs
  on the `package` step in `save-step`, never on the form, so the visitor's path keeps its one
  rule: nothing waits, nothing is confirmed by email.
- **the words on the page.** Placeholder from the design file. The content team replaces them in
  `try-mira.html` and nothing else changes.

## The second entrance: boasis.ae/sharjah-next, Sharjah Next, 28 and 29 October

The same demo, for a different crowd, and the client's own design for it. `/try-mira` and
`/sharjah-next` are two pages, one Brain, one set of doors, and **two tables**: `public.spark_leads`
and `public.sharjah_next_leads`. That is the whole difference on the data side, and it is there because
the two lists are counted, exported and cleaned up on different days.

**What is in it**

| file | what it is |
|---|---|
| `sharjah-next.html` | the design file itself: its palette, its type, its sections, its copy |
| `js/sharjah-next.js` | the form, the pass, the frame, the receipt, its own localStorage key |
| `demo/supabase/sharjah-next.sql` | `public.sharjah_next_leads`, same columns as the first table |
| `demo/supabase/functions/_shared/spark-supabase.js` | `TABLES` and `tableFor`, the one place a page is turned into a table |

**The page is the design file.** `sharjah-next.html` is the file the event team handed over, byte for
byte, with its sand and olive palette, its fonts, its hero photograph and its logos still inlined as
base64, its `Beyond` and `Beyond+` prices, its sector pills, its four points, its date chip, the night
variant of the form box and the copy exactly as written. Five lines were changed, and each one is a
line rather than a look:

1. the `<title>`, description, theme colour, `format-detection` and the font links were sitting in
   `<body>` after a closed `</head>`, so they were moved into `<head>`, where a browser and a crawler
   read them, and `noindex, nofollow` was added there, because the page has to stay out of Google;
2. the inline `<script>` became `<script src="/js/sharjah-next.js?v=N">` (N rises with every shipped
   edit to that file, and `sharjah-next.html` is the only place it is written), since every page on this host
   is served with `script-src 'self'` and an inline block would simply not run;
3. `data-endpoint="/api/event"` became the deployed `create-pass`, and `const SEND = false`, the switch
   the shared preview needed so a demo posted nothing, became `true`;
4. `MIRA_URL` went from the placeholder `https://boasis.ae/mira` to `https://brain.boasis.ae`, and the
   address now carries `?pass=`, because without the pass the Brain does not know whose journey it is
   and the record stops at the form;
5. the script grew the few lines that make that true: the two names joined into `full_name`, `page` and
   `source` stamped on the row, the pass kept for a day so a re-scan returns to the same visit, the
   receipt fired once with `keepalive`, and `safeBase`/`clean` so no answer from anywhere can put a
   foreign host or a stray character in the link a person taps.

Nothing else was touched, including the parts a reviewer would normally correct: the French comments
stay, `T` holds only `en` so the language hook is there and unused, and the pictures are inside the
HTML rather than in `assets/`, which is why the page weighs 570 kilobytes and needs no second request
on a stand's wifi.

The rehearsal stub knows the page keeps its door in the markup: `scripts/spark-stub.js` rewrites
`data-endpoint` in the two HTML files and `endpoint`, `brainUrl` and `MIRA_URL` in the two scripts, so
`node scripts/spark-stub.js` rehearses this entrance against its own bucket and never reaches the live
project, whichever file the address happens to live in.

**Two tables, not one list.** `public.site_leads` holds the website's own forms (early access, the two
home dialogs, contact) and `public.sharjah_next_leads` holds the stand, one row per submit, `ref`
unique. One door writes both: `save-lead` reads the `kind` it is handed and picks the table, and a
caller cannot name one. The stand's leads are exported and cleaned up on the event's calendar, the
site's on the website's, and the visit itself is written by the Brain into a third table,
`sharjah_next_passes`, from `demo/supabase/sharjah-next-passes.sql`, one row per person and one `data`
column that holds the whole conversation.

**What the stand page does today.** The form posts to `POST /api/sharjah-lead` on this host, which
checks the mailbox code, validates with the same `readForm` as everything else, writes
`data/sharjah-next/SN-XXXXXX.json`, mirrors the row into `public.sharjah_next_leads` as
`kind = 'sharjah_next'`, and, with `SPARK_SN_PASS=on`, mints the pass by calling the very same
`create-pass` that `/try-mira` posts to, with `page: 'sharjah-next'` and the reference, so the row that
Mira writes is the stand's own. It answers `{ ok, ref, pass, brain_url }` and the page frames
`https://brain.boasis.ae/?src=sharjah-next&pass=PASSxxxxxxxx&embed=1&ref=SN-XXXXXX` inside the card where
the form was, and stays put: no redirect, nothing in `localStorage`. There is no resumable journey here
on purpose: a stand is a shared tablet, so the way back to a row is the address, which `create-pass`
already looks up, rather than a pass sitting in somebody else's browser. With no pass the page still
opens Mira on the reference alone, which is why the mint is allowed to fail quietly and why the lead is
written before it is ever tried. The three event mails are not sent on that submit: it opens a queue that a
watch reads every five seconds, and `SPARK_SN_MAIL=off` closes it. And because the
page touches no database, since our server is the only thing that calls the project, its
`Content-Security-Policy` stays narrower than `/try-mira`'s: `connect-src 'self'`, no Supabase origin at
all, and `frame-src https://brain.boasis.ae` as the single widening.

**The sheet the boss reads, and why it is not the record.** `sharjah_next_passes.data` is one JSON object
by design, and a spreadsheet export of it is one cell holding a whole visit, which is the complaint this
exists to answer. So the three functions post a flattened copy of that row to a small file inside the
Google sheet, after their own write, and the sheet holds one row per person with one cell per field plus a
tab of the questions and answers. The pass and the address hash are never sent, an empty value never
overwrites a filled one, the call waits three and a half seconds and cannot fail a visitor, and the
columns live only in the sheet file, so changing what the boss reads is a line there and not a deploy.
Every one of those posts is asked first whether the row belongs to the event, so a lead from boasis.ae
never turns up in a sheet about Sharjah Next.
`docs/SHEET.md` is the setup and the table of who writes what.

**The two fields a stand has to get right.** An address and a number are the whole value of a lead, so
both pages check them by the site's own rule and nowhere else: `EMAIL_RE`, `PHONE_MIN = 7`,
`PHONE_MAX = 15` live in `demo/supabase/functions/_shared/spark-core.js`, which `/api/sharjah-lead`
imports, and `js/sharjah-next.js` repeats the same two expressions the way `js/contact.js` does, so what
a visitor is allowed to send is exactly what the door keeps. The number box holds digits only and the dial
code has its own control, and a refusal comes back as a field code (`email`, `phone`) that the page prints
under that field rather than under the button. The control for the code is the site's own
`js/countries.js`: the fifty-nine country list, the search box, and a hidden `country_code` input, the same
file the two home dialogs, `/early-access`, `/contact` and `/try-mira` use, so the list of countries is
never a second truth. The design's eighteen-option `<select>` went out with it, and its flags with it:
the closed control says `AE +971`, the way the rest of the site says it. That file also carries
`LENGTHS`, the length of a MOBILE number in each country, mobile only because a stand is collecting
numbers somebody can WhatsApp rather than their office. So the page calls a number invalid until it
reaches the length of the country in the picker (nine digits for +971, ten for +91, and eight under
+971 is a landline, which is refused) and rejudges the moment the country changes; the door deliberately keeps the loose seven to fifteen, so a
wrong entry in that table costs a hint, never a lead. The fifty-nine pairs come from Google's
libphonenumber metadata, the mobile type alone, floored at the door's seven, and
`/sharjah-next.test.js` reads the same table shape back so it cannot be quietly edited into a wall.

**The mailbox check, borrowed whole.** After the last event a number of rows carried an address nobody
could open, which turns a lead into nothing, so the stand asks for a six digit code before it accepts a
lead. It is the same mechanism `/early-access` already runs, and no second version of it was written:
`POST /api/verify-email/send` and `POST /api/verify-email/verify` in `server.js`, `lib/email-verify.js`
holding the code as a hash in memory (one a minute per address, three a ten minute window, six an hour,
three wrong tries kill a code), and the signed five minute token that `js/early-access.js` puts in a
hidden `emailv` field. `sharjah-next.html` draws the row under the email in the card's own tokens (`.vbtn`,
`.vstat`, `.vcode`), and `js/sharjah-next.js` drives it: verify, six digits, a proof. The digits never reach
this host's storage, and the token is not in the JSON row, not in the Supabase mirror (`lib/leads.js`
drops it) and not in the browser after the page is left.
Once a code is read and checked the button disappears and the line beside the field is left saying
`Verified · their address`: nothing is missing at that moment, so nothing should be offered. It comes
back on its own in the two cases where it is needed, the address being edited (the proof was about the
other one) and a submit that arrives more than five minutes later with a stale proof, which is what the
`emailv` refusal above is for.

Two decisions are worth keeping in mind. The page does not decide who may submit, the door does, and the
page reacts: a lead with no proof comes back `error: 'emailv'`, the box under the email opens, and nothing
was written. That is what makes `VERIFY_REQUIRE_FOR_MANAGE` the one switch for the whole site: set it to
`0` in hPanel and restart and both forms stop asking, with no redeploy, which is the line to use on a
morning the mail is stuck rather than closing the stand. The other is that the code mail (`verifyCode` in
`lib/mail-templates.js`) names no product on purpose, because one template answers both entrances. Note
what this means on the box: `MAIL_DRY_RUN` has to be `0` in `.env` or nobody ever receives a code, and a
dry run hands the code back to the page instead, which is why a rehearsal can still be walked through.

**The three mails, and when they go.** The event team drew them (`spark-email.html`): a congrats with
the reference number, a paid receipt with Mira's photo and the two Instagram accounts, and a payment counter
nudge for an unpaid hour and a half. They are `sharjahCongrats`, `sharjahPaid` and `sharjahReminder` in
`lib/mail-templates.js`, in their palette and their box, signed The BOASIS Team with our own wordmark under
the line, and with both event marks at `https://boasis.ae/assets/brand/` because a mail client fetches nothing
relative: the Sharjah Next mark at the left of the band and the blue SPARK park mark at its right, in the corner
the printed date used to have. There is no button in these three, on purpose: the action is a walk to a counter
with a reference in hand, and a pill into the site only invites a second form from a person already at the desk. The trigger is the thing
the mail is about, not the submit, and the rules live in `lib/sharjah-watch.js`: the congrats goes once
`sharjah_next_applications` has a row for that reference with `submitted_at` written, or `status` at
`submitted` or `paid`, which is the table the Brain team made for exactly this and which nothing before the
final submit touches, because the letter says the application is in and a saved step does not;
the welcome letter goes when the sheet says `yes` in `Payment Completed`, which is
read from the sheet through the same hook that writes into it (`action: 'status'`, two columns, the same
secret, nothing written); and the nudge goes ninety minutes after the form, and only when the sheet actually
answered and did not say yes. The stand's submit opens one small file per reference in
`$DATA_DIR/sharjah-next/sn-state-*.json`, which is the whole queue, so a lead that was never recorded here
is never mailed. A timer inside the app walks it every five seconds, one pass at a time and only as far as
the queue reaches, unref'd so it cannot hold a shutdown, and `node scripts/sharjah-watch.js` walks it once by
hand. Nothing is marked as sent when a read fails, so
an outage delays a mail rather than losing it. Each letter also takes a *claim file* beside the queue before
it goes, so a second pass, a restart, or a box running two copies of the app cannot send a copy of the same
mail: the claim is on the disk rather than in a process's memory, and a letter that never reached the postbag
hands its claim back so the next pass tries again. `SPARK_SN_MAIL=submit` and `=each` are the read through, where all three
go at the submit for somebody sitting at a desk, and `SPARK_SN_MAIL=off` closes the mails and the timer
together. No second door sends them: the receipt call used to as well, and two doors were six mails for one
visitor. When the real schedule is settled, the
the subjects do not change. A Sharjah Next row is never sent the AI Everything note, because that one
thanks a different event. `docs/mail/sharjah-1-congrats.html` and its two siblings are the three,
rendered, to open in a browser before anyone's inbox is used.

**How a row finds its table.** Only the entrance knows. `js/sharjah-next.js` sends
`page: 'sharjah-next'` to `create-pass`, `tableFor` turns that into `sharjah_next_leads`, and the row
is written there. After that nobody has to remember: `save-step` and `get-lead` take the pass alone
and look for it in each table in turn with `readLeadAny`, then write back to the one it came from. So
the Brain is told nothing new, `page` is not its business, and a caller cannot name a table, because
the only names that resolve are those two keys. `passTaken` checks every table before a pass is
handed out, so the same eight letters can never be the key to two people's rows.

**What the page asks, and what is stored.** First name and last name instead of one name field, and
no question about where the person lives, because that is what the design asked for. The script joins
the two names into `full_name` before it posts, so `readForm`, `buildLead`, `rowOf` and every column
of both tables are exactly as they were. `source` carries the offer, `sharjah-next-2026`, and it is
the field to group on if the two tables are ever read together.

**The visit does not cross over.** Each page keeps its pass in its own key, `boasis.spark.v1` and
`boasis.sharjah-next.v1`, because a phone that did the demo at one stand and walks into the other is
two visits with two rows, and neither should be handed to the other by a shared key.

**To deploy it, once.** Run `demo/supabase/sharjah-next.sql` in the SQL editor, then re-paste all
three functions from `demo/supabase/dashboard/` (`create-pass`, `save-step`, `get-lead`), because the
table map lives in the file they all import, and a pasted file has no folder beside it. No new
secret, no new project, no change on the Brain, no change on Hostinger beyond the normal push.

**Two days, then closed.** Delete `sharjah-next.html`, `js/sharjah-next.js` and the `Disallow:
/sharjah-next` lines in `robots.txt`, and the address 404s like it never was. The table stays for the
numbers, and `select ... from public.sharjah_next_leads` in the editor is the export.

**The QR for it.** Same script, same rules, one flag:

```
node scripts/make-qr.js --url=https://boasis.ae/sharjah-next
```

Error correction H, a hole cut on whole modules for the orb, four modules of quiet zone, and the
picture read back with a decoder before it is trusted, which is the only reason this is a script and
not a picture from a generator.

**What is still true of both entrances.** One record per person, updated after every step, a finished
row not rewritten by a second run, the receipt mailed from the address in the row rather than from
whatever the browser claims, and no email check on the form. Nothing here is a second version of any
of that.
