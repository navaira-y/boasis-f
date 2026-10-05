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

The same shape also goes into a private Supabase bucket, if that is preferred: the two functions
in `demo/supabase/functions` write `leads/PASSR4RK96R4.json` and nothing else. It is the same
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

A bucket rather than a table is the plan's call and it is the right one for two days: the
Brain keeps its sessions in memory and gains no database, so a JSON object per person is the
smallest thing both sides can agree on. Two consequences to accept, both written into the code:

- nothing queries across leads. `steps_reached` inside each file is what you read afterwards.
- a step is a read, a merge and a write. The merge is additive and never deletes, so the worst
  a collision can do is lose one step of one person, not the file.

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

The answer carries no bucket path and accepts none. The caller cannot name a file.

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

There is nothing to sign up to. The back end is in this repo, in the folder the site already uses
for its leads.

1. **Merge, and the page is live.** `js/try-mira.js` already points the form at `/api/spark-pass`
   and the frame at `https://brain.boasis.ae`, so there is no key to paste and no address to
   type. The folder `data/leads` is made by the app on the first submit.
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
   disk. The stub answers the two paths the Supabase pair uses, and the page is rewritten to them
   on the way out, so the rehearsal is not a different site.

## Both back ends

The same rules, in two shapes, chosen by where you want the files:

| | on boasis.ae | in Supabase |
| --- | --- | --- |
| what | `lib/spark.js`, mounted in `server.js` | the two functions in `demo/supabase/functions` |
| where a lead sits | `data/leads/PASSxxxxxxxx.json` | `leads/PASSxxxxxxxx.json` in a private bucket |
| to switch it on | merge, done | project, bucket, two functions, six secrets |
| to read the leads | `node scripts/spark-leads.js` on the server | the console, or `supabase storage ls` |
| what it costs | stand traffic on the site's own box, and the disk it writes | a second host the venue wifi has to reach |

To use the bucket instead of the folder, deploy the functions, set their secrets
(`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `EMAIL_SALT`, `BUCKET=leads`,
`ALLOW_ORIGIN=https://boasis.ae`, and `BRAIN_URL` on `create-pass`), then point `endpoint` in
`js/try-mira.js` at the `create-pass` URL and add the project host to the page's `connect-src` in
`server.js`. The service key stays in the functions and never reaches the page, and the anon key
is not needed. Nothing else changes: the files come out identical, because the module that
decides what goes in them is shared.

For two days at a stand, the folder is the honest answer. It is what this repo is set up for
tonight.

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
