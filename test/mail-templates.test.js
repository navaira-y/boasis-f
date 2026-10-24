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
    [T.demoToOwner({ ...evil, who: 'company', entity: '<b>bold</b>' }), false],
    [T.demoToUser(evil), false],
    [T.manageToOwner({ ...evil, have: 'yes', count: '1-3', authority: '<svg onload=alert(5)>' }), false],
    [T.manageToOwner({ ...evil, have: 'no', plans: '<b>bold</b>' }), false],
    [T.manageToUser(evil), false],
  ];
  for (const [m, businessShown] of cases) {
    assert.ok(!/<script/i.test(m.html), 'no raw <script>');
    /* the one <img> the mail is allowed to carry is the site's own logo, referenced by its
       exact URL; anything else surviving as an element is a field that escaped escaping. */
    const ours = m.html.replace(/<img src="https:\/\/boasis\.ae\/assets\/logo\/orb-160\.png"[^>]*>/g, '');
    assert.ok(!/<svg/i.test(ours) && !/<img/i.test(ours.replace(/<img src="data:/g,'')), 'no element from a field survives as an element');
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

/* ── the look the owner asked for: the site's own orb, on a light grey ground ── */
test('every mail carries the site logo, and the ground is a light grey', () => {
  const s = { name: 'Amina Al Mazroui', email: 'a@b.co', intent: 'enterprise', at: Date.now(), ip: 'h' };
  const mails = [T.waitlistToOwner(s), T.waitlistToUser(s), T.contactToOwner({ ...s, message: 'Hi' }), T.contactToUser(s),
    T.demoToOwner({ ...s, who: 'company', entity: 'SPARK' }), T.demoToUser(s),
    T.manageToOwner({ ...s, have: 'yes', count: '1-3', authority: 'SPARK' }),
    T.manageToOwner({ ...s, have: 'no', plans: 'A small trading company' }), T.manageToUser(s)];
  for (const m of mails) {
    assert.ok(m.html.includes('https://boasis.ae/assets/logo/orb-160.png'), 'the orb from the site, not a circle drawn in the mail client');
    assert.ok(new RegExp('<body[^>]*background:' + T.BRAND.mist).test(m.html), 'the body itself sits on the light grey, not the old navy');
  }
});

/* ── shape ─────────────────────────────────────────────────────────────────── */
test('every mail has what a client needs to deliver it', () => {
  const s = { name: 'Amina Al Mazroui', email: 'a@b.co', intent: 'enterprise', business: 'Skincare', at: Date.now(), ip: 'h' };
  const mails = [T.waitlistToOwner(s), T.waitlistToUser(s), T.contactToOwner({ ...s, organisation: 'SPARK', message: 'Hi' }), T.contactToUser(s),
    T.demoToOwner({ ...s, who: 'company', entity: 'SPARK' }), T.demoToUser(s),
    T.manageToOwner({ ...s, have: 'yes', count: '1-3', authority: 'SPARK' }),
    T.manageToOwner({ ...s, have: 'no', plans: 'A small trading company' }), T.manageToUser(s)];
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

/* ── the three Sharjah Next mails, as the event team drew them ─────────────────────
   Their file is the copy of record (spark-email.html), so the subjects and the sentences are asserted
   against it here rather than against taste, and the trigger is asserted to live in exactly one place:
   lib/spark.js reads SPARK_SN_MAIL, so changing when they go is a line there and not a hunt. */
test('the Sharjah Next mails say what the design file says, and only those three go to a stand row', () => {
  const T = require('../lib/mail-templates.js');
  const m1 = T.sharjahCongrats({ name: 'Mihail-Gabriel Marginean', ref: 'SN-0147', pack: 'Beyond' });
  assert.equal(m1.subject, 'Congratulations, you’re one step away from your license! Reference SN-0147');
  assert.ok(m1.html.includes('Your application is in.'), 'the first line is the design\'s, word for word');
  assert.ok(m1.html.includes('head to Zone 2 with this number to complete your payment'), 'and so is the way to Zone 2');
  assert.ok(m1.html.includes('SN-0147'), 'their reference number is in it, in the dashed gold box the design drew');

  const m2 = T.sharjahPaid({ name: 'Mihail Two', ref: 'SN-0148' });
  assert.equal(m2.subject, 'Welcome to SPARK · Reference SN-0148');
  assert.ok(m2.html.includes('PAID') && m2.html.includes('Strike a pose with Mira'), 'the receipt carries the badge and the robot');
  assert.ok(m2.html.includes('@shjrtipark and @boasisae'), 'and the two accounts to tag');

  const m3 = T.sharjahReminder({ name: 'Mihail Three', ref: 'SN-0149' });
  assert.equal(m3.subject, 'Your Sharjah Next offer is waiting for you in Zone 2');
  assert.ok(m3.html.includes('first 100 applicants') && m3.html.includes('Already paid? Please ignore this email.'),
    'the nudge keeps the reason and the apology, as drawn');

  for (const m of [m1, m2, m3]) {
    assert.match(m.html, /background:#FBF7EA/, 'the band is the sand of their palette');
    assert.ok(m.html.includes('/assets/brand/sharjah-next.png') && m.html.includes('/assets/brand/spark.png'),
      'the two event marks are absolute addresses, which is all a mail client will fetch');
    assert.ok(m.html.includes('Powered by'), 'and the navy strip says who powers it');
    assert.ok(!/style="[^"]*expression|<script/.test(m.html), 'no script, nothing a client has to be talked into');
    assert.ok(m.text.includes('The SPARK Team'), 'every one signs the same way, in text too');
  }
  /* the AI Everything note is another event's words, so a Sharjah row must never be sent it */
  const spark = require('fs').readFileSync(require('path').join(__dirname, '..', 'lib', 'spark.js'), 'utf8');
  assert.match(spark, /if \(snRow !== 'sharjah-next-2026'\)[\s\S]*notifySpark\(/,
    'the old note is gated on the source, and only on the source');
  assert.match(spark, /process\.env\.SPARK_SN_MAIL \|\| 'submit'/, 'the trigger is one constant, and it is on for the testing');
});
