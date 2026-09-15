const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');

/* This file exists because of a real bug: `Number('')` is 0 and `Number.isFinite(0)` is
   true, so every numeric setting whose variable was absent or blank became 0 instead of
   its default. maxAgeMs 0 made EVERY form submission look "stale" and silently dropped it —
   the endpoint answered {"ok":true} while storing nothing. Tests that only checked the
   functions in isolation (with a hand-written cfg) passed anyway. Only loading the real
   config caught it. */
const PROBE = path.resolve(__dirname, 'helpers/config-probe.js');

/* a fresh process, because config/env.js reads process.env once at require time */
const load = (env = {}) => {
  const e = { ...process.env };
  for (const k of Object.keys(env)) { if (env[k] === undefined) delete e[k]; else e[k] = env[k]; }
  return JSON.parse(execFileSync(process.execPath, [PROBE], { env: e, encoding: 'utf8' }));
};

test('numeric defaults survive an environment where the variable is absent', () => {
  const c = load({ SPAM_MIN_FILL_MS: undefined, SPAM_MAX_AGE_MS: undefined, PORT: undefined });
  assert.equal(c.spam.minFillMs, 3000);
  assert.equal(c.spam.maxAgeMs, 1800000);
  assert.equal(c.port, 3000);
});

test('a variable left BLANK in .env still takes the default (the bug that shipped)', () => {
  const c = load({ SPAM_MIN_FILL_MS: '', SPAM_MAX_AGE_MS: '', PORT: '', MAIL_SUBJECT_PREFIX: undefined });
  assert.equal(c.spam.minFillMs, 3000, 'a blank number must never become 0');
  assert.equal(c.spam.maxAgeMs, 1800000);
  assert.equal(c.port, 3000);
});

test('a real sign-up is not flagged as stale, on the real config', () => {
  const { spamCheck } = require('../lib/validate');
  const c = load({});
  const req = { headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0' } };
  for (const age of [4000, 20000, 60000, 5 * 60 * 1000]) {
    assert.equal(spamCheck(req, { _t: Date.now() - age }, c).spam, false, `${age}ms is a person`);
  }
  assert.equal(spamCheck(req, { _t: Date.now() - 100 }, c).spam, true, '100ms is a script');
  assert.equal(spamCheck(req, { _t: Date.now() - 3 * 60 * 60 * 1000 }, c).spam, true, 'a 3h-old tab is a stale form');
});

test('with no key at all, mail is dry-run and nothing can be sent by accident', () => {
  const c = load({ SMTP_USER: undefined, SMTP_PASS: undefined, MAIL_DRY_RUN: undefined });
  assert.equal(c.mail.enabled, false);
  assert.equal(c.mail.dryRun, true, 'a fresh clone must never fire at a live provider');
});

test('credentials switch mail to live; MAIL_DRY_RUN=1 overrides it back', () => {
  const c = load({ SMTP_USER: undefined, SMTP_PASS: undefined, MAIL_DRY_RUN: undefined });
  assert.equal(c.mail.enabled, false, 'no credentials on a fresh clone means no sending');
  assert.equal(c.mail.dryRun, true, 'and therefore a dry run, so the site still boots');

  const live = load({ SMTP_USER: 'support@boasis.ae', SMTP_PASS: 'x'.repeat(16), MAIL_DRY_RUN: undefined });
  assert.equal(live.mail.enabled, true, 'both together mean live');
  assert.equal(live.mail.dryRun, false);
  assert.equal(live.mail.pass.length, 16, 'the password is loaded, never defaulted away');

  const drier = load({ SMTP_USER: 'support@boasis.ae', SMTP_PASS: 'secret', MAIL_DRY_RUN: '1' });
  assert.equal(drier.mail.dryRun, true, 'an explicit dry run wins over real credentials');
});

test('half a credential is refused at boot, not silently sent as anonymous', () => {
  const onlyUser = load({ SMTP_USER: 'support@boasis.ae', SMTP_PASS: undefined });
  assert.ok(onlyUser.problems.some(x => /SMTP_PASS/.test(x)), 'user without pass must be a problem');
  assert.equal(onlyUser.mail.enabled, false, 'and must not be treated as live');
  const onlyPass = load({ SMTP_USER: undefined, SMTP_PASS: 'secret' });
  assert.ok(onlyPass.problems.some(x => /SMTP_USER/.test(x)), 'pass without user must be a problem');
});

test('the sender must live on the domain the relay signs for', () => {
  const bad = load({ SMTP_USER: 'a@boasis.ae', SMTP_PASS: 'x', MAIL_FROM: 'BOASIS <someone@gmail.com>' });
  assert.ok(bad.problems.some(x => /MAIL_FROM/.test(x)), 'gmail.com would fail every send at the relay');
  const ok = load({ SMTP_USER: 'a@boasis.ae', SMTP_PASS: 'x', MAIL_FROM: 'BOASIS <support@boasis.ae>' });
  assert.ok(!ok.problems.some(x => /MAIL_FROM/.test(x)), 'a display name must not be read as the address');
  assert.equal(ok.mail.fromDomain, 'boasis.ae');
});

test('notifyTo drops junk addresses instead of failing the send later', () => {
  const c = load({ MAIL_NOTIFY_TO: 'ok@boasis.ae, NOT-AN-EMAIL, ,second@boasis.ae' });
  assert.deepEqual(c.mail.notifyTo, ['ok@boasis.ae', 'second@boasis.ae']);
  assert.deepEqual(load({ MAIL_NOTIFY_TO: 'garbage' }).mail.notifyTo, []);
});

test('a missing salt is reported, not silently accepted', () => {
  const c = load({ VISITOR_SALT: '' });
  assert.ok(c.problems.some(p => /VISITOR_SALT/.test(p)), 'the startup log must warn');
  assert.equal(load({ VISITOR_SALT: 'x'.repeat(40) }).problems.filter(p => /VISITOR_SALT/.test(p)).length, 0);
});

test('0 and 1 are understood for booleans, and "0" does not mean true', () => {
  assert.equal(load({ MAIL_DRY_RUN: '0', SMTP_USER: 'a@boasis.ae', SMTP_PASS: 'secret' }).mail.dryRun, false, '0 is false');
  assert.equal(load({ MAIL_DRY_RUN: 'false', SMTP_USER: 'a@boasis.ae', SMTP_PASS: 'secret' }).mail.dryRun, false);
  assert.equal(load({ MAIL_DRY_RUN: 'true', SMTP_USER: 'a@boasis.ae', SMTP_PASS: 'secret' }).mail.dryRun, true);
  assert.equal(load({ SPAM_BLOCK_FREE_MAIL: 'yes' }).spam.blockFreeMail, true);
});

test('the data dir stays inside the project unless deliberately moved', () => {
  const c = load({});
  assert.equal(path.isAbsolute(c.dataDir), true, 'must be absolute, or it follows the launch cwd');
  assert.equal(load({ DATA_DIR: '/home/u123456/boasis-data' }).dataDir, '/home/u123456/boasis-data');
});
