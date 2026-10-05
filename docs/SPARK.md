# SPARK demo · form to Brain

Task 1 of the plan (`SPARK Demo Form to Brain Plan.pdf`, 5 October 2026): the offer page and
its form, placeholder text, hidden from Google, handing a pass to the Brain.

The plan is the authority on what is built and what is not. This file is the part the plan
leaves open: the exact bytes on the wire, the shape of the one JSON file per person, and the
clicks a developer has to make tonight.

## What is in the repo

```
try-mira.html                         the page, at boasis.ae/try-mira
css/try-mira.css                        its styles, the site's own tokens
js/try-mira.js                          the form: validation, the pass, the handoff, and the two
                                        addresses a developer pastes in at the top
demo/supabase/functions/create-pass     the function the form posts to
demo/supabase/functions/save-step     the function the Brain UI posts to after every step
demo/supabase/functions/_shared/spark-core.js
                                      every rule, pure and testable in Node
scripts/spark-stub.js                 the same rules on a laptop, no Supabase needed
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

## The page itself: the header, and the pinned section

`try-mira.html` carries the header every page on boasis.ae carries, with the logo and nothing
else. No menu, no button: there is nowhere else on this page to go. Its rules are copied from
`css/site.css` into `css/try-mira.css` so the page stays one file, and if the site header ever
changes, that copied block is the thing to refresh.

"How it works" is one pinned section. The section is `460vh` tall (`.how`, in the css), its
inside sticks, and that distance is cut into as many parts as there are points. A blue light
travels the drawn road and a point comes up when the light reaches its part; points already
passed stay on screen, dimmer, so the last screen holds all four. Two things about it are
deliberate, and each has a test:

- with no script, or with `prefers-reduced-motion`, the section is not pinned at all and the four
  points are simply listed. Nothing on this page is only reachable by watching an animation.
- the four sentences live in `try-mira.html`, beside the road. The content team edits them there.
  A fifth point is one more `<li>`: the scroll distance and the road are divided by the count the
  script reads, not by a number written next to them.

## The one file per person

A private bucket, one object per lead, named by the pass, and updated by every step:

```
leads/PASSR4RK96R4.json
by-email/<sha256 of salt + address>.json      → { "pass": "PASSR4RK96R4" }
```

The second prefix exists so that a person who reloads, or scans the QR twice, is handed the
same pass and the same file rather than a second stranger. The address itself never appears in
an object name.

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
    "package": { "shareholders": ["…"], "visas": ["…"], "premises": "…", "price_aed": 15000, "confirmed": false }
  }
}
```

Not stored, because the plan keeps the application part out of this demo: no passport, no
Emirates ID, no KYC video. The page has no field for them and the merge has no step that
would accept them.

A bucket rather than a table is the plan's call and it is the right one for two days: the
Brain keeps its sessions in memory and gains no database, so a JSON object per person is the
smallest thing both sides can agree on. Two consequences to accept, both written into the code:

- nothing queries across leads. `steps_reached` inside each file is what you read afterwards.
- a step is a read, a merge and a write. The merge is additive and never deletes, so the worst
  a collision can do is lose one step of one person, not the file.

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
{ "pass":"PASSR4RK96R4", "step":"mira", "data":{ "question":"…", "answer":"…" } }

200 { "ok":true, "version":4, "steps_reached":["describe","mira"] }
400 { "ok":false, "error":"pass" | "step" | "json" }     404 { "ok":false, "error":"unknown" | "expired" }
```

`step` is one of `describe`, `mira`, `activities`, `package`. Anything else is refused. The
pass is the whole credential: no account, no token, and the pass shape is checked
`PASS` + eight characters from an alphabet with no `I`, `O`, `0` or `1`, no slash and no dot,
**before** a single character of it is used as an object name.

## Tonight, in order

1. **Supabase.** New project, region Frankfurt. Storage, new bucket `leads`, **private**, public
   URLs off, file size limit 1 MB.
2. **Functions.** Deploy `demo/supabase/functions` with the CLI. Secrets on both functions:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `EMAIL_SALT` (any long random string),
   `BUCKET=leads`, `ALLOW_ORIGIN=https://boasis.ae`. On `create-pass` also `BRAIN_URL`, the Brain
   address with the demo route, e.g. `https://brain.boasis.ae/demo`.
   The service key lives only in the functions. It is never in the page, and the page never
   needs the anon key either: the browser talks to a function, the function holds the write.
   `ALLOW_ORIGIN` has to name the site, because the page and the function are different origins.
3. **The page config.** At the top of `js/try-mira.js`:
   `endpoint` = the `create-pass` URL, `brainUrl` = the same `BRAIN_URL` you set above. Empty
   means not connected, and the page then says so out loud rather than pretending. This is an
   external file and not an inline block, because the site's content policy forbids inline script
   on every page; `server.js` gives `/try-mira` its own copy of that policy with `connect-src`
   widened to `https://*.supabase.co` and nothing else. Pin it to one project by replacing the
   wildcard with `https://<project-ref>.supabase.co`.
4. **Merge, and the page is live.** There is no DNS to wait for and no certificate to issue, which
   is what the shared domain buys. Check it once on a phone on the venue wifi: open
   `boasis.ae/try-mira`, submit, and the Brain opens with `?pass=` in the address bar.
5. **Optional, for a busy stand:** one line in Nginx in front of boasis.ae, and the log to read
   afterwards.

   ```
   limit_req_zone $binary_remote_addr zone=spark:2m rate=12r/m;
   location = /try-mira { limit_req zone=spark burst=12 nodelay; try_files $uri =404; access_log /var/log/nginx/spark-demo.log; }
   ```
6. **Rehearse without any of it:** `node scripts/spark-stub.js`, open
   `http://localhost:8090`. Same page at the same address, same rules, files in a temp folder,
   plus a one-step stub Brain so the handoff can be walked through and the JSON seen on disk.

## Closing it

Four files, and it is gone: `try-mira.html`, `css/try-mira.css`, `js/try-mira.js`, and the
`Disallow: /try-mira` lines in `robots.txt`. Nothing on the site ever linked to it and no sitemap
entry mentions it, so there is nothing to unpublish and no redirect to leave behind. The Supabase
functions are on their own host, so deleting the page is enough to stop new passes; the bucket
stays for the owner to read, keep or empty.

## Open, and who owes what

- **the Brain address.** The client has not given the Mira link yet, so `brainUrl` is empty and
  the function has no `BRAIN_URL`. Until one of them is filled in, a visitor gets their pass,
  the page tells them plainly that Mira is not open yet, and nothing is lost: the lead file
  exists and the pass works the moment the address appears. This is the one thing that must be
  set before the doors open.
- **the Supabase project, and the bucket name.** Built for a new project and `leads`.
- **how long a pass lives.** 24 hours, `MAX_AGE_HOURS = 24` in `spark-core.js`, one line to
  change. To be confirmed with the client, since it only matters if someone fills the form on
  day one and opens Mira on day two.
- **the email after the answers.** Wanted by the owner, and **not built**, because it can only be
  sent at the end of the journey in the Brain, and there is no Brain link to end yet. It belongs
  on the `package` step in `save-step`, never on the form, so the visitor's path keeps its one
  rule: nothing waits, nothing is confirmed by email.
- **the words on the page.** Placeholder from the design file. The content team replaces them in
  `try-mira.html` and nothing else changes.
