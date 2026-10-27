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
const TICK_EVERY = 5 * 1000;
/* five seconds rather than five minutes, because the boss asked for the mail to go as soon as the sheet or
   the visit says so, and the wait was the thing that read as a fault. It is cheap to ask that here: with
   nothing waiting in the queue a pass is one folder listing and no call at all, so a quiet hour costs the
   site nothing, and the read of the sheet and of the row only happens for a reference that is still open. */
const BATCH = 40;                       // refs per read, so one pass is a few small calls rather than one big one
const STALE_AFTER = 26 * 60 * MIN;      // longer than the event is wide, see the last rule in once()
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
      if (s && s.ref && s.sent && !s.stale && !closed(s) && !s.sent.paid) out.push(s);
    }
    /* newest first, which is the order a queue at a desk should be read in: the person who has just
       finished is the one whose mail is due, and somebody from yesterday has already been told */
    out.sort((x, y) => String(y.at || '').localeCompare(String(x.at || '')));
    return out;
  }

  const recordFor = s => ({
    pass: s.ref,                            /* one key per reference and per mail, which is what stops a
                                                second tick from sending the same letter twice */
    email: s.email, name: s.name, ref: s.ref, pack: s.pack,
  });

  /* One claim per letter, on the disk, taken before anything is sent. The mark in the state file is written
     after a send, which leaves a window, and a box that runs this app twice has two in-memory duplicate rules
     rather than one, so the only thing two processes can agree on is a file that can be created once. A
     filesystem that will not answer is allowed through rather than silenced: a letter about money that
     arrives twice is a smaller fault than one that never arrives. */
  function claimFile(ref, kind) { return path.join(dir, 'sharjah-next', 'claim-' + ref + '-' + kind); }
  function claim(s, kind) {
    try { fs.writeFileSync(claimFile(s.ref, kind), nowIso(), { flag: 'wx' }); return true; }
    catch (e) {
      if (e && e.code === 'EEXIST') return false;
      log('the claim for ' + s.ref + ' ' + kind + ' could not be written: ' + String(e.message || e).slice(0, 60));
      return true;
    }
  }
  function unclaim(s, kind) { try { fs.unlinkSync(claimFile(s.ref, kind)); } catch (e) { /* nothing to undo */ } }

  /* the send with its claim in front of it: nothing goes twice, and a letter that did not go at all is
     handed back to the next pass rather than left marked as sent */
  async function sendClaimed(s, kind) {
    if (!claim(s, kind)) return { sent: 0, held: true };
    const n = await one(s, kind);
    if (!n) unclaim(s, kind);
    return { sent: n };
  }

  /* one at a time, however often it is asked: the read of the sheet can take seconds, and two passes over
     the same queue at once would mail the same letter twice before either had written its mark down */
  let running = false;
  async function tick() {
    if (running) return { checked: 0, sent: 0, why: 'busy' };
    running = true;
    try { return await once(); } finally { running = false; }
  }

  async function once() {
    if (snMode() === 'off') return { checked: 0, sent: 0, why: 'off' };
    if (snMode() === 'submit' || snMode() === 'each') return { checked: 0, sent: 0, why: 'read through' };
    if (typeof readFacts !== 'function') return { checked: 0, sent: 0, why: 'no read' };
    const list = open_();
    if (!list.length) return { checked: 0, sent: 0 };

    /* Every open row is asked about in one pass, in batches of the size a single call can carry. Taking
       only the first batch was fine at five minutes and is not fine at five seconds: a lead that missed its
       turn would sit behind the same neighbours for the rest of the event, and the queue at a stand of two
       days is more people than one call holds. Newest first, so the person who has just finished with Mira
       is never the one left over at the end of a long list. */
    let sent = 0, reads = 0, sheetSaid = '';
    for (let i = 0; i < list.length; i += BATCH) {
      const part = list.slice(i, i + BATCH);
      /* the pass goes with the reference on purpose. The Brain updates the pass row that create-pass left
         there, it never opens a new one, and the reference is only inside that row's data if the stand had a
         pass to hand over when it asked for one. So the pair is what identifies a visitor, and a reference
         on its own is a good question but not a reliable answer. */
      const facts = await readFacts(part.map(s => ({ ref: s.ref, pass: s.pass || '' })));
      reads++;
      if (!facts || facts.ok !== true) { sheetSaid = (facts && facts.why) || 'no answer'; continue; }
      const rows = Object.assign({}, facts.rows || {});
      if (typeof rows.__sheet === 'string') sheetSaid = rows.__sheet;
      delete rows.__sheet;

      for (const s of part) {
        const f = rows[s.ref] || {};
        const age = Date.now() - Date.parse(s.at || '');
        let touched = false;

        if (!s.sent.congrats && f.brain === true) {
          const r = await sendClaimed(s, 'congrats');
          if (r.sent) { sent += r.sent; s.sent.congrats = nowIso(); touched = true; }
        }
        if (!s.sent.paid && String(f.paid || '').toLowerCase() === 'yes') {
          const r = await sendClaimed(s, 'paid');
          if (r.sent) {
            sent += r.sent;
            s.sent.paid = nowIso();
            /* a person who has paid is not owed a nudge about money, and they must not get one ninety
               minutes after the form just because the payment happened to land first */
            if (!s.sent.reminder) s.sent.reminder = 'not needed: paid';
            touched = true;
          }
        }
        /* `known` is the difference between "the sheet says no" and "the sheet did not talk to us", and a
           person is only ever chased about money on the strength of the first one. An empty cell is the
           first case and not the second: nothing has to be ticked `no` to start the hour and a half, the
           clock runs from the form, and a blank line in her column is a person who has not paid. */
        if (!s.sent.reminder && f.known === true && String(f.paid || '').toLowerCase() !== 'yes'
          && age >= REMIND_AFTER) {
          const r = await sendClaimed(s, 'reminder');
          if (r.sent) { sent += r.sent; s.sent.reminder = nowIso(); touched = true; }
        }
        /* A day and a bit is wider than this event, so a row that has had its nudge and never got a yes
           stops being read every five seconds for the rest of the week rather than sitting in the queue
           forever. Nothing is lost by it: a yes arriving the day after the stand closed is not a person
           waiting at a counter. */
        if (age > STALE_AFTER && (s.sent.congrats || s.sent.reminder)) { s.stale = nowIso(); touched = true; }
        if (touched) { try { writeState(s); } catch (e) { log('could not mark ' + s.ref + ': ' + String(e.message || e).slice(0, 70)); } }
      }
    }
    /* one quiet line when a pass read the queue and decided nothing, because that is the moment a person
       at a desk wants to know whether the sheet said no, said nothing, or would not talk to us */
    if (!sent && list.length) log('watch: ' + list.length + ' waiting, nothing due (sheet read: ' + (sheetSaid || 'not told') + ', ' + reads + ' reads)');
    return { checked: list.length, sent, sheet: sheetSaid, reads };
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
