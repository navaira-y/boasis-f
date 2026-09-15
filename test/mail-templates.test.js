const { test } = require('node:test');
const assert = require('node:assert/strict');
const T = require('../lib/mail-templates');

/* ── the important one: a form field must never become markup in an inbox ──── */
test('visitor input cannot inject HTML into the mail we send ourselves', () => {
  const evil = {
    name: '<script>alert(1)</script>',
    email: 'x@y.co"><img src=q onerror=alert(2)>',
    intent: 'enterprise',
    business: "</td></tr><tr><td>Injected'><svg onload=alert(3)>",
    at: new Date().toISOString(),
    ip: 'abc',
  };
  const cases = [
    [T.waitlistToOwner(evil), true],
    [T.waitlistToUser(evil), false],
    // business is not a field contactToOwner renders, so nothing to check there
    [T.contactToOwner({ ...evil, organisation: '<b>bold</b>', message: '<img src=x onerror=alert(4)>' }), false],
    [T.contactToUser(evil), false],
  ];
  for (const [m, businessShown] of cases) {
    assert.ok(!/<script/i.test(m.html), 'no raw <script>');
    assert.ok(!/<svg/i.test(m.html) && !/<img/i.test(m.html.replace(/<img src="data:/g,'')), 'no element from a field survives as an element');
    assert.ok(!/<b>bold<\/b>/.test(m.html), 'tags from a field are text, not markup');
    /* the payload's own markup must exist only in escaped form. Note '</td></tr>' is
       legitimately our own row() markup, so we assert on the payload's distinctive
       pieces instead of on any closing tag. */
    /* every '<' that came from the payload must exist only as &lt;. Grepping for a bare
       "onerror=" is not the test — that string survives harmlessly inside escaped text. */
    for (const raw of ['<script>alert', '<svg onload', '<img src=q', '</td></tr><tr><td>Injected']) {
      assert.ok(!m.html.includes(raw), raw + ' leaked unescaped');
    }
    assert.ok(!/\n|\r/.test(m.subject), 'the subject is a header: one line only');
    // the field is still in the mail, just in escaped form: the exact output of esc()
    if (businessShown) {
      const e = T.esc(evil.business);
      assert.ok(m.html.includes(e), 'the field is present, escaped, and inert');
      assert.notEqual(e, evil.business, 'escaping actually changed it');
    }
  }
});

test('quotes cannot break out of an attribute', () => {
  const m = T.waitlistToOwner({ name: '"><a href="javascript:alert(1)', email: 'a@b.co', intent: 'standard', at: Date.now(), ip: 'x' });
  assert.ok(!m.html.includes('href="javascript:'), 'javascript: URL never built from a field');
  assert.ok(m.html.includes('&quot;'), 'quotes escaped');
});

test('a reply-to from a visitor is only used for our own notification, never for the receipt', () => {
  const evil = { name: 'A', email: 'victim@elsewhere.com', intent: 'standard', at: Date.now(), ip: 'x' };
  assert.equal(T.waitlistToOwner(evil).replyTo, 'victim@elsewhere.com', 'reply goes to the applicant');
  assert.equal(T.waitlistToUser(evil).replyTo, undefined, 'the receipt does not inherit it');
});

/* ── shape ─────────────────────────────────────────────────────────────────── */
test('every mail has what a client needs to deliver it', () => {
  const s = { name: 'Amina Al Mazroui', email: 'a@b.co', intent: 'enterprise', business: 'Skincare', at: Date.now(), ip: 'h' };
  const mails = [T.waitlistToOwner(s), T.waitlistToUser(s), T.contactToOwner({ ...s, organisation: 'SPARK', message: 'Hi' }), T.contactToUser(s)];
  for (const m of mails) {
    assert.ok(typeof m.subject === 'string' && m.subject.length > 3 && m.subject.length < 150, 'subject present and safe');
    assert.ok(m.html.startsWith('<!doctype html>'), 'a full document');
    assert.ok(m.text.length > 60, 'a text alternative, which spam filters weigh');
    assert.ok(!m.subject.includes('\n') && !m.subject.includes('\r'), 'no header injection via the subject');
    assert.ok(m.html.includes('boasis.ae'), 'the brand and a link back');
  }
});

test('no control character can reach a header (the shape SMTP injection needs)', () => {
  // validate.js strips CR/LF/NUL from every field, which is what kills header injection.
  // The subject is also only ever handed to the relay as a header, never interpolated into a header.
  const { waitlistInput } = require('../lib/validate');
  const cleaned = waitlistInput({ name: 'A\nBcc: everyone@corp.ae\r\nV: 1', email: 'a@b.co', intent: 'standard' });
  assert.ok(!/[\r\n\0]/.test(cleaned.name), 'the newlines are gone before the template runs');
  const m = T.waitlistToOwner({ ...cleaned, at: Date.now(), ip: 'x' });
  assert.ok(!/[\r\n\0]/.test(m.subject), 'so the subject cannot carry one either');
});

test('the plan is spelled for a human in both variants', () => {
  for (const [intent, label] of [['enterprise', 'Enterprise'], ['standard', 'Standard']]) {
    const s = { name: 'A', email: 'a@b.co', intent, at: Date.now(), ip: 'x' };
    assert.match(T.waitlistToUser(s).subject, new RegExp(label));
    assert.match(T.waitlistToOwner(s).subject, new RegExp(label));
  }
});

test('a date renders in Dubai time, since that is the market', () => {
  const s = { name: 'A', email: 'a@b.co', intent: 'standard', at: '2026-09-13T04:00:00.000Z', ip: 'x' };
  assert.match(T.waitlistToOwner(s).text, /13 September 2026/);
  assert.match(T.waitlistToOwner(s).text, /Dubai/);
});

test('an empty optional field does not print an empty label', () => {
  const m = T.waitlistToOwner({ name: 'A', email: 'a@b.co', intent: 'standard', business: '', at: Date.now(), ip: 'x' });
  assert.ok(!m.text.includes('Business:'), 'no blank Business row');
  assert.ok(m.html.includes('A'), 'but the name is still there');
});

test('a name with no space, and an empty name, both survive', () => {
  assert.doesNotThrow(() => T.waitlistToUser({ name: 'Amina', email: 'a@b.co', intent: 'standard', at: Date.now() }));
  assert.doesNotThrow(() => T.waitlistToUser({ name: '', email: 'a@b.co', intent: 'standard', at: Date.now() }));
  assert.match(T.waitlistToUser({ name: '', email: 'a@b.co', intent: 'standard', at: Date.now() }).text, /there/);
});
