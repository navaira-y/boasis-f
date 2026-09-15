const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/* End to end: a real server, real HTTP, real files. Unit tests could not catch the two
   bugs this one does — a field renamed between the endpoint and the template, and a value
   the mailer dropped on the floor. Anything that crosses a module boundary belongs here. */
const ROOT = path.resolve(__dirname, '..');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'boasis-test-'));
let proc, base;

const wait = ms => new Promise(r => setTimeout(r, ms));
async function up() {
  proc = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: '0', DATA_DIR: DATA, MAIL_DRY_RUN: '1', VISITOR_SALT: 'test-salt' , RATE_LIMIT_FORMS_PER_MIN: '10000', RATE_LIMIT_VISITS_PER_MIN: '10000' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server did not start: ' + log)), 15000);
    proc.stdout.on('data', d => { log += d; if (/port \d{2,6}/.test(log)) { clearTimeout(t); res(); } });
    proc.stderr.on('data', d => { log += d; });
    proc.on('exit', c => rej(new Error('exited ' + c + ': ' + log)));
  });
  base = 'http://127.0.0.1:' + /port (\d+)/.exec(log)[1];
  return base;
}
const post = (p, body, headers = {}) => fetch(base + p, {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body),
});
const get = p => fetch(base + p);
const HUMAN = () => ({ _t: Date.now() - 12000 });
const read = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

before(async () => { await up(); });
after(() => { proc.kill('SIGTERM'); try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) {} });

test('the site boots and serves the real page', async () => {
  const r = await get('/');
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.ok(html.includes('<title>BOASIS'), 'the page');
  assert.ok(html.includes('/js/site.js'), 'and its script tag');
});

test('a human joining the waitlist is stored, and both mails are prepared', async () => {
  const r = await post('/api/waitlist', { name: 'Amina Al Mazroui', email: 'Amina@Example.COM', intent: 'enterprise', ...HUMAN() });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.confirmed, true, 'the mailer reported it queued both mails');
  const list = read('waitlist.json');
  const me = list.find(e => e.email === 'amina@example.com');
  assert.ok(me, 'stored, lowercased');
  assert.equal(me.intent, 'enterprise');
});

test('the same address joining twice is still one lead', async () => {
  await post('/api/waitlist', { name: 'Amina A', email: 'amina@example.com', intent: 'standard', ...HUMAN() });
  const list = read('waitlist.json');
  assert.equal(list.filter(e => e.email === 'amina@example.com').length, 1, 'no duplicates');
});

test('the owner mail actually carries the fields, with no undefined leaking in', async () => {
  const { waitlistToOwner } = require('../lib/mail-templates');
  const rec = read('waitlist.json').find(e => e.email === 'amina@example.com');
  const m = waitlistToOwner({ ...rec, ip: 'deadbeef' });
  assert.ok(!/undefined/.test(m.text), 'text: ' + m.text);
  assert.ok(!/undefined/.test(m.html), 'html contains a literal "undefined"');
  assert.ok(m.text.includes('amina@example.com'), 'the address we reply to');
  assert.ok(m.text.includes('Enterprise'), 'the plan');
});

test('a contact enquiry keeps its phone, topic and company under one name end to end', async () => {
  const r = await post('/api/contact', { name: 'Fatim', email: 'f@spark.ae', phone: '+971 50 999 8888', about: 'setup', organisation: 'SPARK', message: 'A demo for our free zone.', ...HUMAN() });
  assert.equal((await r.json()).ok, true);
  const c = read('contact.json')[0];
  assert.equal(c.organisation, 'SPARK', 'stored as organisation, not authority');
  assert.ok(!('authority' in c), 'and not both');
  assert.equal(c.about, 'setup', 'the legacy topic field still lands for the older links that send it');
  const { contactToOwner, contactToUser } = require('../lib/mail-templates');
  const mail = contactToOwner(c);
  assert.ok(mail.text.includes('SPARK'), 'the mail shows the company');
  assert.ok(mail.text.includes('+971 50 999 8888'), 'and the phone, which is the whole point of asking');
  assert.ok(!/undefined/.test(mail.text), 'nothing leaks an undefined line into the owner mail');
  // the form no longer asks which half of BOASIS it is about, so the receipt offers both,
  // plainly, in one mail: a demo for the ones setting up, a review for the ones running
  const receipt = contactToUser({ name: 'Fatim' }).text;
  assert.match(receipt, /demo of Mira/, 'a visitor setting a company up is offered the demo');
  assert.match(receipt, /review of its licences/, 'a company already running is offered the review');
  assert.ok(!/\s[-—–]\s/.test(receipt + mail.text), 'no hyphen or dash used as punctuation in mail copy');
});

test('a demo request from the dialog is stored, and both mails are prepared', async () => {
  const r = await post('/api/demo', { name: 'Fatim', email: 'f@spark.ae', phone: '+971 50 999 8888', who: 'gov', entity: 'SPARK', ...HUMAN() });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.confirmed, true, 'the note to us and the receipt were both queued');
  const c = read('demo.json')[0];
  assert.equal(c.who, 'gov');
  assert.equal(c.entity, 'SPARK');
  const { demoToOwner, demoToUser } = require('../lib/mail-templates');
  const mail = demoToOwner(c);
  assert.ok(mail.text.includes('SPARK'), 'the owner mail shows who they work for');
  assert.ok(mail.text.includes('Government authority'), 'and which kind of visitor it is');
  assert.ok(mail.text.includes('+971 50 999 8888'), 'and the number, which is the whole point of asking');
  assert.ok(!/undefined/.test(mail.text), 'nothing leaks an undefined line');
  assert.match(demoToUser(c).text, /Mira working on your own activity list/, 'the receipt promises the demo on their own list');
  assert.ok(!/\s[-—–]\s/.test(mail.text + demoToUser(c).text), 'no dash punctuation in dialog mail');
});

test('an early access request from the dialog is stored, and both mails are prepared', async () => {
  const r = await post('/api/manage', { name: 'Lena', email: 'lena@example.com', phone: '+971 55 111 2222', have: 'yes', count: '1-3', authority: 'SPARK Free Zone', ...HUMAN() });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.confirmed, true);
  const c = read('manage.json')[0];
  assert.equal(c.have, 'yes');
  assert.equal(c.count, '1-3');
  assert.equal(c.authority, 'SPARK Free Zone');
  const { manageToOwner, manageToUser } = require('../lib/mail-templates');
  const mail = manageToOwner(c);
  assert.ok(mail.text.includes('SPARK Free Zone'), 'the owner mail shows the authority');
  assert.ok(mail.text.includes('Yes'), 'and whether they have a company');
  assert.ok(mail.text.includes('1-3'), 'and how many');
  assert.ok(!/undefined/.test(mail.text), 'nothing leaks an undefined line');
  assert.match(manageToUser(c).text, /one email when your access is ready/i, 'the receipt keeps the one promise');
});

test('a dialog posting a junk answer is a 400 naming the field, never a 500', async () => {
  const r = await post('/api/demo', { name: 'Fatim', email: 'f@spark.ae', phone: '+971 50 999 8888', who: 'something else', entity: 'SPARK', ...HUMAN() });
  assert.equal(r.status, 400);
  const j = await r.json();
  assert.equal(j.ok, false);
  assert.ok(j.errors.includes('who'), 'the closed set is enforced server-side');
  const r2 = await post('/api/manage', { name: 'Lena', email: 'nope', phone: '12', have: '', count: '', authority: '', ...HUMAN() });
  assert.equal(r2.status, 400);
  const j2 = await r2.json();
  assert.ok(j2.errors.includes('email') && j2.errors.includes('phone') && j2.errors.includes('have'), JSON.stringify(j2.errors));
});

test('the bot traps are each enough on their own', async () => {
  const good = { name: 'Bot', email: 'b@x.com' };
  const caught = [];
  const honeypot = await post('/api/waitlist', { ...good, ...HUMAN(), company_website: 'http://pills' });
  caught.push(honeypot.status === 200);
  const fast = await post('/api/waitlist', { ...good, _t: Date.now() - 30 });
  caught.push(fast.status === 200);
  const noToken = await post('/api/waitlist', good, { 'user-agent': 'Mozilla/5.0 (iPhone)' });
  caught.push(noToken.status === 200);
  assert.deepEqual(caught, [true, true, true]);
  const list = read('waitlist.json');
  assert.equal(list.filter(e => e.email === 'b@x.com').length, 0, 'none of them were stored');
});

test('invalid input is a 400 naming the field; bot-shaped input is never a 500', async () => {
  // a real person (token present) with rubbish fields -> 400, and it says which field
  for (const [bad, field] of [[{ name: 'x', email: 'a@b.co' }, 'name'],
                              [{ name: 'Amina', email: 'nope' }, 'email'],
                              [{ name: 'Amina' }, 'email'],
                              [{ email: 'a@b.co' }, 'name']]) {
    const r = await post('/api/waitlist', { ...bad, ...HUMAN() });
    assert.equal(r.status, 400, JSON.stringify(bad));
    const j = await r.json();
    assert.equal(j.ok, false);
    assert.ok(j.errors.includes(field), `must name "${field}", said ${JSON.stringify(j.errors)}`);
  }
  /* a body that is not an object, or not valid JSON at all, is a client error first
  // and always the same answer — an array must not behave differently from a null
     and always the same answer — an array must not behave differently from a null.
     Never a stack trace to the browser either. */
  for (const junk of ['null', '[]', '[1,2]', '123', '"str"', '{']) {
    const r = await post('/api/waitlist', junk);
    assert.ok(r.status === 400, junk + ' -> ' + r.status);
    const body = await r.text();
    assert.ok(!body.includes('at ') && !body.includes('node_modules'), 'no stack trace in the response');
  }
  /* An empty body parses to {} — a well-shaped object with nothing in it. So it is not a
     shape error, it is bot-shaped input, and the bot rule applies: fake success, store
     nothing. The two must not be confused, and neither may become a 500. */
  const empty = await post('/api/waitlist', '');
  assert.equal(empty.status, 200, 'empty body is a bot, not a parse failure');
  assert.deepEqual(await empty.json(), { ok: true });

  // rubbish that also looks like a bot (no token) is fake-succeeded, not 400: a script
  // must not learn that its payload was the problem rather than its behaviour
  for (const botish of [{}, { name: 'x', email: 'nope' }]) {   // valid JSON objects, no token
    const r = await post('/api/waitlist', botish);
    assert.equal(r.status, 200, JSON.stringify(botish));
    assert.deepEqual(await r.json(), { ok: true });
  }
});


test('nothing outside the site is downloadable, through the real server', async () => {
  for (const p of ['/server.js', '/package.json', '/package-lock.json', '/.env', '/.git/config',
                   '/lib/mailer.js', '/config/env.js', '/docs/EMAIL.md', '/data/waitlist.json',
                   '/js/../../server.js', '/css/..%2f..%2f.git%2fconfig']) {
    const r = await fetch(base + p.replace(/ /g, '%20'), { redirect: 'manual' });
    assert.equal(r.status, 404, p + ' returned ' + r.status);
  }
  for (const p of ['/css/site.css', '/js/site.js', '/assets/logo/orb-160.png']) {
    assert.equal((await get(p)).status, 200, p + ' must still load');
  }
});

test('the visitor is never told more than they need, and x-powered-by is off', async () => {
  const r = await get('/');
  assert.equal(r.headers.get('x-powered-by'), null, 'the stack is not advertised');
  assert.ok((r.headers.get('content-type') || '').includes('text/html'));
});

test('30 concurrent sign-ups cannot lose a record (atomic writes)', async () => {
  const before = read('waitlist.json').length;
  await Promise.all(Array.from({ length: 30 }, (_, i) =>
    post('/api/waitlist', { name: 'Person ' + i, email: 'c' + i + '@x.com', intent: 'standard', ...HUMAN() })));
  const after = read('waitlist.json').length;
  assert.equal(after, before + 30, `expected ${before + 30}, saw ${after} — a record was lost`);
  const stray = fs.readdirSync(DATA).filter(f => f.includes('.tmp'));
  assert.deepEqual(stray, [], 'no temp files left behind');
});

/* Route ORDER is a classic silent failure: an endpoint registered after the
   app.get('*') catch-all answers with the homepage and still returns 200. Only an
   end-to-end request sees that, which is exactly why it is asserted here. */
test('every API route answers with JSON, not the catch-all page', async () => {
  for (const p of ['/api/health', '/api/first-visit']) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
    assert.match(r.headers.get('content-type') || '', /application\/json/, p + ' is not JSON — it is being caught by /*');
  }
  const h = await (await get('/api/health')).json();
  assert.equal(h.ok, true);
  assert.equal(typeof h.uptime, 'number');
  assert.ok(['live', 'dry-run'].includes(h.mail));
  assert.ok(!('apiKey' in h) && !('notifyTo' in h), 'health must not leak config');
  assert.match(h.node, /^\d+\./, 'and it does report the runtime');
});

test('first-visit is a hash, never an address, and second call is not first', async () => {
  /* a unique address per run, so this does not depend on who else visited first —
     a test that passes only when it runs first is a test that fails on a Tuesday */
  const ip = '203.0.113.' + (Math.floor(Math.random() * 200) + 20);      // TEST-NET, never routable
  const visit = () => fetch(base + '/api/first-visit', { headers: { 'x-forwarded-for': ip } }).then(r => r.json());
  const a = await visit();
  const b = await visit();
  assert.equal(a.first, true, 'a stranger is new'); assert.equal(b.first, false, 'and known the second time');
  // a different address is still a stranger
  assert.equal((await fetch(base + '/api/first-visit').then(r => r.json())).first !== undefined, true, 'the endpoint answers at all');
  const v = read('visitors.json');
  const keys = Object.keys(v);
  assert.ok(keys.every(k => /^[0-9a-f]{16}$/.test(k)), 'keys are short hashes');
  const raw = JSON.stringify(v);
  assert.ok(!/127\.0\.0\.1|::1|::ffff/.test(raw), 'no IP appears in the file at all');
});
