const { test } = require('node:test');
const assert = require('node:assert/strict');
const { waitlistInput, contactInput, validEmail, spamCheck } = require('../lib/validate');

const cfg = { spam: { minFillMs: 3000, maxAgeMs: 1800000, blockFreeMail: false } };
const req = (headers = {}) => ({ headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0', ...headers } });

/* ── email: what it must accept, and why it matters commercially ────────────── */
test('accepts real addresses a regex would wrongly reject', () => {
  for (const e of ['a@b.co', 'name.surname@company.ae', 'x+tag@gmail.com', "o'brien@mail.com",
                   'user@sub.domain.co.uk', 'a_b@i.com', 'u-i@boasis.ae', 'first.last@sharjah.ae',
                   'x'.repeat(60) + '@longdomain.example.com', 'NAME@EXAMPLE.COM', 'a@b.com ', '  a@b.co  ']) {
    assert.equal(validEmail(e), true, `should accept ${e}`);
  }
});

test('rejects the junk that wastes a send and hurts reputation', () => {
  for (const e of ['', ' ', 'NOT-AN-EMAIL', 'a@b', 'a@b.', '@b.com', 'a@.com', 'a b@c.com',
                   'a@b..com', 'a@b@c.com', 'a@b.c', 'a..b@c.com',
                   'a@' + 'b'.repeat(300) + '.com', 'a@b.c..d']) {
    assert.equal(validEmail(e), false, `should reject ${JSON.stringify(e)}`);
  }
});

test('a long address is refused rather than silently truncated', () => {
  assert.equal(validEmail('a@' + 'd'.repeat(260) + '.com'), false);
});

/* ── the waitlist payload ───────────────────────────────────────────────────── */
test('a clean sign-up passes, and the intent is normalised', () => {
  const r = waitlistInput({ name: 'Amina', email: 'AMINA@Example.COM', intent: 'ENTERPRISE' });
  assert.equal(r.ok, true);
  assert.equal(r.email, 'amina@example.com', 'lowercased, so dedup works');
  assert.equal(r.intent, 'enterprise');
});

test('an unknown plan cannot smuggle itself into the record', () => {
  const r = waitlistInput({ name: 'A', email: 'a@b.co', intent: '<img src=x onerror=alert(1)>' });
  assert.equal(r.intent, 'standard', 'falls back, never echoes');
});

test('missing name or email is a 400-worthy input', () => {
  assert.equal(waitlistInput({ name: '', email: 'a@b.co' }).ok, false);
  assert.equal(waitlistInput({ name: 'Amina', email: 'nope' }).ok, false);
  assert.equal(waitlistInput({}).ok, false);
  assert.equal(waitlistInput(null).ok, false, 'null body must not throw');
});

test('oversize input is clipped, not rejected outright (the customer stays happy)', () => {
  const r = waitlistInput({ name: 'x'.repeat(900), email: 'a@b.co', business: 'y'.repeat(900) });
  assert.equal(r.name.length, 120);
  assert.equal(r.business.length, 300);
});

test('control characters that would break a log line are stripped', () => {
  const r = waitlistInput({ name: 'Ami\n[mail:forged] na', email: 'a@b.co' });
  assert.equal(r.name.includes('\n'), false, 'no newline in a log line');
  assert.equal(r.name.includes('\r'), false);
});

/* ── the contact payload ────────────────────────────────────────────────────── */
test('contact needs an organisation, and accepts either spelling', () => {
  assert.equal(contactInput({ name: 'A', email: 'a@b.co', authority: 'SPARK' }).organisation, 'SPARK');
  assert.equal(contactInput({ name: 'A', email: 'a@b.co', organisation: 'Sharjah RB' }).organisation, 'Sharjah RB');
  assert.equal(contactInput({ name: 'A', email: 'a@b.co' }).ok, false, 'no org at all');
  assert.equal(contactInput({ name: 'A', email: 'a@b.co', organisation: '   ' }).ok, false, 'blank is not an org');
});

test('a message of any length is capped at 2000', () => {
  const r = contactInput({ name: 'A', email: 'a@b.co', organisation: 'X', message: 'm'.repeat(50000) });
  assert.equal(r.message.length, 2000);
});

/* ── the bot traps ─────────────────────────────────────────────────────────── */
test('a filled honeypot is caught', () => {
  for (const body of [{ company_website: 'http://spam' }, { hp: 'x' }]) {
    assert.equal(spamCheck(req(), body, cfg).spam, true);
  }
});

test('posting faster than a person can read the form is caught', () => {
  const r = spamCheck(req(), { _t: Date.now() - 500 }, cfg);
  assert.ok(r.why.includes('too-fast'));
});

test('a human taking their time passes', () => {
  assert.equal(spamCheck(req(), { _t: Date.now() - 20000 }, cfg).spam, false);
});

test('a form left open overnight is treated as a person, not a bot', () => {
  assert.equal(spamCheck(req(), { _t: Date.now() - 40 * 60 * 1000 }, cfg).spam, true, 'stale is flagged');
  assert.ok(spamCheck(req(), { _t: Date.now() - 40 * 60 * 1000 }, cfg).why.includes('stale-form'));
});

test('a script with no timing token and no user agent is caught', () => {
  assert.ok(spamCheck(req({ 'user-agent': '', 'content-type': 'text/plain' }), {}, cfg).spam, true);
});

test('a submission with no token is caught, even wearing a browser user-agent', () => {
  // this is the hole a spoofed UA used to slip through
  assert.equal(spamCheck(req({ 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' }), {}, cfg).spam, true);
  assert.ok(spamCheck(req(), {}, cfg).why.includes('no-timing-token'));
});

test('a valid token from an old page (no UA at all) is still judged on time, not existence', () => {
  assert.equal(spamCheck(req({ 'user-agent': '' }), { _t: Date.now() - 9000 }, cfg).spam, false);
});

test('free-mail blocking is opt-in and off by default', () => {
  assert.equal(spamCheck(req(), { _t: Date.now() - 9000, email: 'x@gmail.com' }, cfg).spam, false);
  const on = { spam: { ...cfg.spam, blockFreeMail: true } };
  assert.equal(spamCheck(req(), { _t: Date.now() - 9000, email: 'x@gmail.com' }, on).spam, true);
  assert.equal(spamCheck(req(), { _t: Date.now() - 9000, email: 'x@sharjah.gov.ae' }, on).spam, false);
});
