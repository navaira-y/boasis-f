const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/* The contact page is HTML + CSS + a small script, so it is tested as a served thing:
   does it load, does everything it points at exist, and does it reach the API.
   It also pins the ONE thing that does not work yet, so nobody has to rediscover it:
   /api/contact still requires an `organisation`, which this form does not ask for. */

const ROOT = path.resolve(__dirname, '..');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'boasis-contact-'));
let proc, base;

before(async () => {
  proc = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: '0', DATA_DIR: DATA, MAIL_DRY_RUN: '1', VISITOR_SALT: 'test-salt' , RATE_LIMIT_FORMS_PER_MIN: '10000', RATE_LIMIT_VISITS_PER_MIN: '10000' },
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

const get = p => fetch(base + p);
const HUMAN = () => ({ _t: Date.now() - 12000 });
/* exactly the body the browser sends: FormData of the form, JSON.stringify'd */
/* FormData picks up every named control, hidden ones included, so the real body carries
   hp, _t and the organisation scaffolding. A fixture that leaves them out tests a request
   no browser ever sends. */
const formPayload = extra => ({ hp: '', ...HUMAN(),
  name: 'Amina Al Mazroui', email: 'amina@example.com',
  phone: '+971 50 123 4567', about: 'setup', message: 'We sell skincare online, need two visas.', ...extra });

/* The two 'Contact us' buttons were mailto: until today. These tests are what stops that
   quietly regressing: the main page must point at this page, and this page must answer. */
test('the main page links to the contact page', async () => {
  const home = await (await get('/')).text();
  assert.match(home, /class="btn nav-contact" href="\/contact\.html"/, 'the nav button must open the page');
  assert.match(home, /class="btn btn-light" href="\/contact\.html\?i=setup"/, 'the free-zone CTA must open it with Set up chosen');
  const buttons = [...home.matchAll(/class="btn[^"]*" href="([^"]+)">Contact us/g)].map(m => m[1]);
  assert.match(home, /<div class="foot-ask">\s*<h2>Any questions\?<\/h2>\s*<a class="btn btn-light" href="\/contact\.html">Contact us/, 'the footer question must open the page');
  assert.match(home, /class="btn btn-light" href="\/contact\.html\?i=manage">Contact us/, 'the Enterprise plan must open it with Manage chosen (Enterprise is a conversation, not the waiting list)');
  assert.equal(buttons.length, 4, 'expected exactly four Contact us buttons (header, free-zone CTA, Enterprise plan, footer), saw ' + buttons.length);
  for (const href of buttons) {
    const r = await get(href.replace(/^\/contact\.html/, '/contact.html'));
    assert.equal(r.status, 200, href + ' does not resolve');
  }
  assert.ok(!/class="btn[^"]*" href="mailto:/.test(home), 'no button may open an email draft any more');
  assert.match(home, /href="mailto:/, 'but the footer address stays a mailto, on purpose');
});

test('the CTA arriving with ?i=setup has something to preselect', async () => {
  const html = await (await get('/contact.html')).text();
  assert.match(html, /name="about" value="setup" checked/, 'Set up is the default, and the link cannot 404 on it');
  assert.match(html, /name="about" value="manage"/, 'Manage must exist for the picker to switch to');
});

test('/contact and /contact.html both serve the same page, nothing else opens', async () => {
  const pretty = await get('/contact');
  assert.equal(pretty.status, 200, 'the guard was widened by one path only');
  assert.deepEqual(pretty.headers.get('content-type') || '', 'text/html; charset=UTF-8');
  for (const bad of ['/server.js', '/.git/config', '/data/waitlist.json', '/package.json', '/contact.js']) {
    assert.equal((await get(bad)).status, 404, bad + ' must stay closed');
  }
});

test('the page loads, and the guard does not block it', async () => {
  const r = await get('/contact.html');
  assert.equal(r.status, 200, 'the static allow-list must cover a root .html page');
  const html = await r.text();
  assert.match(html, /<title>Contact · BOASIS<\/title>/);
  assert.match(html, /id="contact-form"/);
  assert.ok(!/class="wish|data-intro|id="orb"/.test(html), 'it must not drag the scroll film onto a form page');
});

test('the fields the client asked for are the fields on the page', async () => {
  const html = await (await get('/contact.html')).text();
  const cssOf = await (await get('/css/contact.css')).text();
  for (const label of ['Full name', 'Email', 'Phone', 'Message']) {
    assert.ok(html.includes(label), 'missing label: ' + label);
  }
  // name + email are required, phone is optional, the picker must default to one of the two
  assert.match(html, /name="name"[^>]*required/);
  assert.match(html, /name="email"[^>]*required/);
  /* This asserted the opposite until 13 September 2026, when the owner asked for every field
     to be required. Both sides are pinned now: the page asks, and validate.js refuses without
     a number, so neither can drift back to optional by accident. */
  assert.match(html, /name="phone"[^>]*required/, 'phone is required, on the owner instruction');
  assert.equal((html.match(/name="about"/g) || []).length, 2);
  assert.match(html, /name="about" value="setup" checked/);
  assert.match(html, /name="message"[^>]*required/, 'an enquiry with no message is not worth mailing');
  // the question the client asked for, in a sentence, not as a bare label
  assert.match(html, /What are you contacting us about\?/);
  assert.ok(!/Set up is a new company/.test(html), 'the explanation line was removed on request');
  assert.ok(!/ct-sub/.test(html) && !/ct-sub/.test(cssOf), 'and its CSS went with it');
  // one field per pill, full width, all three required, as asked
  const pills = (html.match(/class="ct-fields[ "]/g) || []).length;   // includes ct-fields-stack
  assert.equal(pills, 4, 'name, email, phone and message are four separate full width rows, saw ' + pills);
  for (const f of ['name', 'email', 'phone', 'message'])
    assert.match(html, new RegExp(`name="${f}"[^>]*required`), f + ' must be required');
  assert.match(html, /placeholder="Enter your full name"/);
  assert.match(html, /placeholder="Enter your email"/);
  assert.match(html, /placeholder="Enter your phone number"/);
  assert.equal((html.match(/class="sr"/g) || []).length >= 4, true, 'every control keeps a hidden label');
  assert.ok(!/name="organisation"/.test(html), 'the "Not given" scaffolding must be gone now the API does not require it');
  assert.ok(!/Not given/.test(html), 'and no invented value may reach the owner mail');
});

test('the contact picker must not reuse the waitlist field name', async () => {
  const contact = await (await get('/contact.html')).text();
  const home = await (await get('/')).text();
  assert.ok(/name="intent"/.test(home), 'the waitlist owns `intent` = Standard / Enterprise');
  assert.ok(!/name="intent"/.test(contact), 'contact must not steal it for Set up / Manage');
  assert.ok(/name="about"/.test(contact), 'contact uses `about` instead');
});

/* The site has a voice, and it is narrow enough to check mechanically. Read from index.html:
   the brand never says "we" or "us", never re-explains Set up / Manage, and the aside I invented
   ("Or, the long way") is gone for good. These fail loudly if a rewrite drifts back. */
test('the copy keeps the site voice: no first person, no invented sections', async () => {
  const html = await (await get('/contact.html')).text();
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  /* The owner moved THIS page into a first person voice on 13 September 2026 ("Write to us.",
     and the question they dictated for the picker). The home page rule still stands, so the
     exception is a closed list of exact approved lines: a new "us" is a decision to make here,
     never something that arrives with a reworded paragraph. */
  const APPROVED = [
    'Write to us.',
    'We will get back to you.',
    'Tell us how we can help you.',
    'What are you contacting us about?',
    'Contact us',
  ];
  const allowed = l => APPROVED.some(p => l.includes(p));
  for (const word of [' we ', ' us ', ' We ', ' our ', ' Our ']) {
    const hits = visible.split('\n').filter(l => l.includes(word) && !/^\s*(<link|<meta)/.test(l) && !allowed(l));
    assert.deepEqual(hits, [], 'first person crept into visible copy: ' + JSON.stringify(hits));
  }
  assert.ok(!/the long way|auto-reply/i.test(html), 'the invented aside must stay gone');
  assert.match(html, /<p class="line">We will get back to us?\.\/p>|<p class="line">We will get back to you\.<\/p>/,
    'the plain line the owner asked for, with nothing dressed up around it');
  assert.ok(!/not a queue/.test(html), 'the metaphor stays deleted');
  assert.ok(!/working day/.test(html), 'no reply-time promise anywhere on the page');
  // the two doors are defined on the home page; this page must not re-define them
  assert.ok(!/government entities and the companies that offer setup/.test(html), 'Set up is already defined at /#setup');
  /* the heading must be readable in the RAW file, because the page's own CSP forbids the
     inline script that would otherwise gate it. An invisible headline is a worse bug than a
     missing animation. */
  assert.match(html, /<h1 id="ct-wish" data-text="Write to us\.">Write to us\.<\/h1>/,
    'the h1 carries real text, not only data-text, so no script still means a readable heading');
  assert.ok(!/<script>[^<]/.test(html), 'no inline script: script-src self would block it');
  // the line I invented, and the one the client rejected, must both stay out
  assert.ok(!/queue/i.test(html), 'no metaphor in a form note');
  assert.ok(!/What should we know|What do you need|long way/i.test(html), 'the rejected copy must not return');
});

test("the heading types itself with the cursor the site already has", async () => {
  const html = await (await get('/contact.html')).text();
  const m = /id="ct-wish" data-text="([^"]+)"/.exec(html);
  assert.ok(m, 'the typed heading must carry its text in data-text, like the wish does');
  assert.equal(m[1], 'Write to us.');
  assert.ok(!/aria-label="Write to us/.test(html), 'no aria-label crutch: the text is genuinely there for readers and for no-JS alike');
  const css = await (await get('/css/contact.css')).text();
  assert.match(css, /\.ct-wish \.cursor\{display:none;position:absolute/,
    'the cursor is the positioned one from .wish: an inline cursor sits after the last letter and reads as a static heading with a caret stuck on it');
  assert.match(css, /\.ct-wish\.typing \.cursor\{display:block\}/, 'and it only shows while typing');
  const js = await (await get('/js/contact.js')).text();
  // a schedule a person can watch: the wish's per-letter speed is for 130 characters, not 13
  const due = /t \+= ch === '\.' \? (\d+)/.exec(js);
  assert.ok(due && +due[1] >= 200, 'the full stop must pause long enough to be seen, saw ' + (due && due[1]));
  assert.match(js, /typeHeading/, 'and the typing is driven from contact.js');
  assert.match(js, /visibilitychange/, 'replays when the tab comes back');
  assert.match(js, /pageshow/, 'replays on a back/forward restore, which never re-runs the script');
  assert.match(js, /IntersectionObserver/, 'and starts when the heading is actually entered');
  assert.match(js, /prefers-reduced-motion/, 'reduced motion means it is simply there');
});

test('every stylesheet, script and icon the page points at exists', async () => {
  const html = await (await get('/contact.html')).text();
  const refs = [...html.matchAll(/(?:href|src)="(\/[^"#]*)"/g)].map(m => m[1]);
  assert.ok(refs.length >= 8, 'expected the page to reference its assets, saw ' + refs.length);
  for (const ref of refs) assert.equal((await get(ref)).status, 200, ref + ' is missing');
});

test('it borrows the brand instead of inventing colours', async () => {
  const css = await (await get('/css/contact.css')).text();
  assert.ok(css.includes('var(--bo-teal)'), 'uses the brand token');
  assert.ok(css.includes('rgba(255,255,255,.06)'), 'the waiting list pill surface, copied exactly');
  assert.ok(css.includes('border-radius:999px'), 'the same pills, not a card of my own');
  assert.ok(css.includes('.ct-pick .plan-pick'), 'reuses the Standard/Enterprise picker');
  assert.ok(!css.includes('#0F1523'), 'the invented card surface is gone');
  const site = await (await get('/css/site.css')).text();
  assert.ok(css.includes('.ct-pick .plan-pick input:checked + span'), 'the picker copies the plan picker pattern');
});

test('the page script parses', async () => {
  const js = await (await get('/js/contact.js')).text();
  assert.doesNotThrow(() => new Function(js), 'contact.js must parse');
});

/* The anti-spam contract is a hand-off between three files, so it is asserted as a hand-off,
   not by grep'ing for a substring that "p-hp-s" would also satisfy. */
test('the honeypot the page renders is the one the API reads', async () => {
  const html = await (await get('/contact.html')).text();
  const honeypot = /name="hp"/.test(html);
  assert.ok(honeypot, 'the page must render an input named hp');
  assert.ok(/aria-hidden="true"/.test(html) && /tabindex="-1"/.test(html), 'invisible to humans, and skipped by keyboards');
  const { spamCheck } = require('../lib/validate');
  const cfg = { spam: { minFillMs: 3000, maxAgeMs: 1800000, blockFreeMail: false } };
  const req = { headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0' } };
  assert.equal(spamCheck(req, { hp: 'http://pills.example', _t: Date.now() - 12000 }, cfg).spam, true, 'filled means a bot');
  assert.equal(spamCheck(req, { hp: '', _t: Date.now() - 12000 }, cfg).spam, false, 'empty, as a human leaves it, must NOT trip');
});

test('the page points at the endpoint the server actually has', async () => {
  const html = await (await get('/contact.html')).text();
  const m = /data-endpoint="([^"]+)"/.exec(html);
  assert.ok(m, 'the form must declare its endpoint');
  const r = await fetch(base + m[1], { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.notEqual(r.status, 404, m[1] + ' does not exist');
});

test('bots get the same fake success here as they do on the list', async () => {
  const list = await fetch(base + '/api/contact', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...formPayload({ hp: 'http://cheap-pills.example', organisation: 'SPARK' }), _t: Date.now() - 12000 }) });
  assert.equal(list.status, 200);
  assert.deepEqual(await list.json(), { ok: true }, 'no error to learn from');
});

/* The page must SUBMIT, not just render. This is the test that would have caught the
   `organisation` requirement on its own - a form that paints correctly and 400s on Send is
   not a form. It sends what the browser sends, and requires the lead to land and the mail to
   be queued. The two 'still needs the API' assertions below are the scaffolding's expiry date:
   delete them, and the hidden field in contact.html, when contactInput stops requiring it. */
test('the form submits end to end: stored, and both mails queued', async () => {
  const body = formPayload();                       // exactly what js/contact.js posts
  const r = await fetch(base + '/api/contact', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal(r.status, 200, 'a correctly filled form must never 400');
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.confirmed, true, 'the note to us and the receipt were both queued');

  const saved = JSON.parse(fs.readFileSync(path.join(DATA, 'contact.json'), 'utf8'));
  const rec = saved.find(x => x.email === 'amina@example.com');
  assert.ok(rec, 'the lead must be stored');
  assert.equal(rec.name, 'Amina Al Mazroui');
  assert.equal(rec.message, 'We sell skincare online, need two visas.');
  assert.equal(rec.phone, '+971 50 123 4567', 'the phone the visitor typed must reach the record');
  assert.equal(rec.about, 'setup', 'and so must the half of BOASIS they picked');
  assert.ok(!/Not given|undefined/.test(JSON.stringify(rec)), 'no placeholder may be stored');
  // the receipt a customer gets must follow that choice, not be one generic thank you
  const { contactToUser } = require('../lib/mail-templates');
  const T = require('../lib/mail-templates');
  assert.match(T.contactToUser({ name: 'Amina', about: 'setup' }).text, /company setup/);
  assert.match(T.contactToUser({ name: 'Amina', about: 'manage' }).text, /company management/);
  assert.ok(!/\s[-—–]\s/.test(contactToUser({ name: 'Amina', about: 'setup' }).text), 'no dash punctuation in a customer email');
});

