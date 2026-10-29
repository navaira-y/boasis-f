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

const mail = require('./mailer');
const sharjahWatch = require('./sharjah-watch');

const CORE = path.join(__dirname, '..', 'demo', 'supabase', 'functions', '_shared', 'spark-core.js');
let coreP = null;
/* a file URL, not a bare path: Node's ESM loader refuses an absolute Windows path, and on a
   laptop the rehearsal and the tests are exactly where a path like C:\ gets typed. A URL is what
   import() wants on every system, and pathToFileURL is the one function that knows the difference. */
const CORE_URL = require('url').pathToFileURL(CORE).href;
const core = () => { if (!coreP) coreP = import(CORE_URL); return coreP; };   // ESM rules, one import, forever

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
const HITS_MAIL = new Map();      // its own bucket: pressing a button that sends mail is not the
                                  // same kind of traffic as a step of the journey
function rate(limit, store = HITS) {
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ipHash || req.ip || 'unknown';
    let b = store.get(key);
    if (!b || b.at + WINDOW < now) { b = { n: 0, at: now }; store.set(key, b); }
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
  /* one file per pass that has already been emailed, so a double tap, a refresh and a second
     visit to the page cannot turn a receipt into a stream */
  const thanksFile = (pass) => path.join(DATA, 'spark-thanks', pass + '.json');
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
    return res.json({
      ok: true, version: next.version, steps_reached: next.brain.steps_reached,
      frozen: next.brain.frozen === true,          // a second run keeps the first answer intact
    });
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

  /* the thank you, fired by the button rather than queued. Two rules make this safe to put on the
     open internet, and they are the whole point of the door rather than mailing from the page:

     one, the address is never taken from the request. It is read out of the person's own row, so
     nobody can hold this endpoint up as a mailer for an address they chose.
     two, the row has to exist. It is looked up here, through the same public door the Brain uses,
     so a made up pass gets a 404 and nothing is sent. A pass is eight characters from an alphabet
     of thirty two, which is not a list anyone can walk.

     Same origin as well, so no CORS header: another site's script cannot even read the answer.
     A double tap is stopped by the file, which is why the note is not marked when the mail was
     refused, so the next visit can still try. */
  const readRow = async (pass) => {
    const local = loadJson(leadFile(pass));
    if (local) return local;
    if (!o.projectUrl) return null;
    const url = String(o.projectUrl).replace(/\/+$/, '') + '/functions/v1/get-lead?pass=' + encodeURIComponent(pass);
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
      const j = await r.json();
      return j && j.ok === true ? j.lead : null;
    } catch (e) { return null; }
  };


  /* ── the Sharjah Next stand form, on its own door ────────────────────────────────
     What the boss has settled so far is small: record the lead, and let the person through to Mira.
     The pass, the write-back and the resumable journey are all still un decided, so this door does
     the two things that are not in question and nothing else:
       · one JSON file per submission under DATA_DIR/sharjah-next, the same pattern the site's other
         forms use, so the stand can be read or exported with no database in the room;
       · the mirror into Supabase that every other form already uses, kind 'sharjah_next';
       · the three mails the event team wrote, to the visitor, the moment the form is in.
     The reference the mails show is minted here, in the shape their design drew (SN-XXXXXX), from
     the platform's own random source. It is the only identifier the row carries, which is the point:
     when the real backend is decided, this reference is the join key and nothing has to be rewritten. */
  const snFile = (ref) => path.join(DATA, 'sharjah-next', ref + '.json');
  /* the queue the three mails answer to, and the timer that walks it. It is mounted here rather than by a
     job on the box, because this is the process that knows where the stand's data directory is, and the
     interval is unref'd so it cannot keep a test run or a shutdown waiting for it. Without the read below
     it stays silent: no facts, no marks, nothing sent, and the next pass over tries again. */
  const snWatch = sharjahWatch.create({
    dir: DATA,
    log,
    readFacts: typeof o.watch === 'function' ? (refs) => o.watch(refs) : undefined,
  });
  snWatch.start();
  const SN_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';        // no I, O, L, 0, 1: read out loud at a stand
  function newRef() {
    for (let i = 0; i < 40; i++) {
      const bytes = crypto.randomBytes(6);
      let out = '';
      for (let n = 0; n < 6; n++) out += SN_ALPHA[bytes[n] % SN_ALPHA.length];
      const ref = 'SN-' + out;
      if (!fs.existsSync(snFile(ref))) return ref;
    }
    return 'SN-' + crypto.randomBytes(4).toString('hex').toUpperCase();   // 40 collisions is a broken disk, not a race
  }

  /* A person who fills this form twice is one person, and the reference is the number they read out at the
     counter, so it cannot be minted afresh on every attempt. It used to be, which is how a second submit,
     a name corrected or a change of mind about the package, carried a reference in its mail that existed
     nowhere in the stand's sheet. So it is looked for first: the newest record for that address lends its
     reference, the details update into that row, and nothing multiplies behind it. */
  const SN_LEAD_FILE = /^SN-[A-Z0-9]{6,10}\.json$/;      // the watch's own files sit in this folder beside these
  function refForEmail(email) {
    const want = String(email || '').trim().toLowerCase();
    if (!want) return '';
    let best = '', bestAt = 0;
    let names = [];
    try { names = fs.readdirSync(path.join(DATA, 'sharjah-next')); } catch (e) { return ''; }
    for (const n of names) {
      if (!SN_LEAD_FILE.test(n)) continue;
      let rec = null;
      try { rec = JSON.parse(fs.readFileSync(path.join(DATA, 'sharjah-next', n), 'utf8')); } catch (e) { continue; }
      if (!rec || String(rec.email || '').trim().toLowerCase() !== want) continue;
      const at = Date.parse(rec.at || '') || 0;
      if (at >= bestAt) { bestAt = at; best = String(rec.ref || n.slice(0, -5)); }
    }
    return /^[A-Z0-9-]{4,40}$/.test(best) ? best : '';
  }

  app.post('/api/sharjah-lead', o.bucket || ((req, res, next) => next()), rate(6, HITS_MAIL), async (req, res) => {
    const k = await core();
    res.set('Cache-Control', 'no-store');
    const form = k.readForm(req.body);
    if (!form.ok) return res.status(400).json({ ok: false, error: form.error });

    /* The mailbox proof, the same one the early access form answers to and the same single switch
       that turns it off for both (VERIFY_REQUIRE_FOR_MANAGE). It is looked at here without being
       spent, so someone refused for another reason can fix the field and press again with the code
       they already read, and it is spent only once the record is on disk. An address nobody could
       verify is refused with the name of the field, which is the one answer this page knows how to
       act on: the box under the email is already there, and opens. */
    const need = !!o.verify && o.verifyRequire !== false;
    const proof = String((req.body || {}).emailv || '');
    if (need && !o.verify.peek(form.contact.email, proof)) return res.status(400).json({ ok: false, error: 'emailv' });

    const ref = refForEmail(form.contact.email) || newRef();
    const record = {
      ref,
      at: new Date().toISOString(),
      source: 'sharjah-next-2026',
      full_name: form.contact.full_name,
      email: form.contact.email,
      phone: form.contact.phone,
      country_code: form.contact.country_code,
      consent: true,
    };
    try { saveJson(snFile(ref), record); }
    catch (e) { log('could not write the lead ' + ref + ': ' + e.message.slice(0, 90)); }

    /* the copy in the database, tried first and never waited on for long: a mirror that is down
       must not be able to lose a name that is already on disk */
    if (typeof o.pushLead === 'function') {
      try { Promise.resolve(o.pushLead('sharjah_next', record)).catch(() => {}); } catch (e) {}
    }

    /* one code, one lead: the proof is spent after the write, so a second submission with the same
       token is a second door to knock on, and nothing here can be replayed */
    if (need) o.verify.consume(form.contact.email, proof);

    /* the pass, minted here rather than by the page, so the stand behaves like the other entrance
       without handing a browser a second service to talk to: the mailbox check stays in front of
       every submission, the project's address never appears in the page, and Mira's write-back lands
       on one row for this person in sharjah_next_passes, which is what `page` decides.
       Off until it is switched on (SPARK_SN_PASS=on), because this file is also what a test run and
       a rehearsal execute, and none of those should be minting passes for people who do not exist.
       A pass that does not come back is not a refused lead: the record is already written, and the
       page opens Mira the way it did before the pass existed. */
    let pass = '';
    if (String(process.env.SPARK_SN_PASS || 'off').toLowerCase() !== 'off' && o.projectUrl) {
      try {
        const r = await fetch(String(o.projectUrl).replace(/\/+$/, '') + '/functions/v1/create-pass', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          /* only the fields that door reads, sent again by us rather than passed through: the body
             the visitor posted also holds the honeypot and the mailbox proof, and neither belongs in
             a second service */
          body: JSON.stringify({
            full_name: record.full_name, email: record.email, phone: record.phone,
            country_code: record.country_code, consent: true, source: record.source,
            _t: Number(req.body._t) || 0, ref, page: 'sharjah-next',
          }),
          signal: AbortSignal.timeout(4000),
        });
        const j = await r.json().catch(() => null);
        if (j && j.ok === true && k.isPass(String(j.pass || ''))) pass = String(j.pass);
      } catch (e) { log('create-pass did not answer for ' + ref + ': ' + String(e.message || e).slice(0, 70)); }
    }

    /* One line in the watch's queue, which is what makes the three mails answer to what happened rather
       than to this request: the congrats goes when the Brain's own write lands on the row, the paid receipt
       when the sheet says yes in Payment Completed, the nudge ninety minutes after this moment if the sheet
       still does not say yes. See lib/sharjah-watch.js.
       The two read through values are still honoured here, because a person at a desk who wants to see the
       three in an inbox should not have to sit through a conversation and a payment first:
         SPARK_SN_MAIL=submit  all three now, once per reference.
         SPARK_SN_MAIL=each    the same, again on every submit, with no duplicate rule.
       and off closes the mails and the watch both. */
    const mode = sharjahWatch.snMode();
    let mails = { sent: 0, failed: 0 };
    if (mode === 'submit' || mode === 'each') {
      mails = await mail.notifySparkSharjah({
        pass: ref, email: record.email, name: record.full_name, ref, pack: 'Beyond',
        each: mode === 'each',
      }) || mails;
    } else {
      try { snWatch.note({ ref, pass, at: record.at, email: record.email, name: record.full_name, pack: 'Beyond' }); }
      catch (e) { log('could not open the watch for ' + ref + ': ' + String(e.message || e).slice(0, 70)); }
    }
    log('sharjah next lead ' + ref + ' · ' + (mails.sent || 0) + ' mails sent'
      + (mails.failed ? ', ' + mails.failed + ' failed' : '') + (mode === 'off' ? ' (mail off)' : '')
      + (pass ? ' · pass minted' : ' · no pass'));
    return res.json({ ok: true, ref, pass, brain_url: o.brainUrl || '' });
  });

  app.post('/api/spark-thanks', o.bucket || ((req, res, next) => next()), rate(6, HITS_MAIL), async (req, res) => {
    const k = await core();
    const pass = String((req.body || {}).pass || '');
    res.set('Cache-Control', 'no-store');
    if (!k.isPass(pass)) return res.status(400).json({ ok: false, error: 'pass' });
    /* The three Sharjah Next mails are not this door's business: the stand's own submit sends them, up
       above, and a second door sending the same three would be six mails for one visitor. What is left
       here is the once-per-pass mark and the note for the other stand. */
    if (loadJson(thanksFile(pass))) return res.json({ ok: true, sent: false, reason: 'already' });

    const lead = await readRow(pass);
    const contact = (lead && lead.contact) || null;
    const email = contact ? k.normaliseEmail(contact.email) : '';
    if (!contact || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email) || email.length > 254) {
      /* the stand needs this line: it is the difference between "the door is closed" and "the
         mail was refused", and the first one means a function is missing from the project */
      log('receipt refused, no row for ' + pass + (o.projectUrl ? ' at ' + String(o.projectUrl).replace(/\/+$/, '') + '/functions/v1/get-lead' : ' and no project URL to ask'));
      return res.status(404).json({ ok: false, error: 'unknown' });
    }

    /* the row's source still decides who gets what below, so the mark of a Sharjah Next visitor stays
       here rather than in a guess about which event a pass came from */
    const snRow = String(lead.source || contact.source || '');

    /* The AI Everything note says "thank you for stopping by the Boasis stand at AI Everything", so it
       is only ever sent to a row from that stand. A Sharjah Next visitor gets the three mails above and
       nothing about another event, which is the one thing about this branch of the door that would
       otherwise read as a mistake in front of a client. */
    let r = { sent: 0, failed: 0 };
    if (snRow !== 'sharjah-next-2026') {
      r = await mail.notifySpark({ pass, email, name: contact.full_name || '' });
      if (!r || (!r.sent && r.failed)) return res.status(502).json({ ok: false, error: 'mail' });
    }
    try { saveJson(thanksFile(pass), { at: new Date().toISOString() }); }
    catch (e) { log('could not mark the receipt for ' + pass + ': ' + e.message.slice(0, 80)); }
    log('receipt sent for ' + pass);
    return res.json({ ok: true, sent: true });
  });

  return { leadFile, mailFile, thanksFile };
};
