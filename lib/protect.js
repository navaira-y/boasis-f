/* BOASIS · what the public is allowed to download.
   The site is served from the repo root, so the root itself holds server.js, package.json
   and .git. A directory listing was off, but *direct* paths resolved — so the old build let
   anyone `curl /server.js`, `/package.json`, `/data/waitlist.json` or `/.git/config`.
   The customer list, the source, and the repo metadata, all with one request.

   Model: ALLOW-list by location *and* by extension, so a stray file dropped into an open
   folder still cannot be served. Anything not matched is a 404 — the same answer as
   "no such page", so a scanner learns nothing about what exists.

   The tidy fix is to serve from public/ in the security pass; this is the bridge. */

/* each open folder takes only its own kind of file. /assets/ does not serve .html or .php,
   so something dropped there later stays unreachable. */
const OPEN = {
  '/assets/': /\.(?:png|jpe?g|gif|webp|avif|svg|ico|mp4|webm|m4v|ogg|mov|m4a|mp3|wav|woff2?|ttf|otf|eot)$/i,
  '/css/': /\.css$/i,
  '/js/': /\.js$/i,
};

/* folders that live beside the site but are never for the browser */
const CLOSED_PREFIX = ['/data/', '/node_modules/', '/lib/', '/config/', '/scripts/', '/docs/', '/notes/', '/.git/', '/.env'];

/* never served anywhere, whatever they are sitting next to */
const NEVER_EXT = /\.(?:js|cjs|mjs|json|md|txt|log|env|ini|ya?ml|lock|sh|bash|py|php|ts|key|pem|p12|pfx|crt|cer|conf|cfg|bak|swp|sql|old|zip|gz|tar|7z)$/i;

/* a name with a second extension (x.svg.js) is not something we generated */
const MULTI_EXT = /\.[a-z0-9]{1,6}\.(?:js|json|css|html?|php|sh|py|ts|map)$/i;

/* the browser's own scripts: /js/name.js, one level, no dots but the one */
const FRONTEND_JS = /^\/js\/[A-Za-z0-9_-]+\.js$/i;
const ACME = /^\/\.well-known\/(?:acme-challenge|apple-app-site-association|assetlinks\.json)/;

/* percent-decode until the text settles, to a small bound. Over-encoded junk that will not
   settle is refused rather than guessed at — that is how %252e%252e tricks get stopped. */
function settle(input) {
  let p = input;
  for (let i = 0; i < 3; i++) {
    let next;
    try { next = decodeURIComponent(p); } catch (e) { return { bad: true }; }
    if (next === p) return { path: p };
    p = next;
  }
  return p.includes('%') ? { bad: true } : { path: p };
}

function inspect(raw) {
  // an array has typeof 'string'==false but joins itself, so ['/server.js'] would read as a path
  if (typeof raw !== 'string' || raw === '' || Array.isArray(raw)) return { ok: false, why: 'not-a-path' };
  if (!raw.startsWith('/')) return { ok: false, why: 'not-absolute' };   // req.path always is; a bare 'css/x.css' is not a URL
  if (raw.includes('\0')) return { ok: false, why: 'nul-byte' };

  const d = settle(raw.split('?')[0].split('#')[0]);
  if (d.bad) return { ok: false, why: 'bad-encoding' };

  /* normalise //, ./ and ../ BEFORE any prefix is tested, then re-check: double decoding is
     exactly how /js/..%2Fserver.js used to walk out of /js/ and into the repo root */
  const clean = '/' + d.path.split('/').filter(Boolean).join('/');
  if (/[\0\r\n\u2028\u2029]/.test(clean)) return { ok: false, why: 'control-char' };
  const segs = clean.split('/');
  if (segs.includes('..')) return { ok: false, why: 'traversal-after-decode' };
  if (segs.some(s => s.startsWith('.') && !ACME.test(clean))) return { ok: false, why: 'dotfile' };

  if (ACME.test(clean)) return { ok: true, why: 'acme' };                  // HTTPS issuance must not break
  if (clean === '/api/first-visit' || clean === '/api/waitlist' || clean === '/api/contact' || clean === '/api/demo' || clean === '/api/manage' || clean === '/api/health') return { ok: true, why: 'api' };
  for (const c of CLOSED_PREFIX) if (clean.startsWith(c)) return { ok: false, why: 'closed-dir' };
  if (MULTI_EXT.test(clean)) return { ok: false, why: 'double-extension' };

  const servedScript = FRONTEND_JS.test(clean);
  if (NEVER_EXT.test(clean) && !servedScript) return { ok: false, why: 'source-or-data' };

  if (clean === '/' || clean === '/index.html' || clean === '/contact') return { ok: true, why: 'page' };   // one pretty path, and only this one
  if (/^\/[A-Za-z0-9_-]+\.html?$/.test(clean)) return { ok: true, why: 'page' };   // a future /about.html
  for (const dir of Object.keys(OPEN)) {
    if (!clean.startsWith(dir)) continue;
    if (clean.length === dir.length) continue;                    // a bare directory, not a file
    // a filename may contain dots (tokens.css, apple-touch-icon.png); it may not contain a slash
    // that resolves, a dotfile, or anything but these plain characters
    if (new RegExp('^' + dir + '[A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+)*$').test(clean) && OPEN[dir].test(clean)) {
      return { ok: true, why: 'asset-dir' };
    }
  }
  return { ok: false, why: 'not-on-allow-list' };
}

/* the middleware. Keep it before express.static. */
function guard(req, res, next) {
  const r = inspect(req.path);
  if (r.ok) return next();
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(404).end();
}

/* ── response headers ───────────────────────────────────────────────────────────
   Written out longhand rather than pulled in via helmet: this file is already the
   single place that decides what the internet may take from us, and a one-line
   dependency for four headers is not worth a supply chain entry on a Hostinger
   shared box. The CSP is deliberately loose about the site's own files and tight
   about everything else: the only third party this page talks to is Google Fonts. */
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');            // never re-interpret an .ico as HTML
  res.setHeader('X-Frame-Options', 'DENY');                      // no framing, so no clickjacking of the form
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');   // no visitor list leak to Google
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  /* A real CSP, not 'default-src self': the fonts come from googleapis/gstatic and would be
     blocked, and the demo dialog frames Google's own appointment calendar (calendar.app.google
     redirects into calendar.google.com, so both hosts are named). report-only would let the
     site break quietly in production instead, so this is enforced. `unsafe-inline` for styles
     is unavoidable here: the design writes inline style attributes, and every email/section
     reveal depends on them. */
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;"
    + " font-src https://fonts.gstatic.com; img-src 'self' data:; media-src 'self';"
    + " frame-src https://calendar.app.google https://calendar.google.com;"
    + " connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'");
  // only over HTTPS, and never for plain HTTP: HSTS on a site that also serves http:// is a footgun
  if (req.headers['x-forwarded-proto'] === 'https' || req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');   // one year, no includeSubDomains
  }
  next();
}

/* ── the form rate limit ────────────────────────────────────────────────────────
   The bot traps in validate.js stop a lazy script. They do not stop a determined one,
   and 300 sign-ups a minute would still fill data/*.json and burn the whole daily relay
   quota on junk. A fixed window per visitor is enough for three endpoints and costs one
   Map; the sweep keeps it from growing forever on a long-lived process.

   The key is the salted IP hash the caller already computes, so a spoofed
   X-Forwarded-For cannot pick its own bucket. That is also why this takes the hash and
   not the request: whoever calls it decides how much to trust the proxy. */
const WINDOW_MS = 60 * 1000;
const HITS = new Map();
let sweepAt = 0;
function formGateLimit(limitPerMinute) {
  return (req, res, next) => {
    const nowMs = Date.now();
    if (nowMs > sweepAt) {
      sweepAt = nowMs + WINDOW_MS;
      for (const [k, v] of HITS) if (v.at + WINDOW_MS < nowMs) HITS.delete(k);
    }
    const bucket = HITS.get(req.ipHash) || { n: 0, at: nowMs };
    if (bucket.n === 0) bucket.at = nowMs;
    bucket.n += 1;
    HITS.set(req.ipHash, bucket);
    if (bucket.n > limitPerMinute) {
      res.set('Cache-Control', 'no-store').set('Retry-After', String(Math.max(1, Math.ceil((bucket.at + WINDOW_MS - nowMs) / 1000))));
      return res.status(429).json({ ok: false, errors: ['too-many'] });
    }
    return next();
  };
}

module.exports = { guard, inspect, CLOSED_PREFIX, securityHeaders, formGateLimit,
};
