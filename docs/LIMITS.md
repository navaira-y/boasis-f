# The limits, and the hole that was in them

## The hole

`server.js` asked Express to trust every proxy (`trust proxy: true`). That setting believes the
whole `X-Forwarded-For` header, and returns the leftmost entry — which is the one the caller
wrote. So the per-visitor rate limit was free to skip:

```
same address, 12 posts                      →  8 allowed, 4 blocked   (correct)
inventing a new address on each of 12 posts → 12 allowed, 0 blocked   (the hole)
```

It was used for more than the forms: forty forged identities made the server rewrite
`visitors.json` forty times.

## The fix

Express is now told how many proxies sit in front of it, so only the entries a real proxy
appended are read:

```js
app.set('trust proxy', config.trustProxy);   // TRUST_PROXY, default 1
```

After the fix, the same attack:

```
inventing a new address on each of 12 posts →  8 allowed, 4 blocked
twelve genuinely different visitors         → 12 allowed, 0 blocked
```

## Checking it after a deploy

One command, from your own machine:

```bash
curl -s https://boasis.ae/api/health
```

It answers with `yourIp`: the address the server resolved *for that request*. Compare it with
your address from any "what is my IP" page.

- **They match** → the hop count is right. Leave it alone.
- **It shows a Hostinger address instead** → one hop too few. Set `TRUST_PROXY=2`.
- **It shows an address you invented** while testing with `curl -H 'X-Forwarded-For: 1.2.3.4'`
  → one hop too many. Set `TRUST_PROXY=1`.

Either change is one environment variable and a restart, no deploy. A wrong count is not a
security hole in the wrong direction — too *low* only makes the per-visitor limit coarser
(everyone sharing one bucket), and the site-wide caps below still hold.

## Every limit, and what it is for

| Limit | Default | Counts | What it stops |
|---|---|---|---|
| `RATE_LIMIT_FORMS_PER_MIN` | 8 | one visitor | one person or script hammering the forms |
| `RATE_LIMIT_VISITS_PER_MIN` | 60 | one visitor | a loop on the first-visit check |
| `GLOBAL_FORMS_PER_MIN` | 60 | the whole site | a flood from many addresses at once |
| `GLOBAL_FORMS_PER_DAY` | 2000 | the whole site | a slow flood over a day |
| `GLOBAL_CAPTCHA_PER_MIN` | 600 | the whole site | a loop asking for puzzles |
| `GLOBAL_VISITS_PER_MIN` | 900 | the whole site | a loop on first-visit |
| `NEW_VISITORS_PER_MIN` | 200 | the whole site | forged identities churning the disk |
| `MAIL_MAX_PER_HOUR` | 60 | emails attempted | the site becoming a mail cannon |
| `MAIL_MAX_PER_DAY` | 400 | emails attempted | eating the relay's 10,000-a-day allowance |
| `CAPTCHA_DIFFICULTY` | 20000 | one submission | cheap automated posting |
| `SPAM_MIN_FILL_MS` | 3000 | one submission | bots that post the instant they parse the page |
| body size | 20 kb | one request | oversized payloads |
| `CAPTCHA_DISABLED` | off | the whole site | this is the way out if the captcha breaks |

The per-visitor limits and the site-wide limits are deliberately separate. The first is precise
and cheap; the second cannot be fooled by any header, which is why it exists at all.

## The traps: what is refused, and what is only marked

| Signal | What it means | What happens |
|---|---|---|
| a filled honeypot (`hp`, `company_website`) | a robot filled a field no person can see | **discarded**, silent fake success, nothing stored |
| a form-encoded post | not something our own page can produce | **discarded** |
| a blocked mailbox (`SPAM_BLOCK_FREE_MAIL=1`) | the owner's explicit policy | **discarded** |
| missing the captcha answer | no browser ran our code | **refused** with `{"errors":["captcha"]}` |
| filled in under 3 seconds | autofill, a pasted message, a fast typist | **kept**, marked `too-fast`, owner told |
| the page was open over 30 minutes | a tab left open over lunch | **kept**, marked `stale-form`, owner told |
| no timing stamp at all | usually a script, occasionally a half-loaded page | **kept**, marked, and still must solve the captcha |

The rule behind the split: **a robot by its own hand is discarded; a guess about a person is
only ever marked.** Losing a real enquiry is far worse than reading one that says it arrived
quickly. A marked lead appears in the owner's email with a plain-language `Check:` line.

## What happens when a cap trips

- **Forms**: `429` with a `Retry-After`, and one log line naming which cap and at what number.
  The visitor sees "too many" rather than a form that appears to work and does not.
- **Email**: the submission still succeeds and the lead is still written to disk. Only the
  sending stops, and the log says so. This is the one that protects the owner's inbox.
- **New-visitor records**: a visitor we have not seen is answered normally but not remembered,
  so `first` may be true twice. Cheap, invisible, and it cannot be used to fill the disk.
- **Trapped submissions**: unchanged, silent to the sender, one bounded log line to us.

## Sizing: when a quiet site or a busy one meets these numbers

Two emails go out per submission, so the mail budget is the tighter of the pair.

| Submissions a day | Emails a day | Verdict |
|---|---|---|
| up to 200 | up to 400 | the defaults carry it with no change |
| 200 – 1,000 | 400 – 2,000 | raise `MAIL_MAX_PER_DAY` (the relay allows 10,000) and `GLOBAL_FORMS_PER_DAY` |
| 1,000 + | 2,000 + | raise both, and move the lists out of JSON files into a database |

Visitors *browsing* never touch any of this. The caps count submissions, and nothing else: a
site with 10,000 visitors a day and 20 enquiries is nowhere near them.

## What this does not cover, honestly

- **One process.** Every counter lives in memory. If Hostinger ever runs more than one
  instance of the app, or restarts it, each instance counts alone. Fixing that needs a shared
  store (Redis or a table), which is not worth its own failure mode at this size.
- **A distributed flood** can still reach the site-wide caps and make them trip for everyone
  briefly. The caps bound the damage; they do not prevent the traffic.
- **`data/*.json` is a file.** A submission reads and rewrites the whole list: 15 ms at 10,000
  leads, of which 6 ms is parsing. Fine for tens of thousands of leads; a database when it
  is not.
- **Nothing here makes an attacker stop reading the site.** These limits guard the forms, the
  disk, and the mail. They are not a firewall.
- **The counters are per-process**, so `MAIL_MAX_PER_DAY` is a per-process budget too.
- **The alerts depend on mail working.** If the SMTP relay itself is down, a flood shows in
  the log and nowhere else. The alert is best-effort by design: it can never be the reason a
  submission fails.
