/* BOASIS site server · Express, for Hostinger Node.js hosting
   - serves the static site
   - GET  /api/first-visit  → { first: true|false }  by visitor IP, stored as a salted hash, never the IP itself
   - POST /api/waitlist     → stores the sign-up, then mails us and confirms to the visitor
   - POST /api/contact      → same, for the contact form (the form itself is a separate step)

   Mail is best-effort on purpose: a sign-up is stored first, so if the SMTP relay is down,
   misconfigured, or the key is missing, the visitor still succeeds and the record is safe.
   Secrets come only from the environment — see .env.example and docs/EMAIL.md. */
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const config = require('./config/env');
const { waitlistInput, contactInput, spamCheck, plainObject } = require('./lib/validate');
const { guard, securityHeaders, formGateLimit } = require('./lib/protect');
const mail = require('./lib/mailer');

const app = express();
const PORT = config.port;
const SITE = __dirname;
const DATA = path.resolve(config.dataDir);
const SALT = config.visitorSalt || 'boasis-dev-only';
fs.mkdirSync(DATA, { recursive: true });

/* ── storage ──────────────────────────────────────────────────────────────────
   readJson/writeJson stay, but writes are now atomic (temp + rename) so two
   sign-ups in the same second cannot leave a half-written file. */
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
function writeJson(f, v) {
  const tmp = f + '.' + process.pid + '.tmp';
  try {
    // 0600 BEFORE the data lands. The default 0644 exists for a moment on every write, and
    // on a shared Hostinger box that moment is a stranger reading a customer list.
    fs.writeFileSync(tmp, JSON.stringify(v, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, f);                     // atomic on POSIX: readers see old or new, never a mix
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (e2) {}  // never leave a half-written copy of PII behind
    throw e;
  }
}
const visitorsFile = path.join(DATA, 'visitors.json');
const waitlistFile = path.join(DATA, 'waitlist.json');
const contactFile = path.join(DATA, 'contact.json');

app.set('trust proxy', true);                  // Hostinger sits behind a proxy; req.ip is then the real client
app.disable('x-powered-by');                   // do not advertise the stack
app.use(express.json({ limit: '20kb' }));

/* ── what the internet is not allowed to read ─────────────────────────────────
   The old build served __dirname, which made data/*.json (every customer name and
   email) and .git/ downloadable with a plain curl. This guard closes that hole
   now; the full public/ restructure waits for the security pass. See lib/protect.js. */
app.use(guard);
app.use(securityHeaders);

/* ── the API ───────────────────────────────────────────────────────────────── */
const ipHash = req => {
  const ip = req.ip || (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || '';
  return crypto.createHash('sha256').update(SALT + ip).digest('hex').slice(0, 16);
};

/* one rate bucket per visitor, keyed on the salted hash rather than the address: it is the
   same value the data uses, it never stores an IP, and a client cannot choose it. */
/* Express hands every middleware a `next`, and only moves on when it is called (or the
   function declares the 4th error arg). A plain `req => { …; return req; }` looks harmless
   and hangs the request forever: this cost a full debugging pass, so it is written out long
   form and asserted by test/rate-limit.test.js. */
const bucket = (req, res, next) => { req.ipHash = ipHash(req); return next(); };
const limitForms = [bucket, formGateLimit(config.limits.forms)];
const limitVisits = [bucket, formGateLimit(config.limits.visits)];

/* a small readiness endpoint, so Hostinger's monitor and the test suite can ask
   "is it up" without a browser. It answers with no secrets and no customer data. */
app.get('/api/health', (req, res) => {
  const m = mail.status();
  res.set('Cache-Control', 'no-store').json({
    ok: true, uptime: Math.round(process.uptime()), node: process.versions.node,
    mail: (m.enabled && !m.dryRun) ? 'live' : 'dry-run', recipients: m.notify.length,
  });
});

app.get('/api/first-visit', limitVisits, (req, res) => {
  const key = ipHash(req);
  const seen = readJson(visitorsFile, {});
  const first = !seen[key];
  if (first) {
    const keys = Object.keys(seen);
    if (keys.length >= 20000) {                // a scanner sweeping IPs must not grow this forever
      for (const k of keys.sort((a, b) => (seen[a] < seen[b] ? -1 : 1)).slice(0, 8000)) delete seen[k];
    }
    seen[key] = new Date().toISOString(); writeJson(visitorsFile, seen);
  }
  res.set('Cache-Control', 'no-store').json({ first });
});

/* both endpoints share the same door: right shape, then the bot traps, then the fields */
const formGate = async (req, res, next) => {
  if (!plainObject(req.body)) return res.status(400).json({ ok: false, errors: ['body'] });
  if (spamCheck(req, req.body || {}, config).spam) return res.json({ ok: true });
  return next();
};

app.post('/api/waitlist', limitForms, formGate, async (req, res) => {
  /* shape and bot traps already passed in formGate. A script that gets here is told the
     same {"ok":true} as a human, so it cannot use our error messages to tune itself. */
  const in_ = waitlistInput(req.body);
  if (!in_.ok) return res.status(400).json({ ok: false, errors: in_.errors });

  const record = { name: in_.name, email: in_.email, intent: in_.intent, business: in_.business, at: new Date().toISOString() };
  const list = readJson(waitlistFile, []);
  if (!list.some(e => e.email === record.email)) list.push(record);   // a repeat join is not a new lead
  writeJson(waitlistFile, list);

  // never awaited before responding... but awaited here so a crash surfaces in this request's log
  const r = await mail.notifyWaitlist(record, { ip: ipHash(req) });   // the hash, never the address
  res.json({ ok: true, confirmed: r.sent > 0 });
});

app.post('/api/contact', limitForms, formGate, async (req, res) => {
  const in_ = contactInput(req.body);
  if (!in_.ok) return res.status(400).json({ ok: false, errors: in_.errors });

  const record = {
    name: in_.name, email: in_.email, phone: in_.phone,
    organisation: in_.organisation, about: in_.about, message: in_.message,
    at: new Date().toISOString(),
  };
  const list = readJson(contactFile, []);
  list.push(record);
  writeJson(contactFile, list);

  const r = await mail.notifyContact(record);
  res.json({ ok: true, confirmed: r.sent > 0 });
});

/* ── malformed input is a client error, not a stack trace ──────────────────────
   Without this, one attacker posting "{" in a loop fills Hostinger's log file,
   which is a cheap denial of service and makes real errors impossible to find. */
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) return res.status(400).json({ ok: false });
  if (err && (err.type === 'entity.too.large' || err.status === 413)) return res.status(413).json({ ok: false });
  console.error('[request]', err && err.message ? String(err.message).slice(0, 200) : 'unknown error');
  res.status(500).json({ ok: false });
});

/* ── the site ──────────────────────────────────────────────────────────────── */
app.use((req, res, next) => {
  if (/^www\.boasis\.ae(:\d+)?$/.test(req.headers.host || '')) {
    return res.redirect(301, 'https://boasis.ae' + req.originalUrl);
  }
  next();
});

app.use(express.static(SITE, { extensions: ['html'], dotfiles: 'deny', index: 'index.html' }));
app.get('*', (req, res) => res.sendFile(path.join(SITE, 'index.html')));

const server = app.listen(PORT, '0.0.0.0', () => {
  const m = mail.status();
  // the REAL bound port, not the requested one: PORT=0 means "whatever the OS gives us"
  console.log(`BOASIS site on port ${server.address().port}`);
  console.log(`mail: ${m.enabled && !m.dryRun ? 'live via ' + m.relay : `DRY RUN (no SMTP credentials or MAIL_DRY_RUN) · relay would be ${m.relay}`} · from ${m.from} · to ${m.notify.length} address(es)`);
  if (config.problems.length) config.problems.forEach(p => console.log('config: ⚠ ' + p));
});
