/* The SPARK demo entrance · task 1 of the plan
 *
 * Two things matter about this folder and nothing else: it must be reachable from the demo
 * host and it must never be reachable from boasis.ae. The first is a contract with the Supabase
 * functions; the second is a property of this repo, because merging to main deploys the site,
 * and an offer page that Google finds by accident is the one thing the plan forbids.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const SPARK = f => fs.readFileSync(path.join(ROOT, 'demo/spark', f), 'utf8');
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

test('the site never serves the demo entrance, whatever the folder is called', async () => {
  for (const p of ['/demo/', '/demo/spark/', '/demo/spark/index.html', '/demo/spark/spark.js', '/demo/spark/spark.css']) {
    const r = await get(p);
    const body = await r.text();
    assert.equal(r.status, 404, p + ' must not be served by boasis.ae, saw ' + r.status);
    assert.ok(!/id="eventForm"/.test(body), p + ' must not hand out the offer page');
  }
});

test('nothing on boasis.ae links to the entrance', async () => {
  for (const f of ['index.html', 'contact.html', 'early-access.html', 'blog.html', 'privacy.html', 'terms.html', '404.html', 'sitemap.xml', 'llms.txt', 'robots.txt']) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(!/demo\/spark|spark\.boasis\.ae|href="\/demo/.test(s), f + ' must not point at the demo entrance');
  }
});

test('the entrance page is built to stay out of the index', () => {
  const html = SPARK('index.html');
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/, 'the page says it plainly');
  assert.match(html, /<link rel="stylesheet" href="spark\.css">/, 'and it carries its own css, relative');
  assert.match(html, /<script src="spark\.js"><\/script>/, 'and its own script, relative');
  const robots = SPARK('robots.txt');
  assert.match(robots, /User-agent: \*/);
  assert.match(robots, /Disallow: \//);
});

test('the form asks only what the plan says it may ask', () => {
  const html = SPARK('index.html');
  for (const n of ['first_name', 'last_name', 'email', 'phone', 'country_code', 'residence', 'consent', 'hp']) {
    assert.match(html, new RegExp('name="' + n + '"'), 'the form carries ' + n);
  }
  /* the plan is explicit that the application part is not shown, so the fields that would
     start it must not be here in any form, hidden or otherwise */
  for (const bad of ['passport', 'emirates_id', 'kyc', 'video', 'upload', 'file"']) {
    assert.ok(!html.includes(bad), 'the application fields are not on this page: ' + bad);
  }
  assert.ok(!/emailv|verify-email|data-sendcode/.test(html), 'no mailbox check, per the plan: no waiting at a stand');
  assert.match(html, /<p class="err" data-note><\/p>/, 'and one place for a sentence the fields cannot carry');
});

test('the config a person has to set is empty on purpose, and says so', () => {
  const html = SPARK('index.html');
  const cfg = /window\.SPARK = \{([\s\S]*?)\};/.exec(html);
  assert.ok(cfg, 'the page declares its config in one block');
  assert.match(cfg[1], /endpoint: ''/, 'the Supabase function url is left blank, not guessed');
  assert.match(cfg[1], /brainUrl: ''/, 'and so is the Brain address');
  assert.match(cfg[1], /source: 'ai-everything-2026'/, 'while the source is fixed, because that is what the reports are cut by');
});

test('the orb is the site orb, copied and not forked', () => {
  const a = fs.readFileSync(path.join(ROOT, 'js/yara-orb.js'), 'utf8');
  const b = SPARK('yara-orb.js');
  assert.equal(b, a, 'the copy in demo/spark must be byte for byte the site file, or the two drift');
});

test('the page reaches for bundle paths that the copy step can actually fill', () => {
  const html = SPARK('index.html');
  const paths = [...html.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)].map(m => m[1]);
  assert.ok(paths.length >= 3, 'the brand mark, the fallback and the video, saw ' + paths.length);
  for (const p of new Set(paths)) {
    assert.ok(fs.existsSync(path.join(ROOT, p)), 'the site has to carry ' + p + ' for the bundle copy to work');
  }
});

test('the rules the whole demo stands on, in one module', async () => {
  const c = await import(path.join(ROOT, 'demo/supabase/functions/_shared/spark-core.js'));
  const ok = { first_name: 'Lena', last_name: 'Bisht', email: 'LENA@corp.com', phone: '0551112222', country_code: '+971', consent: true, _t: 9000 };

  const good = c.readForm(ok);
  assert.equal(good.ok, true, 'a normal person passes');
  assert.equal(good.contact.email, 'lena@corp.com', 'and the address is written the way it will be searched');
  assert.equal(good.contact.phone, '+971 551112222', 'the local trunk zero is dropped, as on the site forms');
  assert.equal(c.readForm({ ...ok, country_code: '+1' }).contact.phone, '+1 0551112222', 'except where the zero belongs to the number');

  for (const [why, body] of [
    ['a filled honeypot', { ...ok, hp: 'https://seo.example' }],
    ['faster than a person', { ...ok, _t: 300 }],
    ['no consent', { ...ok, consent: false }],
    ['a short number', { ...ok, phone: '555' }],
    ['no at sign', { ...ok, email: 'lena@corp' }],
    ['no last name', { ...ok, last_name: '  ' }],
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
  let lead = c.buildLead({ pass: 'PASSABCDEFGH', contact: { first_name: 'L', last_name: 'B', email: 'l@corp.com', phone: '+971 5', consent: true }, now });
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
  const doc = fs.readFileSync(path.join(ROOT, 'docs/SPARK.md'), 'utf8');
  for (const need of ['leads/', 'create-pass', 'save-step', 'noindex', 'limit_req', 'BUCKET', 'SUPABASE_SERVICE_ROLE_KEY', 'X-Robots-Tag']) {
    assert.ok(doc.includes(need), 'docs/SPARK.md must name ' + need);
  }
  assert.ok(!/service_role[^]{0,120}browser|page[^]{0,40}service_role/.test(doc), 'the doc must never put the service key in the page');
});
