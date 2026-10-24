/* The second entrance · boasis.ae/spark-event, for Sharjah Next on 28 and 29 October
 *
 * Three things have to stay true, and each one has a way of being quietly broken by the kind of
 * change that looks harmless: the page has to answer at that address and nowhere else in the site's
 * own links, its copy has to stay the words the client's design handed over, and its rows have to
 * land in their own table while the Brain still finds them by the pass alone. The first is checked
 * against a running server, the second against the file, the third against the two Supabase doors
 * and the SQL that makes the table.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const HTML = () => read('spark-event.html');
const JS = () => read('js/spark-event.js');

/* the copy as a reader sees it: tags gone, entities back into characters, one space between words.
   Asserting against this rather than against the markup means the check is about the sentence a
   person reads, and reformatting the page cannot break it. */
function text(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&rarr;/g, '→').replace(/&rsquo;/g, '’')
    .replace(/&#10003;/g, '✓').replace(/&#8226;/g, '·')
    .replace(/\s+/g, ' ').trim();
}

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'boasis-event-'));
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

test('the event page answers at its address, with its own headers', async () => {
  for (const p of ['/spark-event', '/spark-event/', '/spark-event.html']) {
    const r = await get(p);
    const body = await r.text();
    assert.equal(r.status, 200, p + ' is where the screen and the QR point, saw ' + r.status);
    assert.match(body, /id="eventForm"/, p + ' hands out the form itself');
    assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow', p + ' is refused to the index in the header as well as the page');
    const csp = r.headers.get('content-security-policy') || '';
    assert.match(csp, /connect-src[^;]*supabase\.co/, p + ' may post for a pass, and that is the only widening');
    assert.match(csp, /frame-src[^;]*brain\.boasis\.ae/, p + ' is allowed to frame the Brain');
    assert.ok(!/script-src[^;]*unsafe-inline/.test(csp), 'and inline script stays forbidden on it');
  }
  for (const p of ['/js/spark-event.js', '/js/yara-orb.js', '/js/countries.js', '/assets/orb/orb.mp4', '/assets/logo/orb-512.png']) {
    const r = await get(p);
    assert.equal(r.status, 200, p + ' has to be reachable or the page loads half dressed');
  }
});

test('it is the same page as /try-mira where the two should agree, and different where they must not', () => {
  const event = HTML(), other = read('try-mira.html');
  /* the theme, rule for rule: the header capsule, the night behind it, the orb, the phone pill and
     the reduced motion answer. Both pages carry the same text, so a fix to one is a fix to the
     site rather than a difference to discover on a phone at a stand. */
  const share = ['--bo-night:#0B0D12', '.nav-bar{', 'rgba(11,13,18,.97)', '.mf-phone{', '.orbwrap{',
    '@media (prefers-reduced-motion:reduce)', '.step::after{', '.cc-pop{'];
  for (const rule of share) {
    assert.ok(event.includes(rule), 'the theme rule ' + rule.slice(0, 26) + ' is the site\'s own, carried over, not rewritten');
    assert.ok(other.includes(rule), 'and ' + rule.slice(0, 26) + ' says the same thing on /try-mira');
  }
  assert.match(event, /<script src="\/js\/spark-event\.js\?v=\d+"><\/script>/,
    'its script is asked for with a version, so a phone at the stand cannot hold the old one');
  assert.ok(event.indexOf('/js/countries.js') < event.indexOf('/js/spark-event.js'), 'the shared picker loads before the page script that calls it');
  assert.ok(!/<script>[\s\S]*?<\/script>/.test(event), 'no inline script, because the policy forbids it here as it does everywhere else on the site');
  assert.ok(!/\son[a-z]+="/.test(event), 'and no inline handler either, so the script tag is the only thing that runs');
  const mine = (event.match(/ style="/g) || []).length, theirs = (other.match(/ style="/g) || []).length;
  assert.ok(mine <= theirs + 1, 'the inline styles are the handful the other page already carries, ' + mine + ' against ' + theirs);
});

test('the copy is the words the design handed over, in the order it gave them', () => {
  const t = text(HTML());
  const need = [
    'Sharjah Next offer · 28 & 29 Oct',
    'Your SPARK company, at the event price',
    'Beyond', 'AED 1,510', 'year 1', '1 activity', '1 shareholder', 'Free lease',
    'Beyond+', 'AED 3,010', 'from, year 1', 'Up to 3 activities', 'Up to 3 shareholders', 'Visa options',
    'For these 5 sectors', 'Sustainability', 'Advanced Manufacturing', 'Mobility & Logistics', 'Healthcare',
    'AI & Digital Transformation',
    'Hi. I’m Mira.', 'A few details, and we start.',
    'First name', 'Last name', 'Email', 'Mobile number',
    'I agree that SPARK and Boasis may contact me about my project.',
    'Start with Mira',
    'Mira is ready for you', 'If she didn’t open automatically, tap below.', 'Talk to Mira',
    'How it works',
    'Tell Mira what you do', 'In your own words, typed or spoken.',
    'Choose your activities', 'Mira suggests them. Your package shows on top.',
    'Get your reference number', 'On screen, and by email.',
    'Finish in Zone 2, Block B', 'Show your reference, apply and pay. Follow the green signs.',
    'Open on 28 and 29 October only.', 'Complete your payment in Zone 2 before you leave.',
  ];
  for (const s of need) assert.ok(t.includes(s), 'the design says "' + s + '" and so does the page');
  const order = ['Tell Mira what you do', 'Choose your activities', 'Get your reference number', 'Finish in Zone 2, Block B'];
  assert.deepEqual(order.slice().sort((a, b) => t.indexOf(a) - t.indexOf(b)), order, 'the four points stay in the order the design gave them');
  assert.ok(t.indexOf('Your SPARK company') < t.indexOf('Start with Mira'), 'the offer is read before the form is filled');
});

test('the form asks what the design asked, in the fields the record already has', () => {
  const h = HTML();
  for (const n of ['first_name', 'last_name', 'email', 'phone', 'country_code', 'consent', 'hp']) {
    assert.ok(new RegExp('name="' + n + '"').test(h), n + ' is in the form');
  }
  assert.ok(!/name="residence"/.test(h), 'and this page does not ask where they live, because the design does not');
  assert.ok(/type="hidden" name="country_code"/.test(h), 'the dial code travels as the hidden field the shared picker writes');
  assert.match(h, /<div class="hp"[\s\S]*?name="hp"/, 'the honeypot is there, hidden from a person and not from a bot');
  const js = JS();
  assert.match(js, /data\.full_name = \(\(F\.first_name\.value[\s\S]*last_name/,
    'the two names are joined into the one field every door here reads, so the record does not change shape');
});

test('the script points at the same door as /try-mira and says which page it is', () => {
  const js = JS();
  assert.match(js, /endpoint: 'https:\/\/grsbhupjihwvidxbkymu\.supabase\.co\/functions\/v1\/create-pass'/,
    'the live page posts at the deployed function, the same one the other entrance uses');
  assert.match(js, /source: 'sharjah-next-2026'/, 'and the row is stamped with the offer it came from');
  assert.match(js, /page: 'spark-event'/, 'plus which table it belongs in');
  assert.match(js, /var LS = 'boasis\.spark-event\.v1'/, 'its own localStorage key, so the two entrances never hand over each other\'s visit');
  assert.notEqual(js.match(/var LS = '([^']+)'/)[1], read('js/try-mira.js').match(/var LS = '([^']+)'/)[1],
    'that key is genuinely different from the other page\'s');
  assert.ok(/window\.BoasisCountryPicker\.init/.test(js), 'the phone pill is the shared picker, not a copy');
  assert.ok(/fetch\('\/api\/spark-thanks'/.test(js), 'and the receipt mail is the same door, fired and forgotten');
  /* the server is given the same project host for connect-src, and a test on the other page already
     fails if those two hosts disagree; this one checks the page script is not the place a host is set */
  assert.equal((js.match(/supabase\.co/g) || []).length, 1, 'one project host in the file, no second opinion about where to post');
});

test('nothing on the site links it, every crawler is told to leave it out, and no sitemap names it', async () => {
  const pages = ['index.html', 'contact.html', 'early-access.html', 'blog.html', 'privacy.html', 'terms.html', '404.html'];
  for (const f of pages) {
    assert.ok(!/spark-event/.test(read(f)), f + ' must not link the event entrance');
  }
  const robots = read('robots.txt');
  assert.ok((robots.match(/Disallow: \/try-mira/g) || []).length >= 5, 'the other entrance is still refused everywhere');
  assert.equal((robots.match(/Disallow: \/spark-event/g) || []).length, (robots.match(/Disallow: \/try-mira/g) || []).length,
    'and so is this one, in every block that is allowed in');
  const sm = await get('/sitemap.xml');
  assert.ok(!/spark-event/.test(await sm.text()), 'it is in no sitemap');
  const r = await get('/spark-event');
  assert.match(HTML(), /<meta name="robots" content="noindex, nofollow">/, 'the page says it itself as well');
  assert.equal(r.status, 200);
});

test('the two tables are the same shape, and each entrance writes to its own', () => {
  const store = read('demo/supabase/functions/_shared/spark-supabase.js');
  assert.match(store, /export const TABLES = \{[\s\S]*"": TABLE,[\s\S]*"spark-event": "spark_event_leads",/,
    'the map from page to table is the one place either is named');
  assert.match(store, /return TABLES\[key\] \|\| TABLE;/, 'and an unknown page falls back to the original table rather than inventing one');
  const create = read('demo/supabase/functions/create-pass/index.js');
  assert.match(create, /tableFor\(body\?\.page\)/, 'create-pass chooses the table from the page that asks');
  assert.match(create, /readByEmailHash\(sb, hash, table\)/, 'a second scan finds the row in that table, not the other one');
  assert.match(create, /writeLead\(sb, lead, hash, table\)/, 'and the new row goes there');
  assert.match(create, /await passTaken\(sb, candidate\)/, 'a fresh pass is checked against every table before it is handed out');
  for (const name of ['save-step', 'get-lead']) {
    const door = read('demo/supabase/functions/' + name + '/index.js');
    assert.match(door, /readLeadAny\(/, name + ' finds a row by the pass alone, in either table');
    assert.ok(!/body\?\.page|body\.page/.test(door), name + ' never trusts a caller to name its table');
  }
  assert.match(read('demo/supabase/functions/save-step/index.js'), /writeLead\(sb, next, null, found\.table/, 'and updates the table it read from');

  const sql = read('demo/supabase/spark-event.sql');
  const first = read('demo/supabase/spark.sql');
  assert.match(sql, /create table if not exists public\.spark_event_leads/, 'the SQL makes the second table');
  const cols = [...first.matchAll(/^  ([a-z_]+)\s+(text|boolean|integer|numeric|timestamptz|jsonb|text\[\])/gm)].map(m => m[1]);
  assert.ok(cols.length >= 16, 'the first table has the columns rowOf writes, saw ' + cols.length);
  for (const c of cols) assert.ok(new RegExp('^  ' + c + '\\s+', 'm').test(sql), c + ' is in the new table too, or an insert fails at the stand');
  for (const need of ['enable row level security;', 'revoke all on table public.spark_event_leads from anon, authenticated;',
    'grant select, insert, update on table public.spark_event_leads to service_role;']) {
    assert.ok(sql.includes(need), 'and the lock is the same lock: ' + need);
  }
  assert.ok(!/create\s+policy/i.test(sql.split('\n').filter(l => !/^\s*--/.test(l)).join('\n')), 'no policy, so the browser keys still read nothing');
  assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(sql) && !/supabase\.co/.test(sql), 'no key and no project host in the file, so it pastes into any project');
});

test('the two files you paste into the dashboard are the two folders, with the new store inside', () => {
  const { compose } = require('../scripts/make-supabase-single.js');
  for (const name of ['create-pass', 'save-step', 'get-lead']) {
    const dash = read('demo/supabase/dashboard/' + name + '.js');
    assert.equal(dash, compose(name), name + ' in dashboard/ is exactly what the generator writes');
    assert.ok(dash.includes('spark_event_leads'), name + ' has both tables in it, because a pasted file has no folder to import from');
  }
});

test('the handover says the second entrance exists, and what to run for it', () => {
  const doc = read('docs/SPARK.md');
  for (const need of ['/spark-event', 'spark_event_leads', 'spark-event.sql', 'js/spark-event.js', 'sharjah-next-2026', 'readLeadAny']) {
    assert.ok(doc.includes(need), 'docs/SPARK.md must name ' + need);
  }
  assert.ok(!/spark-event[^]{0,200}service_role/.test(doc), 'and it never puts the service key near the new page either');
});

test('the night-before rehearsal runs this page too, and keeps the two crowds apart', async () => {
  const { spawn } = require('child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boasis-event-stub-'));
  const stub = spawn(process.execPath, [path.join(ROOT, 'scripts/spark-stub.js')], {
    cwd: ROOT, env: { ...process.env, PORT: '0', SPARK_BUCKET_DIR: dir }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('stub did not start: ' + log)), 15000);
    stub.stdout.on('data', d => { log += d; if (/localhost:(\d+)/.test(log)) { clearTimeout(t); res(); } });
    stub.on('exit', c => rej(new Error('stub exited ' + c + ': ' + log)));
  });
  const at = p => fetch('http://127.0.0.1:' + /localhost:(\d+)/.exec(log)[1] + p);
  const post = (p, body) => fetch('http://127.0.0.1:' + /localhost:(\d+)/.exec(log)[1] + p, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }).then(r => r.json());
  try {
    const page = await at('/spark-event');
    assert.equal(page.status, 200, 'the rehearsal serves the event page at the same address the print says');
    assert.match(await page.text(), /id="eventForm"/, 'and it is the same file, not a second copy to fall out of date');
    const js = await (await at('/js/spark-event.js')).text();
    assert.match(js, /endpoint: '\/functions\/v1\/create-pass'/, 'the stub is what fills in where to post, so the rehearsal never reaches the live project');
    assert.match(js, /brainUrl: '\/brain'/, 'and where the person goes after');

    const stamp = Date.now();
    const other = await post('/functions/v1/create-pass', {
      full_name: 'Rehearsal Two', email: 'both+' + stamp + '@corp.example', phone: '0551112222',
      country_code: '+971', consent: true, _t: 9000, source: 'ai-everything-2026',
    });
    const mine = await post('/functions/v1/create-pass', {
      full_name: 'Rehearsal One', email: 'both+' + stamp + '@corp.example', phone: '0551112222',
      country_code: '+971', consent: true, _t: 9000, source: 'sharjah-next-2026', page: 'spark-event',
    });
    assert.ok(other.ok && mine.ok, 'the same person is accepted on both entrances');
    assert.notEqual(other.pass, mine.pass, 'and gets a row of their own on each, which is the point of the second table');
    const row = JSON.parse(fs.readFileSync(path.join(dir, 'leads', mine.pass + '.json'), 'utf8'));
    assert.equal(row.source, 'sharjah-next-2026', 'the row carries the offer it came from');
    assert.equal(row.contact.full_name, 'Rehearsal One', 'the two names arrive as the one field every door here reads');
    const again = await post('/functions/v1/create-pass', {
      full_name: 'Rehearsal One', email: 'both+' + stamp + '@corp.example', phone: '0551112222',
      country_code: '+971', consent: true, _t: 9000, page: 'spark-event',
    });
    assert.equal(again.pass, mine.pass, 'a second scan on the same entrance hands back the same row, not a second stranger with the same name');
    assert.equal(again.reused, true, 'and says that is what it did');
    const saved = await post('/functions/v1/save-step', { pass: mine.pass, step: 'describe', data: { text: 'A clinic for physiotherapy, two visas.' } });
    assert.equal(saved.ok, true, 'the Brain steps land on the event row by the pass alone');
  } finally {
    stub.kill('SIGTERM');
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  }
});
