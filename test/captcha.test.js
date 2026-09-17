const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const fs = require('fs'); const path = require('path'); const os = require('os');
const crypto = require('crypto');

const captcha = require('../lib/captcha');
const { solve } = require('../js/captcha');
const { withCaptcha } = require('./helpers/captcha');
const { inspect } = require('../lib/protect');

/* The captcha is a promise to the owner: a script cannot post the forms cheaply any more.
   These tests hold that promise on both halves — the maths, and the door on the wire. */

/* ── the maths, without a server ─────────────────────────────────────────────── */
test('a fresh challenge is solvable, and only with its own signature', () => {
  const c = captcha.makeChallenge('secret-one');
  const number = captcha.solveChallenge(c);
  assert.equal(typeof number, 'number', 'the puzzle must be solvable at all');
  assert.equal(number >= 0 && number <= c.maxNumber, true, 'the answer must sit in the stated range');
  assert.equal(c.algorithm, 'SHA-256');

  const payload = captcha.toPayload({ ...c, number });
  assert.equal(captcha.verify('secret-one', payload).ok, true, 'the honest answer must pass');
  assert.equal(captcha.verify('secret-two', payload).why, 'signature', 'a different secret must not');
});

test('the browser half and the server half agree', async () => {
  /* js/captcha.js is the code that runs in a visitor's browser. It is the same file here,
     so this is the one test that can prove the two halves did not drift apart. */
  const c = captcha.makeChallenge('agree', { maxNumber: 4000 });
  const number = await solve(c);
  assert.equal(number, captcha.solveChallenge(c), 'the browser solver finds the same answer as the server');
  assert.equal(captcha.verify('agree', captcha.toPayload({ ...c, number })).ok, true);
});

test('a made-up answer is refused, and so is a made-up challenge', () => {
  const c = captcha.makeChallenge('s3');
  const wrong = captcha.toPayload({ ...c, number: (captcha.solveChallenge(c) + 1) % c.maxNumber });
  assert.equal(captcha.verify('s3', wrong).why, 'wrong', 'a guessed number must fail the hash');

  /* the whole reason the challenge is signed: without it a script would mint its own,
     trivially easy puzzle and solve it in a microsecond */
  const forged = { ...c, maxNumber: 1, challenge: crypto.createHash('sha256').update(c.salt + 0).digest('hex') };
  assert.equal(captcha.verify('s3', captcha.toPayload({ ...forged, number: 0 })).why, 'signature');
});

test('it expires, and it refuses junk without throwing', () => {
  const old = captcha.makeChallenge('s4', { ttlMs: 1 });
  return new Promise(resolve => setTimeout(() => {
    const n = captcha.solveChallenge(old);
    assert.equal(captcha.verify('s4', captcha.toPayload({ ...old, number: n })).why, 'expired');
    for (const junk of ['', 'x', 'not base64 at all', Buffer.from('[]').toString('base64'),
                        Buffer.from('{"algorithm":"MD5"}').toString('base64'), 'a'.repeat(5000), null, 42]) {
      assert.doesNotThrow(() => captcha.verify('s4', junk), 'junk must never throw');
      assert.equal(captcha.verify('s4', junk).ok, false);
    }
    resolve();
  }, 20));
});

test('a solved puzzle cannot be posted twice', () => {
  const c = captcha.makeChallenge('s5');
  const payload = captcha.toPayload({ ...c, number: captcha.solveChallenge(c) });
  const first = captcha.verify('s5', payload);
  assert.equal(first.ok, true);
  captcha.consume(first.tag, first.expires);            // a real send burns it
  assert.equal(captcha.verify('s5', payload).why, 'replay');
  assert.equal(captcha.verify('s5', captcha.toPayload({ ...captcha.makeChallenge('s5'), number: 0 })).ok, false,
    'and a new puzzle is unaffected by the old one being spent');
});

/* ── the door, on a real server ──────────────────────────────────────────────── */
const ROOT = path.resolve(__dirname, '..');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'boasis-captcha-'));
let proc, base;

const start = async env => {
  proc = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT, env: { ...process.env, PORT: '0', DATA_DIR: DATA, MAIL_DRY_RUN: '1', VISITOR_SALT: 't', RATE_LIMIT_FORMS_PER_MIN: '1000', MAIL_MAX_PER_HOUR: '10000', MAIL_MAX_PER_DAY: '10000', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('did not start: ' + log)), 15000);
    proc.stdout.on('data', d => { log += d; if (/port \d{2,6}/.test(log)) { clearTimeout(t); res(); } });
    proc.stderr.on('data', d => { log += d; });
    proc.on('exit', c => rej(new Error('exited ' + c + ': ' + log)));
  });
  base = 'http://127.0.0.1:' + /port (\d+)/.exec(log)[1];
  return base;
};
const stop = () => { if (proc) proc.kill('SIGTERM'); proc = null; };
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const form = extra => ({ name: 'Amina Al Mazroui', email: 'amina@example.com', intent: 'standard', phone: '+971501234567', _t: Date.now() - 12000, ...extra });

test('the challenge endpoint answers with a signed puzzle, and the guard lets it through', async () => {
  assert.equal(inspect('/api/captcha').ok, true, 'the guard must not 404 the endpoint the widget calls');
  await start();
  try {
    const r = await fetch(base + '/api/captcha');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store', 'a cached puzzle would be reusable');
    const c = await r.json();
    for (const k of ['algorithm', 'challenge', 'salt', 'maxNumber', 'expires', 'signature']) {
      assert.ok(c[k] !== undefined, 'the challenge must carry ' + k);
    }
    assert.match(c.signature, /^[a-f0-9]{64}$/, 'signed, not merely declared');
  } finally { stop(); }
});

test('a form without the captcha is refused, with the captcha it is accepted', async () => {
  await start();
  try {
    const bare = await post('/api/contact', form({ message: 'Hello there, I would like to know more.' }));
    assert.equal(bare.status, 400, 'a script that skips the puzzle must not reach the form');
    assert.deepEqual(await bare.json(), { ok: false, errors: ['captcha'] });

    const solved = await post('/api/contact', await withCaptcha(base, form({ message: 'Hello there, I would like to know more.' })));
    assert.equal(solved.status, 200, 'a solved puzzle must let the form through');
    assert.equal((await solved.json()).ok, true);
  } finally { stop(); }
});

test('a solved puzzle is spent by the send it authorised, and cannot be replayed', async () => {
  await start();
  try {
    const body = await withCaptcha(base, form({ message: 'Hello there, the first send.' }));
    const first = await post('/api/contact', body);
    assert.equal(first.status, 200);
    const again = await post('/api/contact', { ...body, message: 'And a second one with the same puzzle.' });
    assert.equal(again.status, 400, 'one puzzle authorises one send, not two');
    assert.deepEqual(await again.json(), { ok: false, errors: ['captcha'] });
  } finally { stop(); }
});

test('a form error does not burn the puzzle, so an honest visitor fixes and resends', async () => {
  await start();
  try {
    const body = await withCaptcha(base, form({ email: 'not-an-address', message: 'A proper message, one bad field.' }));
    const bad = await post('/api/contact', body);          // the address is refused
    assert.equal(bad.status, 400);
    const errors = (await bad.json()).errors;
    assert.ok(errors.includes('email'), 'the fault must be the field: ' + errors.join(','));
    assert.ok(!errors.includes('captcha'), 'and not the puzzle');
    const fixed = await post('/api/contact', { ...body, email: 'amina@example.com' });
    assert.equal(fixed.status, 200, 'the same solved puzzle must still work after a field error');
  } finally { stop(); }
});

test('the traps still decide first, and still decide silently', async () => {
  await start();
  try {
    /* No captcha at all here: a trapped post never reaches that door, so the answer stays
       the fake success it has always been. This is the ordering the forms depend on. */
    for (const trap of [{ company_website: 'http://pills' }, { hp: 'x' }, { _t: Date.now() }, { _t: undefined }]) {
      const r = await post('/api/waitlist', { name: 'Bot', email: 'bot@x.co', intent: 'standard', ...trap });
      assert.equal(r.status, 200, JSON.stringify(trap) + ' must be answered, not refused');
      assert.deepEqual(await r.json(), { ok: true });
    }
  } finally { stop(); }
});

test('CAPTCHA_DISABLED=1 is the way out if the widget ever breaks', async () => {
  await start({ CAPTCHA_DISABLED: '1' });
  try {
    const r = await post('/api/contact', form({ message: 'Sent while the captcha is switched off.' }));
    assert.equal(r.status, 200, 'the kill switch must actually open the door');
  } finally { stop(); }
});

test('the three forms all carry the box, and the page loads its script', async () => {
  await start();
  try {
    for (const page of ['/', '/contact.html']) {
      const html = await (await fetch(base + page)).text();
      const boxes = (html.match(/data-captcha/g) || []).length;
      const expected = page === '/' ? 2 : 1;             // demo and manage on the home page
      assert.equal(boxes >= expected, true, page + ' must carry its captcha box (' + boxes + ' found)');
      assert.ok(html.includes('name="altcha"'), page + ' must post the answer in a field named altcha');
      assert.ok(html.includes('/js/captcha.js'), page + ' must load the widget that solves it');
    }
  } finally { stop(); }
});

after(() => { try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) {} });
