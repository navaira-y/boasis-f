/* The door the Brain's record posts a queued mail through.
 *
 * The Brain holds the queue and the service role; this host holds the SMTP relay and the
 * templates. Neither can do the job alone, so the record calls out here exactly as the edge
 * functions already call out to the stand's sheet: a shared secret in the body, never a header
 * and never a query string.
 *
 * What is tested is the gate and the shape, not the sending: MAIL_DRY_RUN is on, so a 200 here
 * means "this host accepted it and would have sent it", which is the contract the Brain needs.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'boasis-mailq-'));
const SECRET = 'test-mail-hook-secret-0123456789';
let proc, base;

before(async () => {
  proc = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: {
      ...process.env, BOASIS_NO_ENV_FILE: '1', PORT: '0', DATA_DIR: DATA,
      MAIL_DRY_RUN: '1', VISITOR_SALT: 'test-salt', MAIL_QUEUE_KEY: SECRET,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server did not start: ' + log)), 15000);
    proc.stdout.on('data', d => { log += d; if (/port \d{2,6}/.test(log)) { clearTimeout(t); res(); } });
    proc.on('exit', c => rej(new Error('exited ' + c + ': ' + log)));
  });
  base = 'http://127.0.0.1:' + /port (\d+)/.exec(log)[1];
});
after(() => { proc.kill('SIGTERM'); try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) {} });

const post = (body) => fetch(base + '/api/spark-mail', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

const RESUME = {
  kind: 'R1', to: 'someone@example.com',
  payload: { resume_url: 'https://brain.boasis.ae/?resume=' + 'a'.repeat(48), name: 'Amira', ref: 'SN-AB12CD' },
};

test('a mail with the right secret is accepted', async () => {
  const r = await post({ secret: SECRET, ...RESUME });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.ok, true);
});

test('no secret, a wrong secret and a secret of the wrong length are all refused', async () => {
  for (const secret of [undefined, '', 'wrong', SECRET + 'x', SECRET.slice(0, -1), SECRET.toUpperCase()]) {
    const r = await post({ secret, ...RESUME });
    assert.equal(r.status, 403, 'accepted secret ' + JSON.stringify(secret));
    assert.equal((await r.json()).ok, false);
  }
});

test('a kind this host has no template for is refused, not silently dropped', async () => {
  for (const kind of ['E9', 'resume', '', null, 'R1; drop table', '../R1']) {
    const r = await post({ secret: SECRET, ...RESUME, kind });
    assert.equal(r.status, 400, 'accepted kind ' + JSON.stringify(kind));
  }
});

test('an address that is not an address is refused before any send', async () => {
  for (const to of ['', 'nope', 'a@b', undefined, 'x'.repeat(250) + '@example.com', 'a@example.com, b@example.com']) {
    const r = await post({ secret: SECRET, ...RESUME, to });
    assert.equal(r.status, 400, 'accepted address ' + JSON.stringify(to));
  }
});

test('a resume mail without a link is refused: an empty button is worse than no mail', async () => {
  for (const url of [undefined, '', 'not-a-url', 'http://brain.boasis.ae/?resume=x', 'https://evil.example.com/?resume=' + 'a'.repeat(48)]) {
    const r = await post({ secret: SECRET, ...RESUME, payload: { ...RESUME.payload, resume_url: url } });
    assert.equal(r.status, 400, 'accepted link ' + JSON.stringify(url));
  }
});
