# SPARK, the Brain side. A brief you can paste straight into an assistant.

Who this is for: whoever owns the app behind `brain.boasis.ae` and the repo that builds it.
How to use it: paste everything below the line into your coding assistant and let it work, or read
it yourself and do it by hand. Everything here is true as of commit `7b5bc9d` in this repo. The
full build behind it is in `docs/SPARK.md`.

---

## The brief

You are adding one feature to the app at `brain.boasis.ae`. It is small. Read the whole brief first,
because the "do not touch" part is the reason this feature is safe to ship the week of an event.

### What the feature is

Boasis is at AI Everything with a one licence SPARK offer. A QR code at the stand opens
`https://boasis.ae/try-mira`. That page is ours and it is finished. It collects a name, an email,
a phone with a country code, and where the company sits, with a consent box, no email verification,
and nothing indexed by Google.

Submitting that form calls a Supabase Edge Function, which mints a pass for that person, in the
shape `PASS` plus eight characters, and starts one row for them. Then the page frames this app
inside itself, at:

```
https://brain.boasis.ae/?pass=PASSxxxxxxxx&embed=1
```

Your job is to make the journey work well inside that frame, and to write what happened back into
the same row after every step, so the stand has one record per person with the contact details and
the whole conversation in it.

### What is already built. Do not rebuild any of it

- The entrance page, its form, its design, its pass minting, its rate limits.
- The store: a Supabase project called `boasis-spark`, one table `public.spark_leads`, one row per
  person, keyed by the pass. Row level security is on with no policies, and only the service role of
  that project may touch it.
- Three Edge Functions on that project, `create-pass`, `save-step`, `get-lead`. The last two are
  yours to talk to.
- The pass lifetime is 24 hours from minting. `MAX_AGE_HOURS` in
  `demo/supabase/functions/_shared/spark-core.js` is the only place it lives.

Nothing you build needs a table, a column, a migration, an account, or a queue. Do not create a
store for leads on your side. The row is not yours.

### Two files come with this brief

`docs/brain/spark-embed.js` is the whole browser side, written already, no dependency and no key,
and `docs/brain/HOW-TO-ADD.md` says where to put it, the four edits, and the seven checks to prove
it works. Read the brief first, then take the file, and do not rebuild what is in it.

### What you must add. Three jobs

**1. Read two query parameters, once, on load.**

- `pass`. Validate it against `/^PASS[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/`. Anything else,
  ignore it and behave exactly as a normal visitor today. Do not accept a pass from a form field, a
  cookie, or local storage that you did not write in this session. Keep the validated one in
  `sessionStorage` so a reload inside the frame still knows who it is talking about.
- `embed`. When it is `1`, hide your own header, nav, footer and any "back to app" chrome, because
  you are inside someone else's page. Change nothing else about the layout, and keep the journey
  itself pixel for pixel as it is today.

**2. Let our page frame you.** On the route that is framed, send:

```
Content-Security-Policy: frame-ancestors https://boasis.ae
```

and make sure no `X-Frame-Options` header is sent on that route. A `DENY` or `SAMEORIGIN` there
blocks the frame before CSP is even read. If your platform sets `X-Frame-Options` globally, leave it
everywhere it is and exclude the framed route, or override it there. Do not widen `frame-ancestors`
to `'self' https://*.boasis.ae` or anything with a wildcard: one host, exact.

**3. Write after each step, and read once at the start.**

After the person finishes a step, and the app has the answer on screen:

```js
const base = process.env.SPARK_SUPABASE_URL;            // https://grsbhupjihwvidxbkymu.supabase.co
await fetch(base + '/functions/v1/save-step', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ pass, step, data }),
});
```

On load, when there is a pass, read the row so a reload or a second device resumes where they
stopped rather than at step one:

```js
const { ok, lead } = await (await fetch(base + '/functions/v1/get-lead?pass=' + encodeURIComponent(pass))).json();
// lead.brain.steps_reached is an array of the step names already saved
// lead.contact is { full_name, email, phone, country_code, residence, consent }
```

No `Authorization` header. No API key, not the anon one, not the service one, in a browser bundle,
in a client component, in local storage, or in a repo. The two URLs above need nothing else.

### The contract, exactly

Four steps, in this order. `step` is one of these strings, `data` is an object.

| `step` | `data` you send |
|---|---|
| `describe` | `{ description }`, up to 4000 characters |
| `mira` | `{ question, answer }` for the turn, up to 2000 and 4000 characters. Optionally `{ log: [{ at, in, out }] }` to keep the raw exchange, last 20 entries per post, last 60 kept in total. Optionally `{ output }`, a string, what the step showed the person |
| `activities` | `{ shown: [], picked: [], confirmed: true }`, 80 characters each, 40 entries |
| `package` | `{ shareholders: [], visas: [], premises, price_aed, confirmed }`, 120 characters each, 20 entries, 200 characters of premises |

Replies, all JSON:

- `200 { ok: true, version, steps_reached }`. That is your confirmation the row moved.
- `400 { ok: false, error: "pass" }` a malformed pass, nothing was written.
- `404 { ok: false, error: "unknown" }` no such row, and `expired` if it is older than 24 hours.
- `400 { ok: false, error: "step" }` a step name that is not one of the four.
- `429 { ok: false, error: "limited" }` more than 60 writes a minute for that pass.
- `500 { ok: false, error: "storage" }` our problem, retry once after a minute or not at all.

Writes are additive and last write wins per step. Never delete or blank a step. If a person redoes
a step, post it again and it overwrites that part only.

About the token, since it will be asked: the pass is the whole token. You send it, the row is found
by it, and the reply does not carry it back, because there is only one row and you already named it.
Two people submitting the form at the same second get different passes and different rows, so there
is no mixup to protect against. Do not invent a second id, do not mint a session, do not tie the
pass to a cookie.

### Config, in your env, not in your code

Two lines is the whole integration. Add them to whatever env file or secret store your app already
uses, and read them where you build the URLs:

```
SPARK_SUPABASE_URL=https://grsbhupjihwvidxbkymu.supabase.co
SPARK_SOURCE=ai-everything-2026
```

That is the only value from us you need. There is no key to ask for.

If you have your own Supabase project for your own app, keep it completely out of this. Do not add
our table to it, do not add a secret named like ours to it, do not run our SQL anywhere but in
`boasis-spark`, and do not create a Supabase client for this feature at all. Two `fetch` calls to
two URLs is the senior solution here, because it adds no dependency, no credential, and no way for
the two projects to collide.

### Do not touch

- Your existing auth, sessions, billing, plans, users, and any table of yours. This feature must
  change no schema and add no migration.
- Your existing routes and their headers. The only header you add is the `frame-ancestors` one on
  the framed route.
- Anything on the entrance page at `boasis.ae/try-mira`. It is finished and tested. If you think it
  needs a change, ask, do not edit it.
- Your rate limits and WAF rules for the framed route: make sure a POST from the browser to
  `*.supabase.co` is not proxied through your backend on the way out. Call it direct.

### Security notes, including one thing not to rely on

- `save-step` and `get-lead` do not check a signature. They set CORS for `https://boasis.ae` and
  `https://brain.boasis.ae`, which stops another website's JavaScript reading an answer, but it does
  not stop a command line script calling them. Do not treat the origin allow list as an
  authorisation check. The real gate is the pass, so a person's row can only be written or read by
  whoever holds their pass.
- Because of that, treat the pass as a secret you must not leak. Do not log it. That means no request
  log, no APM attribute, no Sentry breadcrumb, no analytics event, no error message that includes the
  full URL with `?pass=` in it. If you have a generic error reporter, scrub `pass` from it for this
  route. Do not put it in a link you email, show on screen, or share.
- Write nothing sensitive into the row beyond the four step payloads. No password, no ID number, no
  trade licence file, no card detail. It is a stand record, not a case file.
- Escape everything you render out of `lead`. A person typed it, so treat `description` and the
  answers as untrusted text. No `dangerouslySetInnerHTML`, no `v-html`, no `innerHTML` with it.
- Your page must be allowed to reach the store: if your app sets a CSP, add
  `https://grsbhupjihwvidxbkymu.supabase.co` to `connect-src` on the framed route. If you do not set
  a CSP today, add only these two directives there, `connect-src` and `frame-ancestors`, and nothing
  else.
- A failed write must not break the journey. Catch, and continue. The person in front of a QR code
  does not care that our table was briefly unhappy. If you want, show them nothing; if the whole
  step cannot be saved, that is our problem to notice, not theirs to see.

### Acceptance. Test all seven before you say done

1. `https://brain.boasis.ae/?pass=PASSABCDEFGH&embed=1` in the address bar: your chrome is gone, the
   journey runs, nothing errors in the console.
2. Same URL with `?pass=123` or no pass at all: the app behaves exactly as it does today, and sends
   no request to `supabase.co`.
3. From the entrance page, after submitting the form, the frame shows the Brain, and the console has
   no `X-Frame-Options` or `frame-ancestors` complaint.
4. After the first step, the console shows one `POST .../functions/v1/save-step` answering
   `200 {"ok":true,"version":2,"steps_reached":["describe"]}`.
5. Supabase dashboard for `boasis-spark`, Table editor, `spark_leads`: that pass now has
   `last_step` set, and `data.brain.description` holds what the person typed.
6. Reload inside the frame: it comes back at the step they reached, from `get-lead`.
7. `git diff` on your side: no migration, no schema change, no new dependency, no key added, and the
   only header change is on the framed route.

### What to send back to us

The branch name, the list of files, the header you added and on which route, the two URLs as you
configured them, and one paragraph for anything you could not do exactly as written and what you did
instead. Do not open a pull request that touches a database.

### Ask us rather than guess

- Should the person see their own description again when they resume? It is in the row already.
- Should the pass die at the end of the event day instead of after 24 hours? That is one number for
  us to change on our side, not yours.
- Should the stand be able to open the row for a person by looking them up some other way? There is
  no such door today on purpose.
