/* SPARK demo · the back end, on this server, in this folder
 *
 * Three doors, no database and no account anywhere:
 *
 *   POST /api/spark-pass    the form at /try-mira posts here. A pass is minted, the person's
 *                           file is started, and the answer says where to take them.
 *   POST /api/spark-step    the Brain posts here after every step: what the person typed, and
 *                           what the page said back. Additive, so a walk away at step two
 *                           leaves a smaller file rather than a broken one.
 *   GET  /api/spark-lead    the Brain reads here, so a person who reloads lands on their own
 *                           step rather than at the start of the journey.
 *
 * One file per person, `data/leads/PASSxxxxxxxx.json`, which is the same pattern the site
 * already uses for its waitlist, its contact messages and its demo requests: plain JSON under
 * DATA_DIR, written 0600 and renamed, and never fetchable from the web because `/data/` is one
 * of the closed prefixes in lib/protect.js. That is also why this exists rather than only the
 * Supabase functions next door: nothing to sign up to, no key to paste, no browser policy to
 * widen, and after the event the whole stand is one folder you can read, list, or turn into a
 * CSV with scripts/spark-leads.js.
 *
 * The rules themselves are not here. They are in
 * demo/supabase/functions/_shared/spark-core.js, the one module the two Supabase functions
 * import too, so the two back ends cannot drift apart and the tests run the rules once.
 *
 * What is worth knowing about the trust: the pass is the whole credential. Anyone holding
 * PASSxxxxxxxx can read and update that one person's file, which is what makes the journey
 * resumable from a browser at another subdomain with no login of its own. A pass is eight
 * characters from an alphabet without look-alikes, so about 2^40, it is only in the address bar
 * and the person's own history for a day, it is never in a link the site publishes, and it is
 * rate limited here at forty requests a minute per visitor. Tightening it to a signed short
 * lived token would mean a login in the visitor's path, which is the one thing the plan rules
 * out. If that trade ever reads wrong, the answer is the Supabase pair, not more code here.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CORE = path.join(__dirname, '..', 'demo', 'supabase', 'functions', '_shared', 'spark-core.js');
let coreP = null;
const core = () => { if (!coreP) coreP = import(CORE); return coreP; };   // ESM rules, one import, forever

const loadJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
function saveJson(f, obj) {
  /* the site's own habit, copied rather than shared: the mode is set before the data lands,
     because on a shared box the default 0644 exists for a moment on every write and that moment
     is a stranger reading a name and a phone number. */
  const tmp = f + '.' + process.pid + '.tmp';
  fs.mkdirSync(path.dirname(f), { recursive: true });
  try {
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, f);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (e2) {}
    throw e;
  }
}

/* A bucket of its own, keyed like the site's but counted separately: at a stand thirty phones
   come out of one address, and the demo must not be able to spend the contact form's budget, nor
   have the contact form spend the demo's. This is the limit that stands in for the one Nginx
   cannot put on a POST nobody links to. */
const WINDOW = 60000;
const HITS = new Map();
function rate(limit) {
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ipHash || req.ip || 'unknown';
    let b = HITS.get(key);
    if (!b || b.at + WINDOW < now) { b = { n: 0, at: now }; HITS.set(key, b); }
    b.n += 1;
    if (b.n > limit) {
      res.set('Cache-Control', 'no-store').set('Retry-After', String(Math.max(1, Math.ceil((b.at + WINDOW - now) / 1000))));
      return res.status(429).json({ ok: false, error: 'limited' });
    }
    return next();
  };
}

module.exports = function install(app, opts) {
  const o = opts || {};
  const DATA = o.dataDir;
  const BRAIN = o.brainUrl || '';
  const ALLOW = o.origins || [];
  const SALT = o.salt || 'spark-demo';
  const log = o.log || (() => {});

  const leadFile = (pass) => path.join(DATA, 'leads', pass + '.json');
  /* the same address, the same file: a second scan of the QR hands back the pass the person
     already has rather than opening a stranger's page. The address itself is never in a name. */
  const mailFile = (email) => path.join(DATA, 'spark-by-email',
    crypto.createHash('sha256').update(SALT + '|' + email).digest('hex') + '.json');

  /* the two doors the Brain uses are on another subdomain, so a browser sends a preflight
     before the real request. A preflight is an OPTIONS and a route mounted with app.post never
     sees one, so these two answer it themselves and stop there.
     An origin that is not on the list gets the same empty 204: no header, which is a browser
     refusing to read the reply, and nothing for a stranger to learn from the difference. */
  const allow = (req, res) => {
    const origin = req.headers.origin;
    if (origin && ALLOW.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin).vary('Origin');
      res.set('Access-Control-Allow-Headers', 'content-type');
      res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.set('Access-Control-Max-Age', '600');
    }
  };
  for (const p of ['/api/spark-step', '/api/spark-lead']) {
    app.options(p, (req, res) => { allow(req, res); res.status(204).end(); });
  }
  const cors = (req, res, next) => { allow(req, res); return next(); };

  const gate = [o.bucket || ((req, res, next) => next()), rate(o.limitPerMin || 40)];

  app.post('/api/spark-pass', gate, async (req, res) => {
    const k = await core();
    const form = k.readForm(req.body);
    if (!form.ok) return res.status(400).json({ ok: false, error: form.error });
    const now = Date.now();

    const seen = loadJson(mailFile(form.contact.email));
    if (seen && k.isPass(seen.pass)) {
      const back = loadJson(leadFile(seen.pass));
      if (back && Date.parse(back.expires_at || 0) > now) {
        log('pass reused ' + seen.pass);
        return res.json({ ok: true, pass: seen.pass, brain_url: BRAIN, reused: true });
      }
    }

    let pass = '';
    for (let i = 0; i < 5; i += 1) { const c = k.makePass(); if (!loadJson(leadFile(c))) { pass = c; break; } }
    if (!pass) return res.status(503).json({ ok: false, error: 'busy' });   // one in four billion, five times

    saveJson(leadFile(pass), k.buildLead({ pass, contact: form.contact, source: (req.body || {}).source, now }));
    saveJson(mailFile(form.contact.email), { pass, created_at: new Date(now).toISOString() });
    log('pass ' + pass + ' opened');
    return res.json({ ok: true, pass, brain_url: BRAIN });
  });

  app.post('/api/spark-step', cors, ...gate, async (req, res) => {
    const k = await core();
    const pass = String((req.body || {}).pass || '');
    if (!k.isPass(pass)) return res.status(400).json({ ok: false, error: 'pass' });
    const checked = k.checkPass(pass, loadJson(leadFile(pass)), Date.now());
    if (!checked.ok) return res.status(checked.error === 'pass' ? 400 : 404).json({ ok: false, error: checked.error });
    const next = k.applyStep(checked.lead, String((req.body || {}).step || ''), (req.body || {}).data || {}, Date.now());
    if (!next) return res.status(400).json({ ok: false, error: 'step' });
    try {
      saveJson(leadFile(pass), next);
    } catch (e) {
      console.error('[spark] could not write the file: ' + e.message.slice(0, 160));
      return res.status(500).json({ ok: false, error: 'storage' });
    }
    log('saved ' + (req.body || {}).step + ' v' + next.version);
    return res.json({ ok: true, version: next.version, steps_reached: next.brain.steps_reached });
  });

  app.get('/api/spark-lead', cors, ...gate, async (req, res) => {
    const k = await core();
    const pass = String(req.query.pass || '');
    if (!k.isPass(pass)) return res.status(400).json({ ok: false, error: 'pass' });
    const checked = k.checkPass(pass, loadJson(leadFile(pass)), Date.now());
    if (!checked.ok) return res.status(checked.error === 'pass' ? 400 : 404).json({ ok: false, error: checked.error });
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, lead: checked.lead });
  });

  return { leadFile, mailFile };
};
