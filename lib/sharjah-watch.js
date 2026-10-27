/* The three Sharjah Next mails, each sent when the thing it answers actually happens.
   The stand's own submit used to send all three at once, which read badly: a person who had paid nothing
   was told their payment was confirmed, and was nudged about the money in the same minute. So the moment
   each mail goes is decided here instead, from two facts the stand can check:

     congrats   once Mira's side has written this visitor's row. That write is the proof the conversation
                is over, and it is the only proof we have that the person actually spoke to the Brain.
     paid       once the sheet says yes in Payment Completed. She sets it at the counter, so this mail is
                the receipt for real money and never for an imagined one.
     reminder   ninety minutes after the form, and only if the sheet still does not say yes.

   Nothing here polls the sheet cell by cell in the background of a request, and nothing is asked of a
   second service: one read per pass, in one call, on a timer inside the app. If that read does not
   answer, no mark is written, so the next pass over tries again and a visitor cannot be skipped by an
   outage. `SPARK_SN_MAIL` still decides the habit: `live` (nothing set) is the three rules above,
   `submit` and `each` are the read through, where all three go at the submit so somebody at a desk can
   look at them, and `off` closes the whole thing, timer included. */

const fs = require('fs');
const path = require('path');

const MIN = 60 * 1000;
const REMIND_AFTER = 90 * MIN;          // the event team's own hour and a half
const TICK_EVERY = 5 * MIN;
const BATCH = 40;                       // refs per read, so one pass is one small call
const STATE_PREFIX = 'sn-state-';

const snMode = () => String(process.env.SPARK_SN_MAIL || 'live').toLowerCase();
const nowIso = () => new Date().toISOString();
const closed = s => !!(s.sent && s.sent.congrats) && !!(s.sent && s.sent.paid) && !!(s.sent && s.sent.reminder);

function create(o = {}) {
  const dir = o.dir;
  const log = typeof o.log === 'function' ? o.log : () => {};
  /* taken only when nobody handed one in, so the rules can be read, tested and reasoned about without
     loading a transport this module never uses by itself */
  const mailer = o.mail || require('./mailer');
  const readFacts = o.readFacts;         // (refs) => { ok, rows: { ref: { brain, paid } } }
  const stateFile = ref => path.join(dir, 'sharjah-next', STATE_PREFIX + ref + '.json');

  /* the file is written before the bytes land for the same reason the lead is: on a shared box every
     write is readable by a stranger for a moment at the default mode, and a ref with an email in it is
     not something to leave lying around */
  function writeState(s) {
    const f = stateFile(s.ref);
    const tmp = f + '.' + process.pid + '.tmp';
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(s));
    try { fs.chmodSync(tmp, 0o600); } catch (e) {}
    fs.renameSync(tmp, f);
  }

  /* opened at the submit, and the only moment anything is asked of anybody: from then on this file is
     the queue, so a lead that was never written here is invisible to the watch and to the mails */
  function note(record) {
    const ref = String((record && record.ref) || '');
    if (!/^[A-Z0-9-]{4,40}$/.test(ref)) return null;
    const s = {
      ref,
      pass: String(record.pass || ''),
      at: record.at || nowIso(),
      email: String(record.email || ''),
      name: String(record.name || ''),
      pack: String(record.pack || 'Beyond'),
      sent: { congrats: '', paid: '', reminder: '' },
    };
    try { writeState(s); } catch (e) { log('could not open the watch for ' + ref + ': ' + String(e.message || e).slice(0, 70)); }
    return s;
  }

  function open_() {
    const d = path.join(dir, 'sharjah-next');
    let names = [];
    try { names = fs.readdirSync(d); } catch (e) { return []; }
    const out = [];
    for (const n of names) {
      if (n.indexOf(STATE_PREFIX) !== 0 || n.slice(-5) !== '.json') continue;
      let s = null;
      try { s = JSON.parse(fs.readFileSync(path.join(d, n), 'utf8')); } catch (e) { continue; }
      if (s && s.ref && s.sent && !closed(s) && !s.sent.paid) out.push(s);
    }
    return out;
  }

  const recordFor = s => ({
    pass: s.ref,                            /* one key per reference and per mail, which is what stops a
                                                second tick from sending the same letter twice */
    email: s.email, name: s.name, ref: s.ref, pack: s.pack,
  });

  async function tick() {
    if (snMode() === 'off') return { checked: 0, sent: 0, why: 'off' };
    if (snMode() === 'submit' || snMode() === 'each') return { checked: 0, sent: 0, why: 'read through' };
    if (typeof readFacts !== 'function') return { checked: 0, sent: 0, why: 'no read' };
    const list = open_().slice(0, BATCH);
    if (!list.length) return { checked: 0, sent: 0 };

    /* the pass goes with the reference on purpose. The Brain updates the pass row that create-pass left
       there, it never opens a new one, and the reference is only inside that row's data if the stand had a
       pass to hand over when it asked for one. So the pair is what identifies a visitor, and a reference
       on its own is a good question but not a reliable answer. */
    const facts = await readFacts(list.map(s => ({ ref: s.ref, pass: s.pass || '' })));
    if (!facts || facts.ok !== true) return { checked: list.length, sent: 0, why: (facts && facts.why) || 'no answer' };
    const all = facts.rows || {};
    const rows = Object.assign({}, all);
    const sheetSaid = typeof rows.__sheet === 'string' ? rows.__sheet : '';
    delete rows.__sheet;
    let sent = 0;

    for (const s of list) {
      const f = rows[s.ref] || {};
      const age = Date.now() - Date.parse(s.at || '');
      let touched = false;

      if (!s.sent.congrats && f.brain === true) {
        sent += await one(s, 'congrats');
        s.sent.congrats = nowIso();
        touched = true;
      }
      if (!s.sent.paid && String(f.paid || '').toLowerCase() === 'yes') {
        sent += await one(s, 'paid');
        s.sent.paid = nowIso();
        /* a person who has paid is not owed a nudge about money, and they must not get one ninety
           minutes after the form just because the payment happened to land first */
        if (!s.sent.reminder) s.sent.reminder = 'not needed: paid';
        touched = true;
      }
      /* `known` is the difference between "the sheet says no" and "the sheet did not talk to us", and a
         person is only ever chased about money on the strength of the first one. An unread sheet leaves the
         row in the queue, so the next pass over asks again rather than guessing. */
      if (!s.sent.reminder && f.known === true && String(f.paid || '').toLowerCase() !== 'yes'
        && Date.now() - Date.parse(s.at || '') >= REMIND_AFTER) {
        sent += await one(s, 'reminder');
        s.sent.reminder = nowIso();
        touched = true;
      }
      /* an old row with nothing to wait for any more, which happens when the sheet says no and the
         person walked away: it stops being read rather than sitting in the queue for the rest of the
         event. Ninety minutes is the whole window the rules need. */
      if (!touched && f.known === true && s.sent.congrats && String(f.paid || '').toLowerCase() !== 'yes'
        && age > 12 * 60 * MIN) { s.sent.reminder = 'not needed: nothing changed'; touched = true; }
      if (touched) { try { writeState(s); } catch (e) { log('could not mark ' + s.ref + ': ' + String(e.message || e).slice(0, 70)); } }
    }
    /* one quiet line when a pass read the queue and decided nothing, because that is the moment a person
       at a desk wants to know whether the sheet said no, said nothing, or would not talk to us */
    if (!sent && list.length) log('watch: ' + list.length + ' waiting, nothing due (sheet read: ' + (sheetSaid || 'not told') + ')');
    return { checked: list.length, sent, sheet: sheetSaid };
  }

  async function one(s, kind) {
    try {
      const r = await mailer.notifySparkSharjah(recordFor(s), [kind]);
      const n = (r && r.sent) || 0;
      log('sharjah ' + kind + ' for ' + s.ref + (n ? '' : ', not sent') + (r && r.failed ? ', ' + r.failed + ' failed' : ''));
      return n;
    } catch (e) {
      log('sharjah ' + kind + ' failed for ' + s.ref + ': ' + String(e.message || e).slice(0, 90));
      return 0;
    }
  }

  function start() {
    if (snMode() === 'off') return null;
    if (typeof setInterval !== 'function') return null;
    const t = setInterval(() => { tick().catch(e => log('watch: ' + String(e && e.message || e).slice(0, 90))); }, TICK_EVERY);
    if (t && typeof t.unref === 'function') t.unref();   /* never the reason a test process stays alive */
    return t;
  }

  return { note, tick, start, stateFile };
}

module.exports = { create, snMode, REMIND_AFTER, TICK_EVERY, BATCH, STATE_PREFIX };
