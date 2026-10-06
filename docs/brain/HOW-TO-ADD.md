# Adding SPARK to brain.boasis.ae. Four edits.

Everything here is the whole job. There is no database to make, no account to build, no key to ask
for, and nothing on your side stores a lead. One file, `spark-embed.js`, sits next to this
document, copy it into your repo and follow the four numbers.

`spark-embed.js` is plain ES module JavaScript. No dependency, no framework, no build step needed
for it. If you would rather not import a module, the same three functions are all it does, so feel
free to inline it.

## 1. The file, and where

Copy `spark-embed.js` to wherever your app can import it, `src/lib/spark-embed.js` is a fine place.

Then at your app entry, before you render, once:

```js
import { initSpark } from './lib/spark-embed.js';
const spark = initSpark();
```

`initSpark()` reads `?pass=` and `?embed=1` and keeps the pass in `sessionStorage`, so a reload
inside the frame still knows who it is talking about. Without a valid pass it changes nothing at
all, and your app behaves as it does today. `spark.active` is the one check you need if you want
to switch anything else off for a framed visitor.

## 2. Hide your chrome when you are framed

`initSpark()` puts `data-spark="embed"` on `<html>`. One rule and you are done, in your global
stylesheet, using your own class names:

```css
html[data-spark="embed"] .site-header,
html[data-spark="embed"] .site-nav,
html[data-spark="embed"] .site-footer { display: none !important; }
```

If you would rather not get framed content at all, you can also give the frame no scrollbars from
our side, but nothing more is asked of you. Do not change the journey, the sizes or the colours for
a framed visitor, and do not add a "close" or "back to app" button inside the frame, the person
came from one page and should stay on it.

## 3. Write each step, and read where they stopped

Four calls, one per step, right after the step is finished and the answer is on screen:

```js
await spark.save('describe', { description });
await spark.turn(question, answer, output);                       // the 'mira' step
await spark.save('activities', { shown, picked, confirmed: true });
await spark.save('package', { shareholders, visas, premises, price_aed, confirmed: true });
```

And on load, when `spark.active` is true, before you show step one:

```js
const reached = await spark.reached();       // e.g. ['describe']
```

Send them to the first step that is not in `reached`. That single line is what makes a reload, a
crashed tab or a second device pick up in the middle instead of at the start.

Both of those never reject. A bad network answers `{ ok: false, error: 'network' }` and the visitor
sees nothing, which is what you want in front of a queue. If you want to be noisy while building
it, log `spark.save(...)`'s reply, and delete that log before you ship: the reply and the address
both contain the pass.

## 4. One header, on the framed route only, so we can frame you

```
Content-Security-Policy: frame-ancestors https://boasis.ae
```

and no `X-Frame-Options` header on that route. One host, exact, no wildcard, no `'self'` added.

Next.js, `next.config.js`, add a matcher so it lands only on the framed route:

```js
async headers() {
  return [{ source: '/:path*', headers: [
    { key: 'Content-Security-Policy', value: 'frame-ancestors https://boasis.ae' },
    { key: 'X-Frame-Options', value: '' },
  ] }];
}
```

nginx:

```nginx
location = / {
  add_header Content-Security-Policy "frame-ancestors https://boasis.ae" always;
  proxy_hide_header X-Frame-Options;
}
```

Express, or anything you own end to end:

```js
app.use((req, res, next) => {
  if (req.path === '/' || req.path.startsWith('/mira')) {
    res.setHeader('Content-Security-Policy', 'frame-ancestors https://boasis.ae');
    res.removeHeader('X-Frame-Options');
  }
  next();
});
```

If you also send your own CSP with a `connect-src`, add this host to it, or the browser will block
the writes from your page:

```
https://grsbhupjihwvidxbkymu.supabase.co
```

If you send no CSP today, do not start one for this, the one directive above is enough.

## What not to do, and why

- No API key in your front end, not the anon one, not the service one. The two doors you call need
  nothing but a JSON body, and a key in a bundle is the one mistake that turns this into an
  incident.
- No Supabase client, and nothing SPARK related in the Supabase project you already have for your
  own app. Do not create a table, do not run our SQL anywhere, do not rename anything there. Two
  `fetch` calls, that is the integration.
- No new table, no migration, no column, no queue on your side. The row is ours.
- Never log the pass, and keep it out of analytics, error reporters and screenshots. It is the only
  credential, and it opens that person's row for 24 hours.
- Do not render anything from our row as HTML. `description`, the questions and the answers were
  typed by a stranger, so put them in as text.
- Do not email, share or print a link that carries a pass.

## Prove it, in this order

1. Address bar, your app on its own: `https://brain.boasis.ae/?pass=PASSABCDEFGH&embed=1`. Your
   chrome is gone, the journey runs, no console error.
2. Same, with `?pass=123`: nothing you built here happens, and your Network tab shows no request to
   `supabase.co`. A malformed pass is not ours and must be ignored.
3. Open `https://boasis.ae/try-mira`, submit, and the frame shows your app with the real pass in its
   address. No `X-Frame-Options` or `frame-ancestors` complaint in the console, that is edit 4
   working.
4. Finish the first step. Network tab, one `POST …/functions/v1/save-step` answering
   `200 {"ok":true,"version":2,"steps_reached":["describe"]}`.
5. Supabase, `boasis-spark`, Table editor, `spark_leads`: that pass has `last_step` set and
   `data.brain.description` holds what the person typed.
6. Reload inside the frame. It comes back at the step they reached, from `spark.reached()`.
7. Your `git diff`: one new file, one stylesheet rule, four calls, one header. No schema, no
   dependency, no key.

Then tell us the branch name and which route carries the header. If any of this cannot be done as
written, say what got in the way rather than inventing a fifth step.
