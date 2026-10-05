/* The SPARK demo entrance · task 1 of the plan
 *
 * The page lives on boasis.ae itself, at /try-mira, because that was the owner's call: same
 * domain, own path, nothing to issue a certificate for the night before. Two properties have to
 * stay true, and both are only checkable against the running server: it is reachable at that
 * address, and it is invisible to everything else on the site, so being found by Google stays
 * the accident it must never become.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const HTML = () => read('try-mira.html');
const JS = () => read('js/try-mira.js');
const { inspect } = require('../lib/protect');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'boasis-spark-'));
let proc, base;

before(async () => {
  proc = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, BOASIS_NO_ENV_FILE: '1', PORT: '0', DATA_DIR: DATA, MAIL_DRY_RUN: '1', VISITOR_SALT: 'test-salt' },
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

test('the entrance answers at its own address, with its own headers', async () => {
  for (const p of ['/try-mira', '/try-mira/', '/try-mira.html']) {
    const r = await get(p);
    const body = await r.text();
    assert.equal(r.status, 200, p + ' is where the QR points, saw ' + r.status);
    assert.match(body, /id="eventForm"/, p + ' hands out the form itself');
    assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow', p + ' is refused to the index in the header too');
    const csp = r.headers.get('content-security-policy') || '';
    assert.match(csp, /connect-src[^;]*supabase\.co/, p + ' may post to the function, and that is the only widening');
    assert.ok(!/script-src[^;]*unsafe-inline/.test(csp), 'and inline script is still forbidden, so nothing about the demo loosens it');
  }
  for (const p of ['/css/try-mira.css', '/js/try-mira.js', '/js/yara-orb.js', '/assets/orb/orb.mp4', '/assets/logo/orb-512.png']) {
    const r = await get(p);
    assert.equal(r.status, 200, p + ' has to be reachable or the page loads half dressed');
  }
});

test('the guard still owns the door: the folder the functions live in is not a page', async () => {
  for (const p of ['/demo/', '/demo/spark/index.html', '/demo/supabase/functions/create-pass/index.ts', '/demo/supabase/functions/_shared/spark-core.js']) {
    const r = await get(p);
    assert.equal(r.status, 404, p + ' must never be served, saw ' + r.status);
  }
  const cases = [
    ['/try-mira', true], ['/try-mira.html', true], ['/css/try-mira.css', true], ['/js/try-mira.js', true],
    ['/demo/spark/index.html', false], ['/try-mira/../server.js', false], ['/try-mira.json', false],
  ];
  for (const [p, ok] of cases) {
    assert.equal(inspect(p).ok === true, ok, 'the guard reads ' + p + ' as ' + (ok ? 'a page or an asset' : 'nothing'));
  }
});

test('nothing on the site leads a crawler to it, and robots.txt is the one that says so', () => {
  const site = ['index.html', 'contact.html', 'early-access.html', 'blog.html', 'privacy.html', 'terms.html', '404.html', 'sitemap.xml', 'llms.txt'];
  for (const f of site) {
    assert.ok(!/try-mira/.test(read(f)), f + ' must not link the demo entrance');
  }
  const robots = read('robots.txt');
  assert.ok((robots.match(/Disallow: \/try-mira/g) || []).length >= 5, 'every block that is allowed in must be told the one path to leave out');
  assert.ok(!/Sitemap:[^\n]*try-mira/.test(robots), 'and it is in no sitemap');
});

test('the page is built the way this site is built', () => {
  const html = HTML();
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/, 'the page says it plainly to anything that reads the file');
  assert.ok(!/<script(?![^>]*\bsrc=)/.test(html), 'no inline script, because the policy of this site forbids it');
  assert.match(html, /<link rel="stylesheet" href="\/css\/try-mira\.css">/, 'its css sits with the rest of the site css');
  assert.match(html, /<script src="\/js\/try-mira\.js"><\/script>/, 'and its script with the rest of the site js');
  assert.match(html, /<script src="\/js\/yara-orb\.js"><\/script>/, 'the orb is the site orb, not a copy that can drift');
  for (const m of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) {
    assert.ok(fs.existsSync(path.join(ROOT, m[1])), 'and ' + m[1] + ' is a file the site really has');
  }
  assert.ok(!/demo\/spark|\.\.\//.test(html), 'no bundle to assemble and no path that walks out of it');
});

test('the form asks only what the plan says it may ask', () => {
  const html = HTML();
  for (const n of ['full_name', 'email', 'phone', 'country_code', 'residence', 'consent', 'hp']) {
    assert.match(html, new RegExp('name="' + n + '"'), 'the form carries ' + n);
  }
  assert.match(html, /<label for="full_name">Full name<\/label>/, 'one name field, as the owner asked');
  assert.ok(!/name="(first|last)_name"/.test(html), 'and not two');
  /* the plan is explicit that the application part is not shown, so the fields that would
     start it must not be here in any form, hidden or otherwise */
  for (const bad of ['passport', 'emirates_id', 'kyc', 'video', 'upload', 'file"']) {
    assert.ok(!html.includes(bad), 'the application fields are not on this page: ' + bad);
  }
  assert.ok(!/emailv|verify-email|data-sendcode/.test(html), 'no mailbox check, per the plan: no waiting at a stand');
  assert.match(html, /<p class="err" data-note><\/p>/, 'and one place for a sentence the fields cannot carry');
});

test('the two addresses a person has to paste are empty on purpose', () => {
  const cfg = /var CFG = window\.SPARK = \{([\s\S]*?)\};/.exec(JS());
  assert.ok(cfg, 'the script declares its config in one block, at the top');
  assert.match(cfg[1], /endpoint: ''/, 'the Supabase function url is left blank, not guessed');
  assert.match(cfg[1], /brainUrl: ''/, 'and so is the Brain address, which the client still owes');
  assert.match(cfg[1], /source: 'ai-everything-2026'/, 'while the source is fixed, because that is what the reports are cut by');
  assert.ok(!/https?:\/\/(?!fonts)/.test(cfg[1]), 'and neither one is filled in by a developer guessing later');
});

test('the header is the one every page of this site carries, with nothing added', () => {
  const html = HTML();
  assert.match(html, /<header class="nav">\s*<div class="nav-bar">/, 'the same two elements, in the same order as the home page');
  assert.match(read('index.html'), /<header class="nav">\s*<div class="nav-bar">/, 'and the home page agrees');
  assert.ok(html.indexOf('href="https://boasis.ae/" aria-label="BOASIS">B<img src="/assets/logo/orb-160.png" alt="">ASIS</a>') > 0, 'the logo, spelled as the site spells it');
  assert.ok(!/class="tabs"|nav-wait|nav-contact/.test(html), 'no menu and no button, because there is nowhere else on this page to go');
  const head = read('css/try-mira.css');
  assert.match(head, /\.nav\{position:fixed/, 'the bar floats over the page the way it does on boasis.ae');
  assert.match(head, /\.nav-bar\{position:relative; pointer-events:auto/, 'and the pill is the site\'s own, copied rather than invented');
});

test('the local rehearsal serves what the site serves, at the same address', async () => {
  /* this is the command the owner runs tonight, so it is tested rather than trusted */
  const stub = spawn(process.execPath, [path.join(ROOT, 'scripts/spark-stub.js')], {
    cwd: ROOT, env: { ...process.env, PORT: '0', SPARK_BUCKET_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'boasis-stub-')) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  try {
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('stub did not start: ' + log)), 12000);
      stub.stdout.on('data', d => { log += d; if (/localhost:(\d+)/.test(log)) { clearTimeout(t); res(); } });
      stub.on('exit', c => rej(new Error('stub exited ' + c + ': ' + log)));
    });
    const at = p => fetch('http://127.0.0.1:' + /localhost:(\d+)/.exec(log)[1] + p).then(async r => ({ s: r.status, b: await r.text() }));
    const printed = await at('/try-mira');
    const bare = await at('/');
    assert.equal(printed.s, 200, 'the printed address answers, saw ' + log);
    assert.equal(bare.s, 200, 'and so does the root of the stub');
    assert.match(printed.b, /id="eventForm"/);
    for (const p of ['/css/try-mira.css', '/js/try-mira.js', '/js/yara-orb.js', '/assets/logo/orb-512.png']) {
      assert.equal((await at(p)).s, 200, p + ' has to be there for the page to look like the page');
    }
    /* the stub is the one that fills the endpoint in, so the rehearsal posts at itself */
    assert.match((await at('/js/try-mira.js')).b, /endpoint: '\/functions\/v1\/create-pass'/, 'the rehearsal is wired, the shipped file is not');

    const sent = await fetch('http://127.0.0.1:' + /localhost:(\d+)/.exec(log)[1] + '/functions/v1/create-pass', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ full_name: 'Lena Bisht', email: 'lena+' + Date.now() + '@corp.com', phone: '0551112222', country_code: '+971', consent: true, _t: 9000 }),
    }).then(r => r.json());
    assert.match(sent.pass, /^PASS[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/, 'a form filled through the stub earns a real pass');
    const saved = await fetch('http://127.0.0.1:' + /localhost:(\d+)/.exec(log)[1] + '/functions/v1/save-step', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pass: sent.pass, step: 'package', data: { price_aed: 15750, confirmed: true } }),
    }).then(r => r.json());
    assert.equal(saved.ok, true, 'and the step lands in the same file');
    const lead = JSON.parse((await at('/file?pass=' + sent.pass)).b);
    assert.equal(lead.contact.full_name, 'Lena Bisht', 'the name the form asked for, as one string');
    assert.equal(lead.brain.package.price_aed, 15750, 'the estimate from the Brain, in the same object');
    assert.equal(lead.version, 2, 'two writes, counted');
  } finally {
    stub.kill('SIGTERM');
  }
});

test('the rules the whole demo stands on, in one module', async () => {
  const c = await import(path.join(ROOT, 'demo/supabase/functions/_shared/spark-core.js'));
  const ok = { full_name: 'Lena Bisht', email: 'LENA@corp.com', phone: '0551112222', country_code: '+971', consent: true, _t: 9000 };

  const good = c.readForm(ok);
  assert.equal(good.ok, true, 'a normal person passes');
  assert.equal(good.contact.full_name, 'Lena Bisht', 'one name, kept as one string');
  assert.equal(c.readForm({ ...ok, full_name: '  Ravi   Menon ' }).contact.full_name, 'Ravi Menon', 'stray spaces tidied, no other change');
  assert.equal(good.contact.email, 'lena@corp.com', 'and the address is written the way it will be searched');
  assert.equal(good.contact.phone, '+971 551112222', 'the local trunk zero is dropped, as on the site forms');
  assert.equal(c.readForm({ ...ok, country_code: '+1' }).contact.phone, '+1 0551112222', 'except where the zero belongs to the number');

  for (const [why, body] of [
    ['a filled honeypot', { ...ok, hp: 'https://seo.example' }],
    ['faster than a person', { ...ok, _t: 300 }],
    ['no consent', { ...ok, consent: false }],
    ['a short number', { ...ok, phone: '555' }],
    ['no at sign', { ...ok, email: 'lena@corp' }],
    ['no name at all', { ...ok, full_name: '   ' }],
    ['nothing at all', {}],
  ]) {
    assert.equal(c.readForm(body).ok, false, 'refused for ' + why);
  }
  assert.equal(c.readForm({ ...ok, hp: 'x' }).error, 'bot', 'and the reason is a code, not a sentence');
  assert.equal(c.readForm({ ...ok, _t: 10 }).error, 'too-fast');
  assert.equal(c.readForm({ ...ok, consent: false }).error, 'consent');

  /* a pass is read aloud across a loud hall: twelve characters, none of them ambiguous, and
     nothing that can be turned into a file name */
  const pass = c.makePass(() => 0.999);
  assert.match(pass, /^PASS[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/, 'no I, O, 0 or 1: ' + pass);
  assert.equal(c.isPass('PASSABCDEFGH'), true);
  for (const bad of ['', 'passabcdefgh', '../../etc/passwd', 'PASSABCDEFGH;rm -rf', 'PASS123', 'PASSABCDEFGHIJ9']) {
    assert.equal(c.isPass(bad), false, 'a pass like ' + JSON.stringify(bad) + ' is not a pass');
  }
});

test('the lead file grows and never shrinks', async () => {
  const c = await import(path.join(ROOT, 'demo/supabase/functions/_shared/spark-core.js'));
  const now = Date.UTC(2026, 9, 5, 8);
  let lead = c.buildLead({ pass: 'PASSABCDEFGH', contact: { full_name: 'Lena Bisht', email: 'l@corp.com', phone: '+971 5', consent: true }, now });
  assert.equal(lead.brain.steps_reached.length, 0, 'it starts empty');
  assert.equal(lead.version, 1);
  assert.match(lead.expires_at, /^2026-10-06/, 'and it is good for a day, at midnight plus the hours');

  lead = c.applyStep(lead, 'describe', { description: 'A small import business.' }, now + 60000);
  assert.equal(lead.brain.description, 'A small import business.', 'the words they typed are kept as typed');
  lead = c.applyStep(lead, 'mira', { question: 'How many partners?', answer: 'Two.' }, now + 120000);
  lead = c.applyStep(lead, 'mira', { question: 'Visas?', answer: 'Four.' }, now + 180000);
  assert.equal(lead.brain.mira.length, 2, 'every exchange is appended, not replaced');
  lead = c.applyStep(lead, 'activities', { shown: ['A', 'B'], picked: ['A'] }, now + 240000);
  lead = c.applyStep(lead, 'activities', { picked: ['A', 'B'], confirmed: true }, now + 300000);
  assert.deepEqual(lead.brain.activities.shown, ['A', 'B'], 'a later step may say less and must not lose what was shown');
  assert.equal(lead.brain.activities.confirmed, true);
  lead = c.applyStep(lead, 'package', { price_aed: 15000, premises: 'Shared desk' }, now + 360000);
  assert.equal(lead.brain.package.price_aed, 15000, 'and the estimate lands in the same file');
  assert.deepEqual(lead.brain.steps_reached, ['describe', 'mira', 'activities', 'package'], 'progress is the list of steps, in order');
  assert.equal(lead.version, 7, 'every write counts itself, so a stale reader can see it is stale');

  assert.equal(c.applyStep(lead, 'kyc', {}, now), null, 'a step outside the four is refused, not stored');
  assert.equal(c.applyStep(lead, 'describe', { description: 'x'.repeat(9000) }, now).brain.description.length, 4000, 'and nothing arrives bigger than the file can carry');

  /* the pass is the only credential there is, so its checks are the whole door */
  assert.equal(c.checkPass('PASSABCDEFGH', lead, now).ok, true, 'in the hour it works');
  assert.equal(c.checkPass('PASSABCDEFGH', lead, now + 25 * 3600 * 1000).error, 'expired', 'the next morning it does not');
  assert.equal(c.checkPass('PASSABCDEFGH', null, now).error, 'unknown', 'a pass with no file behind it is nothing');
  assert.equal(c.checkPass('..', lead, now).error, 'pass', 'and a string that is not a pass never reaches the bucket');
});

test('the handover says what to click, and the contract is in it', () => {
  const doc = read('docs/SPARK.md');
  for (const need of ['leads/', 'create-pass', 'save-step', 'noindex', 'BUCKET', 'SUPABASE_SERVICE_ROLE_KEY',
    'X-Robots-Tag', 'connect-src', 'full_name', 'try-mira.html', 'js/try-mira.js']) {
    assert.ok(doc.includes(need), 'docs/SPARK.md must name ' + need);
  }
  assert.ok(!/service_role[^]{0,120}browser|page[^]{0,40}service_role/.test(doc), 'the doc must never put the service key in the page');
  assert.ok(!/spark\.boasis\.ae/.test(doc), 'and it no longer sends anyone to a host that was never bought');
});
