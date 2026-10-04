const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const fs = require('fs'); const path = require('path'); const os = require('os');

/* The mailbox code, whole: it exists so that joining the list requires reading an inbox.
   A real server, raw posts, the same shapes a browser sends — three tries, one use, a
   per-address cooldown, and no signup without the mailbox. If any of that ever loosens,
   the early-access list starts meaning nothing, and this file is what notices. */

const ROOT = path.resolve(__dirname, '..');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'boasis-verify-'));
let proc, base;

function boot(dataDir, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, BOASIS_NO_ENV_FILE: '1', PORT: '0', DATA_DIR: dataDir, MAIL_DRY_RUN: '1', VISITOR_SALT: 'v', RATE_LIMIT_FORMS_PER_MIN: '10000', RATE_LIMIT_VISITS_PER_MIN: '10000', MAIL_MAX_PER_HOUR: '10000', MAIL_MAX_PER_DAY: '10000', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((res, rej) => {
    let log = '';
    const t = setTimeout(() => rej(new Error('server did not start: ' + log)), 15000);
    p.stdout.on('data', d => { log += d; if (/port \d{2,6}/.test(log)) { clearTimeout(t); res({ p, base: 'http://127.0.0.1:' + /port (\d+)/.exec(log)[1] }); } });
    p.on('exit', c => rej(new Error('exited ' + c + ': ' + log)));
  });
}
async function up(env = {}) {
  const b = await boot(DATA, env);
  proc = b.p;
  return b.base;
}
before(async () => { base = await up(); });
after(() => { proc.kill('SIGTERM'); try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) {} });

const raw = (p, body) => fetch(base + p, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}).then(async r => ({ status: r.status, j: await r.json().catch(() => ({})) }));
const PATIENT = () => ({ _t: Date.now() - 60000 });
const send = (email, extra = {}) => raw('/api/verify-email/send', { email, ...PATIENT(), ...extra });
const read = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
let n = 0;
const fresh = () => `v${++n}@example.com`;

test('the send answers 400 for a bad address, and both routes exist at all', async () => {
  const r = await raw('/api/verify-email/send', { email: 'not-an-email', ...PATIENT() });
  assert.equal(r.status, 400, 'a broken address is told, not silently accepted');
  assert.ok(r.j.errors.includes('email'));
  const v = await raw('/api/verify-email/verify', { email: 'not-an-email', code: '123456' });
  assert.equal(v.status, 400, 'and so is one being checked');
  const guard = await fetch(base + '/api/verify-email/send/x');
  assert.equal(guard.status, 404, 'a child of the route is the guard\'s 404, never a page');
});

test('only a mail that is not really being sent hands the code back on screen', async () => {
  const r = await send(fresh());
  assert.equal(r.status, 200);
  assert.equal(r.j.ok, true);
  assert.equal(typeof r.j.devCode, 'string', 'this harness runs with dry-run mail, so the code is here');
  assert.match(r.j.devCode, /^\d{6}$/);
  /* MAIL_DRY_RUN=0 with no credentials: the mailer still opens no socket (nothing is
     configured to send through), but the dry-run flag is off — which is the one switch
     the code's on-screen answer follows. Its own server, its own data: the rest of the
     file must keep the harness it was written for. */
  const DATA2 = fs.mkdtempSync(path.join(os.tmpdir(), 'boasis-verify-live-'));
  const live = await boot(DATA2, { MAIL_DRY_RUN: '0' });
  try {
    const r3 = await fetch(live.base + '/api/verify-email/send', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: fresh(), _t: Date.now() - 60000 }),
    }).then(async r => ({ status: r.status, j: await r.json() }));
    assert.equal(r3.status, 200);
    assert.equal(r3.j.ok, true);
    assert.ok(!('devCode' in r3.j) || !r3.j.devCode, 'the answer must not carry the code when the box says it mails');
  } finally {
    live.p.kill('SIGTERM');
    try { fs.rmSync(DATA2, { recursive: true, force: true }); } catch (e) {}
  }
});

test('the whole path — ask, read, verify, sign up', async () => {
  const email = fresh();
  const s = await send(email);
  const v = await raw('/api/verify-email/verify', { email, code: s.j.devCode });
  assert.equal(v.status, 200);
  assert.ok(typeof v.j.token === 'string' && v.j.token.length > 30, 'the proof is a token, not a cookie-crumb yes');
  const { captchaField } = require('./helpers/captcha');
  const altcha = await captchaField(base);
  const noToken = await fetch(base + '/api/manage', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'No Token', email, phone: '+971 555 000 111', have: 'no', plans: 'One small shop, deciding the zone.', altcha, _t: Date.now() - 60000 }),
  }).then(async r => ({ status: r.status, j: await r.json() }));
  assert.equal(noToken.status, 400, 'a full, honest form is still refused until the mailbox spoke');
  assert.ok(noToken.j.errors.includes('emailv'));
  const ok = await fetch(base + '/api/manage', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'With Token', email, phone: '+971 555 000 111', have: 'no', plans: 'One small shop, deciding the zone.', altcha, emailv: v.j.token, _t: Date.now() - 60000 }),
  }).then(async r => ({ status: r.status, j: await r.json() }));
  assert.equal(ok.status, 200, 'and accepted once it has');
  assert.equal(ok.j.confirmed, true, 'the mails went out to the visitor');
  const recs = read('manage.json');
  assert.equal(recs[recs.length - 1].email, email, 'the lead is stored with the address that was verified, no other');
});

test('a code: three tries, then it dies', async () => {
  const email = fresh();
  const s = await send(email);
  for (let i = 0; i < 3; i++) {
    const w = await raw('/api/verify-email/verify', { email, code: '000000' });
    assert.equal(w.status, 400, 'a wrong code never says yes');
    assert.ok(w.j.errors.includes('code') || w.j.errors.includes('attempts'), JSON.stringify(w.j));
  }
  const after = await raw('/api/verify-email/verify', { email, code: s.j.devCode });
  assert.equal(after.status, 400, 'the true code is spent too once the tries ran out — a new one is needed');
  const gap = await send(email);
  assert.equal(gap.status, 429, 'and the minute between codes is real: no instant second try');
  assert.ok(gap.j.errors.includes('too-soon') && gap.j.retryIn > 0, 'it says how long, in seconds');
});

test('one code, one signup — and the token is for one address', async () => {
  const email = fresh();
  const email2 = fresh();
  const s = await send(email);
  const s2 = await send(email2);
  const v = await raw('/api/verify-email/verify', { email, code: s.j.devCode });
  const { captchaField } = require('./helpers/captcha');
  const altcha = await captchaField(base);
  const body = extra => JSON.stringify({ name: 'Twice', email, phone: '+971 555 222 333', have: 'no', plans: 'A second pass.', altcha, _t: Date.now() - 60000, ...extra });
  const head = { 'content-type': 'application/json' };
  const first = await fetch(base + '/api/manage', { method: 'POST', headers: head, body: body({ emailv: v.j.token }) });
  assert.equal(first.status, 200);
  const replay = await fetch(base + '/api/manage', { method: 'POST', headers: head, body: body({ emailv: v.j.token }) });
  assert.equal(replay.status, 400, 'the same token cannot buy a second signup');
  const cross = await raw('/api/verify-email/verify', { email: email2, code: s.j.devCode });
  assert.equal(cross.status, 400, 'an address never verifies on another address\'s code');
  const own = await raw('/api/verify-email/verify', { email: email2, code: s2.j.devCode });
  assert.equal(own.status, 200, 'and its own code still works, untouched by the crossing');
  const v2 = await raw('/api/verify-email/verify', { email, code: '111111' });
  assert.equal(v2.status, 400, 'the spent code cannot be guessed at again either');
});

test('a script that skips the page gets a yes with nothing behind it', async () => {
  const email = fresh();
  const fast = await raw('/api/verify-email/send', { email, _t: Date.now() });
  assert.equal(fast.status, 200, 'the answer is the same polite yes the traps always give');
  assert.ok(!fast.j.devCode, 'but no code was minted, no mail queued');
  const honey = await send(email, { hp: 'http://pills' });
  assert.equal(honey.status, 200);
  assert.ok(!honey.j.devCode, 'the hidden field no human sees says the same');
  const v = await raw('/api/verify-email/verify', { email, code: '123456' });
  assert.equal(v.status, 400, 'and the address that never really got a code cannot advance');
  /* a person is met by the normal flow — on the address a script never touched */
  const s2 = await send(fresh());
  assert.equal(s2.status, 200);
  assert.equal(typeof s2.j.devCode, 'string', 'and their code arrives as it always does');
});
