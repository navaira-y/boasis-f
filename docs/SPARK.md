# SPARK demo · form to Brain

Task 1 of the plan (`SPARK Demo Form to Brain Plan.pdf`, 5 October 2026): the offer page and
its form, placeholder text, hidden from Google, handing a pass to the Brain.

The plan is the authority on what is built and what is not. This file is the part the plan
leaves open: the exact bytes on the wire, the shape of the one JSON file per person, and the
clicks a developer has to make tonight.

## What is in the repo

```
demo/spark/index.html                 the offer page, as designed, assets by relative path
demo/spark/spark.css                  its styles, the site's own tokens
demo/spark/spark.js                   the form: validation, the pass, the handoff
demo/spark/yara-orb.js               a byte copy of js/yara-orb.js (test-pinned, do not edit here)
demo/spark/robots.txt                 Disallow: / for the entrance host
demo/supabase/functions/create-pass   the function the form posts to
demo/supabase/functions/save-step     the function the Brain UI posts to after every step
demo/supabase/functions/_shared/spark-core.js
                                      every rule, pure and testable in Node
scripts/spark-stub.js                 the same rules on a laptop, no Supabase needed
```

Nothing here is served by boasis.ae. `server.js` refuses `/demo` outright, because merging to
main deploys this repo and an offer page found by accident is the one thing the plan forbids.

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
   `BUCKET=leads`, `ALLOW_ORIGIN=https://spark.boasis.ae`. On `create-pass` also
   `BRAIN_URL`, the Brain address with the demo route, e.g. `https://brain.boasis.ae/demo`.
   The service key lives only in the functions. It is never in the page, and the page never
   needs the anon key either: the browser talks to a function, the function holds the write.
3. **The page config.** In `demo/spark/index.html`, the `window.SPARK` block:
   `endpoint` = the `create-pass` URL, `brainUrl` = the same `BRAIN_URL` you set above. Empty
   means not connected, and the page then says so out loud rather than pretending.
4. **The bundle.** The page carries its assets by relative path, so fill them before the copy:

   ```
   mkdir -p demo/spark/assets/orb demo/spark/assets/logo
   cp assets/orb/orb.mp4 demo/spark/assets/orb/
   cp assets/logo/orb-160.png assets/logo/orb-512.png demo/spark/assets/logo/
   ```

5. **The VPS.** Put `demo/spark` at the root of the demo entrance (`spark.boasis.ae`, or a path
   on brain.boasis.ae, whichever is confirmed), and in Nginx:

   ```
   limit_req_zone $binary_remote_addr zone=spark:2m rate=6r/m;
   server {
     add_header X-Robots-Tag "noindex, nofollow" always;    # the page says it too
     location / { try_files $uri $uri/ =404; }
     location = /functions/v1/create-pass { limit_req zone=spark burst=6 nodelay; proxy_pass …; }
     access_log /var/log/nginx/spark-demo.log;
   }
   ```
6. **DNS and SSL** for the entrance, then test on a phone on the venue wifi: submit, and the
   Brain opens with `?pass=` in the address bar.
7. **Rehearse without any of it:** `node scripts/spark-stub.js`, open
   `http://localhost:8090`. Same page, same rules, files in a temp folder, plus a one-step stub
   Brain so the handoff can be walked through and the JSON seen on disk.

## Closing it

The plan's last line, kept true: remove the server block on the VPS and the entrance is gone.
No entry in boasis.ae's sitemap, llms.txt or robots.txt points at it, and nothing on the site
links to it, so there is nothing to unpublish. The lead files stay in the bucket for the owner
to keep or delete.

## Open, from the plan's last page

- the name of the entrance, `spark.boasis.ae` or a path on brain.boasis.ae. The page works with
  either; `ALLOW_ORIGIN` and `BRAIN_URL` are the only places the answer is written down.
- the Supabase project, and the bucket name. Built for a new project and `leads`.
- pass length 24 hours, built as `MAX_AGE_HOURS = 24` in `spark-core.js`. One line if the event
  runs longer than that.
- the optional thank you email: **not built**, because the plan keeps the visitor's path free of
  email. If it is wanted, it belongs on the `package` step in `save-step`, never on the form.
- the offer page text and the email text: placeholder from the design file, the content team
  replaces the words in `index.html` and nothing else changes.
