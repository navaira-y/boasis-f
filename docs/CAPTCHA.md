# The captcha

One box on every form. The visitor clicks it, their browser does a small calculation, and the
form can be sent. Nothing to read, no pictures, no third party.

## Why we run our own instead of renting one

| | Ours | Google reCAPTCHA | Cloudflare Turnstile |
|---|---|---|---|
| Cost | £0 | 10,000 free a month, then $8+ | £0 |
| Account and keys | none | yes | yes |
| Told about every visitor | nobody | Google | Cloudflare |
| Content Security Policy | unchanged | must be loosened | must be loosened |
| Works where Google is blocked | yes | no | yes |

Weakening the CSP was the deciding one. The site's own rule is `script-src 'self'`, which means
"only code we wrote runs on this page". A hosted captcha breaks that rule by definition, and the
privacy page would then have to say a third party sees every visitor. This one talks only to our
own server.

## How it works, in order

1. The visitor clicks the box. The page asks `GET /api/captcha` for a puzzle.
2. The server picks a random number, hashes it with a random salt, and signs the result with
   `CAPTCHA_SECRET`. It never sends the number.
3. The browser searches for the number that finishes the hash. About a tenth of a second on a
   laptop, and the only way to find it, because a hash cannot be run backwards.
4. The answer rides to the server in a hidden field named `altcha`, inside the same form as
   everything else.
5. The server checks the signature, the expiry, and the hash. Then it burns the signature, so
   one solved puzzle authorises exactly one send.

A script posting a thousand forms now pays that tenth of a second a thousand times, with no way
to share one answer across them.

## What the visitor sees

* Clicking the box turns the small square into a spinner, then into the site's navy with a white
  check, and the label reads `Verified`.
* Pressing Join, Send or the last button of a dialog before the box is ticked says
  `Please click the "I am not a robot" box first.`, puts the focus on the box, and sends nothing.
  It never says "Sending" while nothing is going anywhere.
* The two colours are written out in the stylesheet (`#17365E` and white) rather than taken from
  the theme, because a check that goes invisible on one theme is worse than no check at all.

## What it costs us to run

Nothing. No account, no quota, no API. The puzzle costs our server one HMAC, which is cheaper
than serving a CSS file.

## The knobs

| Variable | What it does | Default |
|---|---|---|
| `CAPTCHA_SECRET` | signs the puzzles. Falls back to `VISITOR_SALT`, then to a dev value with a boot warning | empty |
| `CAPTCHA_DIFFICULTY` | the search space. Half of it is the average wait | 20000 |
| `CAPTCHA_DISABLED` | `1` switches the captcha off and leaves the older traps doing the work | off |

**Set `CAPTCHA_SECRET` on the server.** Without it the puzzles are signed with a value that is
in the repo, and then a script could mint its own easy puzzle. The server prints a warning at
startup while it is missing.

### Where to set it, on Hostinger

1. hPanel → the website → **Environment variables** in the dashboard sidebar.
2. **Add environment variable** → Key `CAPTCHA_SECRET` → paste the value. No quotes, no spaces.
3. Save. Hostinger redeploys the app, and the value reaches the running process.
4. Check **Runtime Logs** in the same sidebar: the line `⚠ CAPTCHA_SECRET is empty` must be gone
   from the newest boot. That warning is the only thing that changes — no code change, no
   DNS, no account, nothing else to touch.

Rotating the value later is safe: puzzles issued in the previous ten minutes stop working, and a
visitor simply clicks the box again.

## The kill switch

If the box ever breaks in production, the forms must not go down with it. Set
`CAPTCHA_DISABLED=1` and restart: every submission is judged by the traps exactly as it was
before the captcha existed. No deploy, no code change.

## Where it sits in the chain

```
shape  →  honeypot and timing traps  →  captcha  →  the form's own rules
```

The traps stay first and still answer `{"ok":true}` silently, because that silence is the trap
working. The captcha is the one gate that tells a visitor it failed, because a captcha that
refuses silently is indistinguishable from a broken form.

A field error does not burn the puzzle, so a visitor who mistypes their email fixes it and sends
again without solving a second one. A sent form does burn it.

## What it does not do

- It does not identify people. It proves someone paid the cost of the calculation.
- It does not replace the rate limit or the timing traps, they still run first.
- It does not stop a determined attacker with a real browser fleet. It makes each submission
  cost real CPU, which is what turns a flood from free into expensive.

## Files

| File | Its job |
|---|---|
| `lib/captcha.js` | makes and checks the puzzles, and burns them once used |
| `js/captcha.js` | the box, and the browser's half of the search |
| `css/site.css` | the box's look, in the site's own colours |
| `test/captcha.test.js` | the maths, the wire, the replay rule, and the kill switch |
| `test/helpers/captcha.js` | solves a real challenge for the other test files |
