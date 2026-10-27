/* The three triggers, each proved against the fact it answers to rather than against a date in a mail.
   A fake mailer and a fake read stand in for the two things this module is allowed to talk to, so the
   rules can be checked in a second rather than in an hour and a half, and nothing reaches an inbox. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.SPARK_SN_MAIL = '';           /* the default, which is the three rules rather than a read through */
const watch = require('../lib/sharjah-watch');

const refFor = (() => { let n = 0; return () => 'SN-T' + String(++n + 900000).slice(0, 6); })();

test('the congrats waits for the last write of the Brain and not for a step on the way', () => {
  const fn = require('fs').readFileSync(require('path').join(__dirname, '..', 'demo', 'supabase', 'functions', 'save-lead', 'index.js'), 'utf8');
  const at = fn.slice(fn.indexOf('function brainDone'), fn.indexOf('const refOf'));
  assert.match(at, /FINAL_STEPS\.indexOf\(last\) >= 0/, 'the rule is the named final step of the visit, that step and no other');
  assert.ok(!/steps_reached/.test(at) && !/turns/.test(at) && !/frozen/.test(at) && !/confirmed/.test(at),
    'and a step saved on the way, a turn counted, or a flag set early is progress rather than an application in, so none of them mails anybody');
  assert.match(fn, /const FINAL_STEPS = \['package'\];/,
    'and the name is the one the Brain writes at the end of this event, package, in a list so a second name is one word');
  const bare = require('fs').readFileSync(require('path').join(__dirname, '..', 'demo', 'supabase', 'paste', 'save-lead.js'), 'utf8');
  assert.match(bare, /const FINAL_STEPS = \['package'\];/, 'and the file you paste into the dashboard carries the same rule, not the old one');
});

test('a submit alone sends nothing, and the congrats waits for the Brain to write the row', async () => {
  const ref = 'SN-BRAIN1';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-watch-'));
  const sent = [];
  let asked = { SN_BRAIN1: null };
  const facts = { [ref]: { brain: false, paid: 'no', known: true } };
  const w = watch.create({
    dir, log: () => {},
    mail: { notifySparkSharjah: async (r, kinds) => { sent.push(kinds[0]); return { sent: 1 }; } },
    readFacts: async (want) => { asked[ref] = want.length; assert.ok(want[0].ref && 'pass' in want[0], 'the pair is what goes out'); return { ok: true, rows: facts }; },
  });
  w.note({ ref, at: new Date().toISOString(), email: 'a@b.co', name: 'Ada Lin' });

  await w.tick();
  assert.deepEqual(sent, [], 'a form with nothing written by the Brain mails nobody, which is the whole correction');
  assert.equal(asked[ref], 1, 'and it was asked about once, in one small call rather than one per lead');

  facts[ref] = { brain: true, paid: 'no', known: true };
  await w.tick();
  assert.deepEqual(sent, ['congrats'], 'the moment the Brain has saved a step, the congrats goes, and only that one');

  await w.tick();
  assert.deepEqual(sent, ['congrats'], 'and it never goes twice for the same reference');
});

test('the welcome letter follows the yes in the sheet, not the payment in the form', async () => {
  const ref = 'SN-PAID01';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-watch-'));
  const sent = [];
  const facts = { [ref]: { brain: true, paid: 'no', known: true } };
  const w = watch.create({
    dir, log: () => {},
    mail: { notifySparkSharjah: async (r, kinds) => { sent.push(kinds[0]); return { sent: 1 }; } },
    readFacts: async () => ({ ok: true, rows: facts }),
  });
  w.note({ ref, at: new Date(Date.now() - 10 * 60 * 1000).toISOString(), email: 'a@b.co', name: 'Ada Lin' });

  await w.tick();
  assert.deepEqual(sent, ['congrats'], 'the conversation is done, so the congrats is due, and no money has changed hands');

  facts[ref] = { brain: true, paid: 'yes', known: true };
  await w.tick();
  assert.deepEqual(sent, ['congrats', 'paid'], 'she ticked the yes at the counter, and that is the receipt');
  await w.tick();
  assert.equal(sent.length, 2, 'once, in either direction');
});

test('the nudge needs an hour and a half, a no, and a sheet that answered', async () => {
  const ref = 'SN-NAID01';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-watch-'));
  const sent = [];
  let paid = { brain: false, paid: 'no', known: true };
  const w = watch.create({
    dir, log: () => {},
    mail: { notifySparkSharjah: async (r, kinds) => { sent.push(kinds[0]); return { sent: 1 }; } },
    readFacts: async () => ({ ok: true, rows: { [ref]: paid } }),
  });
  w.note({ ref, at: new Date(Date.now() - 91 * 60 * 1000).toISOString(), email: 'a@b.co', name: 'Ada Lin' });

  await w.tick();
  assert.deepEqual(sent, ['reminder'], 'ninety one minutes with no answer from the Brain and a no in the sheet is the nudge');

  paid = { brain: false, paid: '', known: false };
  const quiet = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-watch-'));
  const sent2 = [];
  const w2 = watch.create({
    dir: quiet, log: () => {},
    mail: { notifySparkSharjah: async (r, kinds) => { sent2.push(kinds[0]); return { sent: 1 }; } },
    readFacts: async () => ({ ok: true, rows: { [ref]: { brain: false, paid: '', known: false } } }),
  });
  w2.note({ ref, at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), email: 'a@b.co', name: 'Ada Lin' });
  await w2.tick();
  assert.deepEqual(sent2, [], 'and when the sheet did not talk to us at all, nobody is chased about money on a guess');
});

test('a paid person is never nudged, and an unpaid one is not chased for ever', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-watch-'));
  const sent = [];
  const ref = 'SN-SHUT01';
  const w = watch.create({
    dir, log: () => {},
    mail: { notifySparkSharjah: async (r, kinds) => { sent.push(kinds[0]); return { sent: 1 }; } },
    readFacts: async () => ({ ok: true, rows: { [ref]: { brain: true, paid: 'yes', known: true } } }),
  });
  w.note({ ref, at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), email: 'a@b.co', name: 'Ada Lin' });
  await w.tick();
  assert.deepEqual(sent, ['congrats', 'paid'], 'both due at once, and the nudge that was already overdue is closed rather than sent');
  const state = JSON.parse(fs.readFileSync(w.stateFile(ref), 'utf8'));
  assert.equal(state.sent.reminder, 'not needed: paid', 'and the reason is written down, so a person reading the file later knows it was decided and not missed');
});

test('the watch runs on a five second beat, once at a time, over a queue that is empty most of the hour', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'lib', 'sharjah-watch.js'), 'utf8');
  assert.match(src, /const TICK_EVERY = 5 \* 1000;/, 'five seconds, which is what the boss asked for');
  assert.match(src, /if \(running\) return \{ checked: 0, sent: 0, why: 'busy' \}/,
    'and a pass that is still reading when the next beat comes is skipped rather than run twice, because two at once could mail the same letter before either wrote its mark');
  assert.match(src, /if \(!list\.length\) return \{ checked: 0, sent: 0 \};/,
    'and with nothing waiting there is no call at all, so the short beat costs the site nothing on a quiet hour');
});

test('every script in scripts/ still parses, because none of them is imported by the site', () => {
  const path = require('path'), fs2 = require('fs'), { execFileSync } = require('child_process');
  const d = path.join(__dirname, '..', 'scripts');
  const files = fs2.readdirSync(d).filter(f => f.slice(-3) === '.js');
  assert.ok(files.length >= 3, 'and there is something to check: ' + files.join(', '));
  for (const f of files) {
    try { execFileSync(process.execPath, ['--check', path.join(d, f)], { stdio: 'pipe' }); }
    catch (e) { assert.ok(false, f + ' does not parse, and a test suite that never loads it would never notice: ' + String(e.stderr || e.message).split('\n').slice(0, 3).join(' ')); }
  }
});

test('a second submit of the same reference does not re-arm the letters', async () => {
  const path = require('path'), fs2 = require('fs'), os2 = require('os');
  const dir = fs2.mkdtempSync(path.join(os2.tmpdir(), 'sn-twice-'));
  const made = [];
  const at = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();   // three hours ago, past the nudge
  const w = require('../lib/sharjah-watch').create({
    dir, log: () => {},
    mail: { notifySparkSharjah: async (rec, kinds) => { made.push(kinds[0]); return { sent: 1 }; } },
    readFacts: async () => ({ ok: true, rows: { 'SN-AGAIN01': { brain: true, paid: 'yes', known: true } } }),
  });
  const first = w.note({ ref: 'SN-AGAIN01', at, email: 'a@b.co', name: 'Ada', pack: 'Beyond+' });
  assert.ok(first && first.at === at, 'the clock is the first submit, which is what the hour and a half counts from');
  await w.tick();
  assert.deepEqual(made, ['congrats', 'paid'], 'both letters went once');

  const again = w.note({ ref: 'SN-AGAIN01', at: new Date().toISOString(), email: 'a@b.co', name: 'Ada' });
  assert.equal(again.at, at, 'and a second submit of the same reference keeps the old clock rather than restarting it');
  assert.ok(again.sent.congrats && again.sent.paid, 'and it keeps the marks, so nothing that was posted is posted again');
  assert.equal(again.pack, 'Beyond+', 'while what the person typed is refreshed, so the letter still reads their own package');
  const r = await w.tick();
  assert.equal(r.sent, 0, 'and the next pass has nothing to send');
  assert.deepEqual(made, ['congrats', 'paid'], 'still exactly two letters for that visitor');
});

test('a letter goes once even when the box runs this app twice', async () => {
  const path = require('path'), fs2 = require('fs'), os2 = require('os');
  const dir = fs2.mkdtempSync(path.join(os2.tmpdir(), 'sn-two-'));
  const made = [];
  const watch = require('../lib/sharjah-watch');
  const mk = (tag) => watch.create({
    dir, log: () => {},
    mail: { notifySparkSharjah: async (rec, kinds) => { made.push(tag + ':' + rec.ref + ':' + kinds[0]); return { sent: 1 }; } },
    readFacts: async () => ({ ok: true, rows: { 'SN-TWICE1': { brain: true, paid: 'no', known: true } } }),
  });
  const a = mk('a'), b = mk('b');
  a.note({ ref: 'SN-TWICE1', at: new Date().toISOString(), email: 't@e.co', name: 'Two' });
  const r1 = await a.tick();
  const r2 = await b.tick();
  assert.equal(r1.sent, 1, 'the first one to look sent it');
  assert.equal(r2.sent, 0, 'the second found the claim on the disk and kept quiet, which is the shape of a box with two copies of the app running');
  assert.deepEqual(made, ['a:SN-TWICE1:congrats'], 'and exactly one letter was made between the two of them');
  const claims = fs2.readdirSync(path.join(dir, 'sharjah-next')).filter(n => n.indexOf('claim-') === 0);
  assert.deepEqual(claims, ['claim-SN-TWICE1-congrats'], 'and the claim is a file beside the queue, so a restart cannot forget it');

  const dir2 = fs2.mkdtempSync(path.join(os2.tmpdir(), 'sn-fail-'));
  let tries = 0;
  const c = watch.create({
    dir: dir2, log: () => {},
    mail: { notifySparkSharjah: async () => { tries++; return tries === 1 ? { sent: 0 } : { sent: 1 }; } },
    readFacts: async () => ({ ok: true, rows: { 'SN-FAIL01': { brain: true, paid: 'no', known: true } } }),
  });
  c.note({ ref: 'SN-FAIL01', at: new Date().toISOString(), email: 'f@e.co', name: 'Fail' });
  const claim = path.join(dir2, 'sharjah-next', 'claim-SN-FAIL01-congrats');
  const f1 = await c.tick();
  assert.equal(f1.sent, 0, 'the first pass could not send');
  assert.ok(!fs2.existsSync(claim),
    'and it handed the claim back rather than leaving that person without a letter for the rest of the event');
  const f2 = await c.tick();
  assert.equal(f2.sent, 1, 'so the next pass sent it, and a letter that never reached the postbag is not a letter marked as posted');
  assert.ok(fs2.existsSync(claim), 'and a letter that did go keeps its claim, so a restart cannot post it a second time');
});

test('a long queue is read to the end in one pass, and an old row stops being asked about', async () => {
  const path = require('path'), fs2 = require('fs'), os2 = require('os');
  const src = fs2.readFileSync(path.join(__dirname, '..', 'lib', 'sharjah-watch.js'), 'utf8');
  assert.match(src, /for \(let i = 0; i < list\.length; i \+= BATCH\)/,
    'one pass walks every open row in batches, so a lead cannot sit behind the same first forty for the whole event');
  assert.match(src, /out\.sort\(\(x, y\) => String\(y\.at/, 'and it walks them newest first, which is who is actually waiting for a mail');
  assert.match(src, /if \(age > STALE_AFTER && \(s\.sent\.congrats \|\| s\.sent\.reminder\)\)/,
    'and a row that has had its say and never got a yes is closed a day and a bit later rather than read for a week');

  const dir = fs2.mkdtempSync(path.join(os2.tmpdir(), 'sn-queue-'));
  let asked = [];
  const w = require('../lib/sharjah-watch').create({
    dir, log: () => {},
    mail: { notifySparkSharjah: async () => ({ sent: 1 }) },
    readFacts: async (want) => { asked.push(...want.map(x => x.ref)); return { ok: true, rows: {} }; },
  });
  const many = 45;                                     // BATCH is forty, so this is two calls or one starvation
  for (let n = 0; n < many; n++) {
    w.note({ ref: 'SN-Q' + String(100000 + n), at: new Date(Date.now() - n * 60000).toISOString(), email: 'a@b.co', name: 'N' });
  }
  const r = await w.tick();
  assert.equal(r.checked, many, 'all of them were looked at in one pass');
  assert.equal(new Set(asked).size, many, 'and every reference was actually asked about, not the first forty');
  assert.equal(r.reads, 2, 'in two reads, which is what one call can carry');

  asked = [];
  const old = w.note({ ref: 'SN-OLDX1', at: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(), email: 'a@b.co', name: 'Old' });
  old.stale = ''; old.sent.reminder = new Date().toISOString();
  require('../lib/sharjah-watch');                      /* the module is loaded; the mark is written by hand to prove the reader honours it */
  fs2.writeFileSync(w.stateFile('SN-OLDX1'), JSON.stringify(Object.assign({}, old, { stale: new Date().toISOString(), sent: { congrats: '', paid: '', reminder: new Date().toISOString() } })));
  const r2 = await w.tick();
  assert.ok(!asked.includes('SN-OLDX1'), 'and the closed row is not asked about again, so yesterday does not eat today');
  assert.equal(r2.checked, many, 'the queue is the same length as before, without the closed one');
});

test('the read through and the closed value still work from one variable', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-watch-'));
  const ref = 'SN-OFFX01';
  const made = [];
  const w = watch.create({
    dir, log: () => {},
    mail: { notifySparkSharjah: async (r, kinds) => { made.push(kinds[0]); return { sent: 1 }; } },
    readFacts: async () => ({ ok: true, rows: {} }),
  });
  w.note({ ref, at: new Date().toISOString(), email: 'a@b.co', name: 'Ada Lin' });

  process.env.SPARK_SN_MAIL = 'off';
  assert.deepEqual((await w.tick()).why, 'off', 'off closes the watch as surely as it closes the door');
  assert.deepEqual(made, [], 'and nothing leaves');

  process.env.SPARK_SN_MAIL = 'submit';
  assert.equal((await w.tick()).why, 'read through', 'in the read through the watch stands aside, because the submit already sent all three');
  process.env.SPARK_SN_MAIL = '';
});

test('a lead is never opened into the queue twice, and a broken reference is not one at all', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-watch-'));
  const ref = 'SN-DUPX01';
  let calls = 0;
  const w = watch.create({
    dir, log: () => {},
    mail: { notifySparkSharjah: async () => { calls++; return { sent: 1 }; } },
    readFacts: async () => ({ ok: true, rows: { [ref]: { brain: true, paid: 'no', known: true } } }),
  });
  assert.equal(w.note({ ref, email: 'a@b.co', name: 'Ada' }).ref, ref, 'a good reference opens a file');
  assert.equal(w.note({ ref: 'drop table', email: 'a@b.co' }), null, 'and a name that is not one of ours is refused before it can be a file name');
  assert.ok(!fs.existsSync(path.join(dir, 'sharjah-next', 'sn-state-drop table.json')), 'nothing was written for it either');
  const files = fs.readdirSync(path.join(dir, 'sharjah-next'));
  assert.equal(files.length, 1, 'one file for one lead, and the mode is 0600 on the way in');
  assert.equal(fs.statSync(path.join(dir, 'sharjah-next', files[0])).mode & 0o777, 0o600);
});
