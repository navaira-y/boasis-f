const { test } = require('node:test');
const assert = require('node:assert/strict');
const { waitlistInput, contactInput, demoInput, manageInput, validEmail, spamCheck } = require('../lib/validate');

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

/* ── the dialog payloads ───────────────────────────────────────────────────── */
test('the demo dialog: a clean request passes, and the closed sets are normalised', () => {
  const r = demoInput({ name: 'Amina', email: 'AMINA@Example.COM', phone: '+971 501234567', who: 'GOV', entity: 'SPARK' });
  assert.equal(r.ok, true);
  assert.equal(r.email, 'amina@example.com');
  assert.equal(r.who, 'gov', 'the answer is stored as its own value, case folded');
});
test('the demo dialog: every closed set falls back to nothing, never to a guess', () => {
  const r = demoInput({ name: 'Amina', email: 'a@b.co', phone: '501234567', who: '<img src=x onerror=alert(1)>', entity: 'SPARK' });
  assert.equal(r.who, '', 'anything that is not the two answers is refused');
  assert.ok(r.errors.includes('who'));
});
test('the demo dialog: a missing field is a 400-worthy input, naming the field', () => {
  const r = demoInput({ name: 'Amina', email: 'a@b.co', phone: '501234567' });
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors, ['who', 'entity']);
});
test('the manage dialog: the three answers are a closed set, each spelled for a human', () => {
  const r = manageInput({ name: 'Amina', email: 'a@b.co', phone: '501234567', have: 'YES', count: '3PLUS', authority: 'SPARK Free Zone' });
  assert.equal(r.ok, true);
  assert.equal(r.have, 'yes');
  assert.equal(r.count, '3plus');
});
test('the manage dialog: junk answers are refused, and the branch follows the answer', () => {
  const r = manageInput({ name: 'Amina', email: 'a@b.co', phone: '501234567', have: 'maybe', count: 'a lot', authority: '  ' });
  assert.deepEqual(r.errors, ['have'], 'a junk answer is just "have"; the branch is not judged until the answer is real');
  assert.equal(r.have, '');
  assert.equal(r.count, '');
  assert.equal(r.authority, '');
});
test('the manage dialog: yes counts and names the company; no describes the thought', () => {
  const yesOk = manageInput({ name: 'Amina', email: 'a@b.co', phone: '501234567', have: 'yes', count: '3plus', authority: 'SPARK' });
  assert.equal(yesOk.ok, true, JSON.stringify(yesOk.errors));
  assert.deepEqual(manageInput({ name: 'Amina', email: 'a@b.co', phone: '501234567', have: 'yes' }).errors, ['count', 'authority']);
  const noOk = manageInput({ name: 'Amina', email: 'a@b.co', phone: '501234567', have: 'no', plans: 'A small trading company, two of us.' });
  assert.equal(noOk.ok, true, JSON.stringify(noOk.errors));
  assert.deepEqual(manageInput({ name: 'Amina', email: 'a@b.co', phone: '501234567', have: 'no' }).errors, ['plans']);
});

/* ── the bot traps ─────────────────────────────────────────────────────────── */
test('a filled honeypot is caught', () => {
  for (const body of [{ company_website: 'http://spam' }, { hp: 'x' }]) {
    assert.equal(spamCheck(req(), body, cfg).spam, true);
  }
});

test('posting faster than a person can read the form is marked, not discarded', () => {
  /* A person can be fast: autofill, a pasted message, a form filled while reading the page.
     Their message is kept and the owner is told why it looked odd. Losing a real enquiry is
     far worse than reading one that arrived quickly. */
  const r = spamCheck(req(), { _t: Date.now() - 500 }, cfg);
  assert.equal(r.spam, false, 'a timing signal is not proof of a robot');
  assert.deepEqual(r.flags, ['too-fast']);
});

test('a human taking their time passes clean', () => {
  const r = spamCheck(req(), { _t: Date.now() - 20000 }, cfg);
  assert.equal(r.spam, false);
  assert.deepEqual(r.flags, [], 'and with nothing to check');
});

test('a form left open over lunch is kept, and marked slow rather than hostile', () => {
  const r = spamCheck(req(), { _t: Date.now() - 40 * 60 * 1000 }, cfg);
  assert.equal(r.spam, false, 'the old comment said this is not spam; now the code agrees');
  assert.deepEqual(r.flags, ['stale-form']);
});

test('a script with no token and no user agent is refused by what it is, not by timing', () => {
  const r = spamCheck(req({ 'user-agent': '', 'content-type': 'text/plain' }), {}, cfg);
  assert.equal(r.spam, true, 'a form-encoded post is not something our own page can produce');
  assert.ok(r.hard.includes('bad-content-type'));
  assert.ok(r.soft.includes('no-timing-token'), 'and the missing stamp is recorded as well');
});

test('a missing timing stamp is marked, and the captcha is what refuses it', () => {
  /* This used to be a hard drop. It still cannot get in: a script that sends no timing stamp
     also cannot solve the puzzle, so the captcha is the floor — and an honest visitor whose
     page half-loaded keeps their message. */
  const r = spamCheck(req({ 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' }), {}, cfg);
  assert.equal(r.spam, false, 'not a hard drop any more');
  assert.deepEqual(r.flags, ['no-timing-token']);
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
