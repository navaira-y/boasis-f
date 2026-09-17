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
