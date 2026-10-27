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
