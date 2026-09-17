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
const { waitlistInput, contactInput, demoInput, manageInput, spamCheck, plainObject } = require('./lib/validate');
const { guard, securityHeaders, formGateLimit, globalGate, noteTrap } = require('./lib/protect');
const captcha = require('./lib/captcha');
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
/* The lists are plain JSON files on purpose — at this size a database is a dependency with
   nothing to give back. The honest limit of that choice is size, so say so in the log when
   a file gets big enough for it to matter, rather than letting the first sign be a slow
   site. Once per process, and it changes nothing about how the file is used. */
const DATA_SIZE_WARN = 8 * 1024 * 1024;
const bigFilesWarned = new Set();
function noteDataSize(f, bytes) {
  if (bytes < DATA_SIZE_WARN || bigFilesWarned.has(f)) return;
  bigFilesWarned.add(f);
  console.log(`[data] ${path.basename(f)} has passed ${(bytes / 1048576).toFixed(1)} MB · `
    + 'the JSON file is doing its job, but this is the size where a small database earns its keep (docs/LIMITS.md)');
}
function writeJson(f, v) {
  const tmp = f + '.' + process.pid + '.tmp';
  try {
    // 0600 BEFORE the data lands. The default 0644 exists for a moment on every write, and
    // on a shared Hostinger box that moment is a stranger reading a customer list.
    const body = JSON.stringify(v, null, 2);
    noteDataSize(f, Buffer.byteLength(body));
    fs.writeFileSync(tmp, body, { mode: 0o600 });
    fs.renameSync(tmp, f);                     // atomic on POSIX: readers see old or new, never a mix
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (e2) {}  // never leave a half-written copy of PII behind
    throw e;
  }
}
const visitorsFile = path.join(DATA, 'visitors.json');
const waitlistFile = path.join(DATA, 'waitlist.json');
const contactFile = path.join(DATA, 'contact.json');
const demoFile = path.join(DATA, 'demo.json');
const manageFile = path.join(DATA, 'manage.json');

/* How many proxies to believe. This used to be `true`, which means "believe every
   X-Forwarded-For", and that made the per-visitor rate limit free to skip: a script could
   invent a new address on every post. Counting hops instead means only the entries a real
   proxy appended are read, so a made-up one is ignored. TRUST_PROXY=1 is one proxy that
   appends the client; if Hostinger ever puts a CDN in front, TRUST_PROXY=2 says so. */
app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');                   // do not advertise the stack
app.use(express.json({ limit: '20kb' }));

/* ── what the internet is not allowed to read ─────────────────────────────────
   The old build served __dirname, which made data/*.json (every customer name and
   email) and .git/ downloadable with a plain curl. This guard closes that hole
   now; the full public/ restructure waits for the security pass. See lib/protect.js. */
app.use(guard);
app.use(securityHeaders);

/* ── the API ───────────────────────────────────────────────────────────────── */

/* Writing a first-visit record costs a file rewrite, and an attacker who forges identities
   can ask for one per request. This budgets the WRITES, not the reads: a visitor we have
   already seen is answered from memory of the file and costs nothing, so a real crowd is
   unaffected even when the budget for new records is spent. */
let newVisitorAt = -1, newVisitorCount = 0;
function newVisitorBudget() {
  const minute = Math.floor(Date.now() / 60000);
  if (minute !== newVisitorAt) { newVisitorAt = minute; newVisitorCount = 0; }
  return ++newVisitorCount <= config.limits.newVisitorsPerMin;
}
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

/* ── telling the owner when the site is being worked hard ──────────────────────
   A cap tripping is worth an email, because the alternative is the owner finding out from
   a full inbox. One line per kind per half hour, at most, and only ever to MAIL_NOTIFY_TO:
   someone attacking the site must not be able to turn this into a mail flood of its own. */
const alertOnTrip = ({ name, over, limit }) => {
  mail.notifyAlert('limit-' + name.replace(/\W+/g, '-'),
    name + ': the site is being hit harder than usual',
    [`${name}: the whole site passed ${limit} and further requests are being refused for now.`]).catch(() => {});
};
/* the mail budget tripping is the one the owner feels most directly */
mail.onCap(over => {
  mail.notifyAlert('mail-' + over, `email sending paused: the ${over} cap is reached`, [
    `The site passed its ${over === 'hour' ? config.mail.maxPerHour + ' an hour' : config.mail.maxPerDay + ' a day'} email budget.`,
    'Leads are still being stored and visitors still see success; only the sending has paused.',
  ]).catch(() => {});
});

/* the whole-site caps: the visitor bucket first, so one noisy visitor never spends the
   site's budget, then the cap that no header can move */
const capForms = globalGate({ name: 'form submissions', perMinute: config.limits.formsPerMin, perDay: config.limits.formsPerDay, onTrip: alertOnTrip });
const capCaptcha = globalGate({ name: 'captcha challenges', perMinute: config.limits.captchaPerMin, onTrip: alertOnTrip });
const capVisits = globalGate({ name: 'first-visit checks', perMinute: config.limits.visitsPerMin, onTrip: alertOnTrip });
const gateForms = [...limitForms, capForms];

/* a small readiness endpoint, so Hostinger's monitor and the test suite can ask
   "is it up" without a browser. It answers with no secrets and no customer data. */
app.get('/api/health', (req, res) => {
  const m = mail.status();
  res.set('Cache-Control', 'no-store').json({
    ok: true, uptime: Math.round(process.uptime()), node: process.versions.node,
    mail: (m.enabled && !m.dryRun) ? 'live' : 'dry-run', recipients: m.notify.length,
    /* your own address, as this server resolves it — nothing else, and nothing of anyone
       else's. It is here to answer one question after a deploy: is the proxy hop count
       right? Ask a "what is my IP" page for yours, then ask this. Same address means the
       rate limits are counting per visitor as intended; a Hostinger address means the
       header is being read further in than it should be (see TRUST_PROXY in docs/LIMITS.md). */
    yourIp: req.ip || null, proxyHops: config.trustProxy,
  });
});

app.get('/api/first-visit', limitVisits, capVisits, (req, res) => {
  const key = ipHash(req);
  const seen = readJson(visitorsFile, {});
  const first = !seen[key];
  if (first && newVisitorBudget()) {
    const keys = Object.keys(seen);
    if (keys.length >= 20000) {                // a scanner sweeping IPs must not grow this forever
      for (const k of keys.sort((a, b) => (seen[a] < seen[b] ? -1 : 1)).slice(0, 8000)) delete seen[k];
    }
    seen[key] = new Date().toISOString(); writeJson(visitorsFile, seen);
  }
  res.set('Cache-Control', 'no-store').json({ first });
});

/* ── the captcha · one puzzle per visit, signed by us ──────────────────────────
   The widget asks for this when the visitor clicks the box, solves it in their browser,
   and posts the answer back in a field named `altcha`. Nothing about the visitor is sent
   anywhere, and nothing is stored: the challenge carries its own proof in the signature. */
/* No rate limit on purpose. Minting a challenge is 16 random bytes and one HMAC — cheaper
   than serving /css/site.css — and it is the *posts* that must stay rationed, not the
   asking. Putting it in the visitor bucket also made every submission count twice against
   the form limit, which the rate-limit tests would have been right to catch. */
app.get('/api/captcha', capCaptcha, (req, res) => {
  res.set('Cache-Control', 'no-store').json(captcha.makeChallenge(config.captcha.secret, {
    maxNumber: config.captcha.difficulty,
  }));
});

/* both endpoints share the same door: right shape, then the bot traps, then the fields */
const formGate = async (req, res, next) => {
  if (!plainObject(req.body)) return res.status(400).json({ ok: false, errors: ['body'] });
  const check = spamCheck(req, req.body || {}, config);
  if (check.spam) {
    /* A robot by its own hand — a filled honeypot, a form-encoded post, a blocked mailbox.
       It is told the same {"ok":true} as a human, so it learns nothing, and nothing is kept.
       The line below is the only trace it leaves, with a path and the salted hash, never an
       address and never a field value (see noteTrap in lib/protect.js). */
    noteTrap(check.why.join(','), `${req.path} · ${req.ipHash || 'no-hash'}`);
    return res.json({ ok: true });
  }
  /* Timing looked odd but nothing says robot: the lead is kept and marked, and the owner is
     told why in their notification. Losing a real message is worse than reading one that
     says it was sent quickly. */
  if (check.flags.length) {
    req.flags = check.flags;
    noteTrap(check.flags.join(','), `${req.path} · ${req.ipHash || 'no-hash'}`, 'kept, marked');
  }
  /* The traps ran first and still decide silently, exactly as before. The captcha is the
     next door: anything that looks like a person (or a script careful enough to pass for
     one) now has to answer a puzzle it cannot cheaply fake. It is deliberately told *that*
     it failed — that is a captcha's whole contract with the visitor — and nothing else.
     If the widget is ever broken in production, CAPTCHA_DISABLED=1 opens this door again. */
  if (config.captcha.disabled) return next();
  const answer = captcha.verify(config.captcha.secret, req.body.altcha);
  if (!answer.ok) {
    noteTrap('captcha:' + answer.why, `${req.path} · ${req.ipHash || 'no-hash'}`);
    return res.status(400).json({ ok: false, errors: ['captcha'] });
  }
  req.captcha = answer;                 // burned only once the send is real (see below)
  return next();
};

/* A solved puzzle is spent the moment a submission is accepted, so it cannot be posted
   twice. A form that came back with a field error is not accepted, so the visitor fixes it
   and sends again without solving a second puzzle. */
const spendCaptcha = req => { if (req.captcha) captcha.consume(req.captcha.tag, req.captcha.expires); };

app.post('/api/waitlist', gateForms, formGate, async (req, res) => {
  /* shape and bot traps already passed in formGate. A script that gets here is told the
     same {"ok":true} as a human, so it cannot use our error messages to tune itself. */
  const in_ = waitlistInput(req.body);
  if (!in_.ok) return res.status(400).json({ ok: false, errors: in_.errors });
  spendCaptcha(req);

  const record = { name: in_.name, email: in_.email, intent: in_.intent, business: in_.business, at: new Date().toISOString() };
  if (req.flags) record.flagged = req.flags.join(',');
  const list = readJson(waitlistFile, []);
  if (!list.some(e => e.email === record.email)) list.push(record);   // a repeat join is not a new lead
  writeJson(waitlistFile, list);

  // never awaited before responding... but awaited here so a crash surfaces in this request's log
  const r = await mail.notifyWaitlist(record, { ip: ipHash(req) });   // the hash, never the address
  res.json({ ok: true, confirmed: r.sent > 0 });
});

app.post('/api/contact', gateForms, formGate, async (req, res) => {
  const in_ = contactInput(req.body);
  if (!in_.ok) return res.status(400).json({ ok: false, errors: in_.errors });
  spendCaptcha(req);

  const record = {
    name: in_.name, email: in_.email, phone: in_.phone,
    organisation: in_.organisation, about: in_.about, message: in_.message,
    at: new Date().toISOString(),
  };
  if (req.flags) record.flagged = req.flags.join(',');
  const list = readJson(contactFile, []);
  list.push(record);
  writeJson(contactFile, list);

  const r = await mail.notifyContact(record);
  res.json({ ok: true, confirmed: r.sent > 0 });
});

/* the two dialogs on the home page: Book a demo (setup) and Join early access (manage).
   Same door as the contact form: right shape, then the bot traps, then the fields. The
   records keep the answers as the dialog asked them; the mailer turns them into words. */
app.post('/api/demo', gateForms, formGate, async (req, res) => {
  const in_ = demoInput(req.body);
  if (!in_.ok) return res.status(400).json({ ok: false, errors: in_.errors });
  spendCaptcha(req);

  const record = {
    name: in_.name, email: in_.email, phone: in_.phone,
    who: in_.who, entity: in_.entity, at: new Date().toISOString(),
  };
  if (req.flags) record.flagged = req.flags.join(',');
  const list = readJson(demoFile, []);
  list.push(record);
  writeJson(demoFile, list);

  const r = await mail.notifyDemo(record);
  res.json({ ok: true, confirmed: r.sent > 0 });
});

app.post('/api/manage', gateForms, formGate, async (req, res) => {
  const in_ = manageInput(req.body);
  if (!in_.ok) return res.status(400).json({ ok: false, errors: in_.errors });
  spendCaptcha(req);

  const record = {
    name: in_.name, email: in_.email, phone: in_.phone,
    have: in_.have, count: in_.count, authority: in_.authority, plans: in_.plans, at: new Date().toISOString(),
  };
  if (req.flags) record.flagged = req.flags.join(',');
  const list = readJson(manageFile, []);
  list.push(record);
  writeJson(manageFile, list);

  const r = await mail.notifyManage(record);
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

/* ── and a page that does not exist is a 404 ─────────────────────────────────
   This used to be `app.get('*', ...index.html)`: every unknown address answered with the
   home page and a 200. A typo like /contct.html therefore looked, to a browser and to
   Google, exactly like the home page — a soft 404, which can put the home page in the index
   under several addresses and spends the crawl budget on pages that do not exist. A site of
   five real files has no client-side routes to fall back for, so the honest answer is the
   one below: a 404, and a page that says so. lib/protect.js has already refused everything
   outside the allow-list, and an unknown /api path was refused before it ever got here, so
   the API still never answers with HTML. */
app.use((req, res) => {
  if (req.path === '/api' || req.path.startsWith('/api/')) {
    return res.status(404).json({ ok: false, errors: ['not-found'] });   // an API path never answers with a page
  }
  res.status(404).sendFile(path.join(SITE, '404.html'));
});

const server = app.listen(PORT, '0.0.0.0', () => {
  const m = mail.status();
  // the REAL bound port, not the requested one: PORT=0 means "whatever the OS gives us"
  console.log(`BOASIS site on port ${server.address().port}`);
  console.log(`mail: ${m.enabled && !m.dryRun ? 'live via ' + m.relay : `DRY RUN (no SMTP credentials or MAIL_DRY_RUN) · relay would be ${m.relay}`} · from ${m.from} · to ${m.notify.length} address(es)`);
  if (config.problems.length) config.problems.forEach(p => console.log('config: ⚠ ' + p));
});
