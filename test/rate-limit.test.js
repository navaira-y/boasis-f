const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const fs = require('fs'); const path = require('path'); const os = require('os');

/* The limiter and the bucket are a pair, and the pair has one failure mode that no unit test
   can see: a middleware that forgets `next()`. That does not error, it hangs, and a hung
   request looks like a slow server to everyone until a deploy. So this file exists to fail
   loudly and fast: it drives the real endpoints and asserts both the pass AND the block. */

const ROOT = path.resolve(__dirname, '..');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'boasis-rate-'));

const start = env => new Promise((res, rej) => {
  const proc = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT, env: { ...process.env, PORT: '0', DATA_DIR: DATA, MAIL_DRY_RUN: '1', VISITOR_SALT: 's', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  proc.stdout.on('data', d => { log += d; const m = /port (\d+)/.exec(log); if (m) res({ proc, port: m[1] }); });
  proc.stderr.on('data', d => { log += d; });
  proc.on('exit', c => rej(new Error('exited ' + c + ': ' + log)));
  setTimeout(() => rej(new Error('never bound a port: ' + log)), 12000);
});

const { withCaptcha } = require('./helpers/captcha');

/* a request that must never be allowed to hang the suite: no server answer is a failure.
   It carries a solved captcha, because these are honest submissions: the limiter sits in
   front of the captcha, so the ones that get a 429 never reach it anyway. */
const post = async (port, p, body, ms = 8000) => {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  const sent = await withCaptcha(`http://127.0.0.1:${port}`, { ...body, _t: Date.now() - 12000 });
  return fetch(`http://127.0.0.1:${port}${p}`, {
    method: 'POST', signal: ac.signal,
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(sent),
  }).finally(() => clearTimeout(t));
};

/* the raw helper: sends whatever X-Forwarded-For the test asks for, solved captcha and all */
const postAs = async (port, p, body, xff) => {
  const sent = await withCaptcha(`http://127.0.0.1:${port}`, { ...body, _t: Date.now() - 12000 });
  return fetch(`http://127.0.0.1:${port}${p}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(xff ? { 'x-forwarded-for': xff } : {}) },
    body: JSON.stringify(sent),
  });
};

test('a forged X-Forwarded-For cannot buy a fresh bucket (the hole that was here)', async () => {
  /* This is the bug in full: trust proxy was `true`, so Express believed the whole header
     and req.ip became whatever the caller typed. Twelve posts under twelve made-up names
     all passed. Now only the hop our own proxy appended is read, so the made-up part is
     ignored and the bucket is the same one. */
  const { proc, port } = await start({ RATE_LIMIT_FORMS_PER_MIN: '3', TRUST_PROXY: '1' });
  try {
    const codes = [];
    for (let i = 0; i < 6; i++) {
      /* what a real proxy produces when the caller also sent a header: theirs, then the truth */
      const r = await postAs(port, '/api/waitlist', { name: 'P' + i, email: `spoof${i}@boasis.ae`, intent: 'standard' }, `10.0.0.${i}, 203.0.113.9`);
      codes.push(r.status);
    }
    assert.equal(codes.filter(c => c === 200).length, 3, 'exactly the limit may pass: ' + codes.join(','));
    assert.equal(codes.filter(c => c === 429).length, 3, 'a new invented address must not win a new bucket: ' + codes.join(','));
  } finally { proc.kill('SIGTERM'); }
});

test('when the header is the only thing that changes, the site-wide cap still holds', async () => {
  /* The belt to the per-visitor braces: this cap counts the whole site, so it cannot be
     escaped by any header at all. */
  const { proc, port } = await start({ RATE_LIMIT_FORMS_PER_MIN: '1000', GLOBAL_FORMS_PER_MIN: '3', TRUST_PROXY: '1' });
  try {
    const codes = [];
    for (let i = 0; i < 6; i++) {
      const r = await postAs(port, '/api/waitlist', { name: 'Q' + i, email: `global${i}@boasis.ae`, intent: 'standard' }, `172.16.0.${i}, 203.0.113.9`);
      codes.push(r.status);
    }
    assert.equal(codes.filter(c => c === 200).length, 3, 'the site cap must stop it: ' + codes.join(','));
    assert.equal(codes.filter(c => c === 429).length, 3, 'and answer honestly rather than hang: ' + codes.join(','));
  } finally { proc.kill('SIGTERM'); }
});

test('a minute is counted from the first request, not from the clock', () => {
  /* Found by this suite failing about one run in ten ("200,200,200,200,429,429"): the caps
     used to reset on the clock minute, so a flood starting at 12:59:59 got its full
     allowance again one second later. Frozen time makes that boundary deterministic. */
  const { globalGate } = require('../lib/protect');
  const real = Date.now;
  let t = Date.parse('2026-01-01T12:59:58.500Z');
  Date.now = () => t;
  try {
    const gate = globalGate({ name: 'boundary', perMinute: 3, perDay: 1000 });
    let code = 0;
    const res = { set() { return this; }, status(c) { code = c; return this; }, json() {} };
    const call = () => { code = 0; gate({}, res, () => { code = 200; }); return code; };
    assert.deepEqual([call(), call(), call(), call()], [200, 200, 200, 429], 'three through, then stop');
    t += 1500;   // 13:00:00.000 — a new clock minute, 1.5 s later
    assert.equal(call(), 429, 'the allowance must not refill on the clock minute');
    t += 60000;  // a real minute after the first request
    assert.equal(call(), 200, 'and it does refill once a real minute has passed');
  } finally { Date.now = real; }
});

test('the sending budget stops the mail, and the lead is still kept', async () => {
  /* The owner's actual complaint is a full inbox. Past the budget the emails stop, the
     visitor still sees success, and the record stays on disk. */
  const { proc, port } = await start({ RATE_LIMIT_FORMS_PER_MIN: '1000', GLOBAL_FORMS_PER_MIN: '100', MAIL_MAX_PER_HOUR: '2' });
  try {
    const answers = [];
    for (let i = 0; i < 3; i++) {
      const r = await post(port, '/api/waitlist', { name: 'M' + i, email: `budget${i}@boasis.ae`, intent: 'standard' });
      answers.push(await r.json());
    }
    assert.equal(answers[0].confirmed, true, 'the first submission mails as normal');
    assert.equal(answers[2].confirmed, false, 'past the budget nothing is sent');
    const stored = JSON.parse(fs.readFileSync(path.join(DATA, 'waitlist.json'), 'utf8'));
    assert.equal(stored.filter(e => /^budget\d@boasis\.ae$/.test(e.email)).length, 3, 'but every lead is still stored');
  } finally { proc.kill('SIGTERM'); }
});

test('a flood alerts the owner, once, and never the visitor or the attacker', async () => {
  /* The point of the alert: the owner hears a flood happened instead of finding out from a
     full inbox. It goes to MAIL_NOTIFY_TO only, and the half-hour cooldown means the flood
     cannot turn our warning system into the spam it is warning about. */
  const { proc, port } = await start({
    RATE_LIMIT_FORMS_PER_MIN: '1000', GLOBAL_FORMS_PER_MIN: '2', MAIL_MAX_PER_HOUR: '10000', MAIL_MAX_PER_DAY: '10000',
  });
  let log = '';
  proc.stdout.on('data', d => { log += d; });
  proc.stderr.on('data', d => { log += d; });
  try {
    for (let i = 0; i < 6; i++) await post(port, '/api/waitlist', { name: 'A' + i, email: `flood${i}@boasis.ae`, intent: 'standard' });
    await new Promise(r => setTimeout(r, 400));           // let the alert's dry-run print land
    const alerts = log.split('\n').filter(l => l.includes('[mail:dry] alert:limit-form-submissions'));
    assert.equal(alerts.length, 1, 'exactly one alert for the whole minute, not one per refused request: ' + alerts.length);
    /* the log masks the local part on purpose, so the owner domain is what is observable —
       and it is the fact that matters: the alert went to the owner, not to a visitor */
    assert.match(alerts[0], /•••@boasis\.ae/, 'and it goes to the owner address');
    assert.ok(!/mail:dry\] alert:.*@example\.com/.test(log), 'never to the visitor domain');
    const receipts = log.split('\n').filter(l => l.includes('waitlist:user')).length;
    assert.equal(receipts, 2, 'only the two submissions that were allowed produced a receipt: ' + receipts);
  } finally { proc.kill('SIGTERM'); }
});

test('the mail budget alerts the owner even though it is the reason sending stopped', async () => {
  const { proc, port } = await start({ RATE_LIMIT_FORMS_PER_MIN: '1000', GLOBAL_FORMS_PER_MIN: '1000', MAIL_MAX_PER_HOUR: '2', MAIL_MAX_PER_DAY: '10000' });
  let log = '';
  proc.stdout.on('data', d => { log += d; });
  proc.stderr.on('data', d => { log += d; });
  try {
    for (let i = 0; i < 3; i++) await post(port, '/api/waitlist', { name: 'B' + i, email: `cap${i}@boasis.ae`, intent: 'standard' });
    await new Promise(r => setTimeout(r, 400));
    assert.match(log, /the hour cap is reached/, 'the log says the budget is spent');
    assert.match(log, /\[mail:dry\] alert:mail-hour/, 'and an alert still gets out: it is the one email the budget must not block');
  } finally { proc.kill('SIGTERM'); }
});

test('a rate limited POST answers instead of hanging (the forgotten next() bug)', async () => {
  const { proc, port } = await start({ RATE_LIMIT_FORMS_PER_MIN: '1000' });
  try {
    const r = await post(port, '/api/waitlist', { name: 'Amina', email: 'hang@boasis.ae', intent: 'standard' });
    assert.equal(r.status, 200, 'a single honest sign-up must be answered, not swallowed');
    assert.deepEqual(await r.json(), { ok: true, confirmed: true });
  } finally { proc.kill('SIGTERM'); }
});

test('the form bucket blocks after the limit, and says so honestly', async () => {
  const { proc, port } = await start({ RATE_LIMIT_FORMS_PER_MIN: '3' });
  try {
    const codes = [];
    for (let i = 0; i < 6; i++) {
      const r = await post(port, '/api/waitlist', { name: 'P' + i, email: `p${i}@boasis.ae`, intent: 'standard' });
      codes.push(r.status);
      if (r.status === 429) assert.ok(Number(r.headers.get('retry-after')) >= 1, '429 without Retry-After is a rude limiter');
    }
    assert.equal(codes.filter(c => c === 200).length, 3, 'exactly the limit should pass: ' + codes.join(','));
    assert.equal(codes.filter(c => c === 429).length, 3, 'the rest must be refused: ' + codes.join(','));
    /* a blocked bot must still never see a 500 or a stack: this is a marketing site */
    const last = await post(port, '/api/waitlist', { name: 'x', email: 'nope' });
    assert.equal([429, 400].includes(last.status), true);
  } finally { proc.kill('SIGTERM'); }
});

test('a bot that trips the honeypot is still answered with a fake success, not a refusal', async () => {
  const { proc, port } = await start({ RATE_LIMIT_FORMS_PER_MIN: '1000' });
  try {
    const r = await post(port, '/api/waitlist', { name: 'Bot', email: 'bot@x.co', company_website: 'http://pills' });
    assert.equal(r.status, 200, 'the trap must not announce itself');
    assert.deepEqual(await r.json(), { ok: true });
    const stored = JSON.parse(fs.readFileSync(path.join(DATA, 'waitlist.json'), 'utf8'));
    assert.equal(stored.some(e => e.email === 'bot@x.co'), false, 'and nothing may be stored');
  } finally { proc.kill('SIGTERM'); }
});

test('the security headers are on every response, and HSTS only on https', async () => {
  const { proc, port } = await start({});
  try {
    const r = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.equal(r.headers.get('cross-origin-resource-policy'), 'same-origin');
    const csp = r.headers.get('content-security-policy');
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /form-action 'self'/, 'a CSRF via an injected form target must be blocked');
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /https:\/\/fonts\.googleapis\.com/, 'the one third party the site uses must stay allowed');
    assert.ok(!r.headers.get('x-powered-by'), 'no framework advertisement');
    assert.equal(r.headers.get('strict-transport-security'), null, 'plain HTTP must not get HSTS');
    const s = await fetch(`http://127.0.0.1:${port}/`, { headers: { 'x-forwarded-proto': 'https' } });
    assert.match(s.headers.get('strict-transport-security'), /max-age=31536000/);
  } finally { proc.kill('SIGTERM'); }
});
