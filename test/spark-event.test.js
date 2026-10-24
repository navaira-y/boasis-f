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
    assert.match(body, /id="snForm"/, p + ' hands out the form the design drew');
    assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow', p + ' is refused to the index in the header as well as the page');
    const csp = r.headers.get('content-security-policy') || '';
    assert.match(csp, /connect-src[^;]*supabase\.co/, p + ' may post for a pass, and that is the only widening');
    assert.match(csp, /frame-src[^;]*brain\.boasis\.ae/, p + ' is allowed to frame the Brain');
    assert.ok(!/script-src[^;]*unsafe-inline/.test(csp), 'and inline script stays forbidden on it');
  }
  for (const p of ['/js/spark-event.js', '/assets/logo/orb-160.png', '/assets/icons/favicon-32.png', '/privacy', '/terms']) {
    const r = await get(p);
    assert.equal(r.status, 200, p + ' has to be reachable or the page loads half dressed');
  }
  /* the two event logos and the photograph behind the hero are the event organiser's own artwork. They
     are not ours to redraw, so the page asks for them at these three addresses and the folder carries
     a note about what to drop in. Until they are there the header shows the alt text and the hero shows
     its night colour, which is the one thing about the page that is allowed to look unfinished. */
  for (const p of ['/assets/brand/sharjah-next.png', '/assets/brand/spark.png', '/assets/brand/hero.jpg']) {
    assert.ok(HTML().includes(p), p + ' is the address the page asks for the artwork at');
  }
  assert.ok(fs.existsSync(path.join(ROOT, 'assets/brand/README.md')), 'and the folder says what has to be put in it');
});

test('it is the design\'s own theme, token for token, with nothing of the site\'s stylesheet in it', () => {
  const h = HTML();
  /* the palette the Sharjah Next proposal was drawn in, kept exactly as it was written: one :root
     block, the same names, the same order, so a change to the event artwork is a change to one file */
  const share = ['--sand:#F4F0E3', '--paper:#FFFDF6', '--sand2:#E7E3D5', '--line:#DCD6C2', '--line2:#C9C2A8',
    '--logo:#A3A35A', '--olive:#6A7345', '--olive-d:#4E5532', '--gold:#C7A759', '--gold-d:#8E7430',
    '--ink:#1F2414', '--muted:#5E6250', '--navy:#17365E', '--night:#0B0D12', '--mira:#5FD3E8', '--err:#B3261E'];
  for (const tok of share) assert.ok(h.includes(tok), 'the design defines ' + tok + ' and so does the page');
  for (const f of ['Outfit', 'Plus Jakarta Sans', 'IBM Plex Mono']) assert.ok(h.includes(f), f + ' is the typeface the design asked for');
  /* the shape of it: the safe-area gutter, the 560 measure that grows at the two breakpoints, and the
     boasis night variant of the form box with the orb that breathes */
  for (const rule of ['--gut:max(18px, env(safe-area-inset-left))', '.wrap{max-width:560px', '@media(min-width:640px)',
    '@media(min-width:1000px)', '.bo{background:var(--night)', '@keyframes breathe', '.hp{position:absolute!important',
    'input:focus,select:focus', '@media(prefers-reduced-motion:reduce)']) {
    assert.ok(h.includes(rule), 'and it is built the same way: ' + rule.slice(0, 34));
  }
  assert.ok(!/css\/site\.css/.test(h), 'it links no stylesheet of ours, because it is not trying to be a page of the site');
  assert.ok(!/href="https?:\/\/(?!fonts\.)/.test(h), 'and it loads nothing from outside but the fonts it names');
  assert.match(h, /<script src="\/js\/spark-event\.js\?v=\d+"><\/script>/,
    'its script is asked for with a version, so a phone at a stand cannot hold the old one');
  assert.ok(!/<script[\s>][\s\S]*?<\/script>/.test(h.replace(/<script src=[^>]*><\/script>/g, '')),
    'no inline script, because the policy forbids it here as it does everywhere else on the site');
  assert.ok(!/\son[a-z]+="/.test(h), 'and no inline handler either, so the script tag is the only thing that runs');
  assert.ok(!/\bunsafe-inline\b/.test(h), 'the page never asks to loosen that for itself');
});

test('the copy is the words the design handed over, in the order it gave them', () => {
  const t = text(HTML());
  const need = [
    'Sharjah Next offer · 28 & 29 Oct', 'Your SPARK company, at the event price',
    'AED 7,800', 'year 1', 'from, year 1', '1 activity', '1 shareholder', 'Free lease',
    'For these 5 sectors', 'Sustainability', 'Advanced Manufacturing', 'Mobility & Logistics', 'Healthcare',
    'AI & Digital Transformation', 'Up to 3 activities', 'Up to 3 shareholders', 'Visa options',
    "Hi. I'm Mira. A few details, and we start.",
    'First name', 'Last name', 'Email', 'Mobile number',
    'I agree that SPARK and Boasis may contact me about my project.',
    'Start with Mira',
    'Mira is ready for you', "If she didn't open automatically, tap below.", 'Talk to Mira',
    'How it works',
    'Tell Mira what you do', 'In your own words, typed or spoken.',
    'Choose your activities', 'Mira suggests them. Your package shows on top.',
    'Get your reference number', 'On screen, and by email.',
    'Finish in Zone 2, Block B', 'Show your reference, apply and pay. Follow the green signs.',
    'Open on 28 and 29 October only.', 'Complete your payment in Zone 2 before you leave.',
    'Powered by',
  ];
  for (const s of need) assert.ok(t.includes(s), 'the design says "' + s + '" and so does the page');
  const order = ['Tell Mira what you do', 'Choose your activities', 'Get your reference number', 'Finish in Zone 2, Block B'];
  assert.deepEqual(order.slice().sort((a, b) => t.indexOf(a) - t.indexOf(b)), order, 'the four points stay in the order the design gave them');
  assert.ok(t.indexOf('Your SPARK company') < t.indexOf('Start with Mira'), 'the offer is read before the form is filled');
  assert.ok(!/lorem|TODO|FIXME/i.test(t), 'nothing is left to be filled in');
  assert.ok(!/src="#"|src=""/.test(HTML()), 'and no picture is asked for from nowhere');
});

test('the form asks what the design asked, in the fields the record already has', () => {
  const h = HTML();
  for (const n of ['first_name', 'last_name', 'email', 'phone', 'country_code', 'consent', 'hp']) {
    assert.ok(new RegExp('name="' + n + '"').test(h), n + ' is in the form');
  }
  assert.ok(!/name="residence"/.test(h), 'and this page does not ask where they live, because the design does not');
  assert.ok(!/name="company"/.test(h), 'nor what their company is called, because Mira asks that next');
  assert.match(h, /<select name="country_code"/, 'the dial code is the design\'s own country pill');
  assert.equal((h.match(/<option value="\+\d+"/g) || []).length, 18, 'and it holds the eighteen codes it was drawn with');
  assert.ok(/<option value="\+971" selected>/.test(h), 'with the UAE showing first, because the stand is in Sharjah');
  assert.match(h, /<div class="hp"[\s\S]*?name="hp"/, 'the honeypot is there, hidden from a person and not from a bot');
  const js = JS();
  assert.match(js, /data\.full_name = \(\(F\['first_name'\]\.value[\s\S]*last_name/,
    'the two names are joined into the one field every door here reads, so the record does not change shape');
  assert.match(js, /data\.page = CFG\.page/, 'and the page says which table the row belongs in');
});

test('the script points at the same door as /try-mira, and the button actually walks through it', () => {
  const js = JS(), h = HTML();
  assert.match(js, /endpoint: 'https:\/\/grsbhupjihwvidxbkymu\.supabase\.co\/functions\/v1\/create-pass'/,
    'the live page posts at the deployed function, the same one the other entrance uses');
  assert.match(h, /data-endpoint="https:\/\/grsbhupjihwvidxbkymu\.supabase\.co\/functions\/v1\/create-pass"/,
    'and the form names that address where the design had left its own');
  assert.match(js, /source: 'sharjah-next-2026'/, 'the row is stamped with the offer it came from');
  assert.match(js, /page: 'spark-event'/, 'plus which table it belongs in');
  assert.match(js, /LS = 'boasis\.spark-event\.v1'/, 'its own localStorage key, so the two entrances never hand over each other\'s visit');
  assert.notEqual(js.match(/LS = '([^']+)'/)[1], read('js/try-mira.js').match(/LS = '([^']+)'/)[1],
    'that key is genuinely different from the other page\'s');
  assert.match(js, /brainUrl: 'https:\/\/brain\.boasis\.ae'/, 'Mira is the Brain, not the placeholder address the design shipped with');
  assert.match(js, /'pass=' \+ encodeURIComponent\(pass\)/, 'and the pass travels in the address, which is the only way the record follows the person');
  assert.match(js, /fetch\('\/api\/spark-thanks'/, 'the receipt mail is the same door, fired and forgotten');
  assert.match(js, /keepalive: true/, 'fired so it survives the jump to Mira');
  assert.match(js, /if \(F\['hp'\]\.value\) return/, 'the honeypot is honoured before anything is posted');
  assert.match(js, /if \(!valid\(\)\) return/, 'and nothing is posted until the fields the design asked for are filled');
  assert.ok(!/SEND\s*=\s*false/.test(js + h), 'no switch left that makes the button do nothing');
  assert.ok(!/boasis\.ae\/mira/.test(js + h), 'and no placeholder address left where Mira was guessed at');
  /* the server is given the same project host for connect-src, and a test on the other page already
     fails if those two hosts disagree; these two check the page never invents a third place to post */
  assert.equal((js.match(/supabase\.co/g) || []).length, 1, 'one project host in the script, no second opinion about where to post');
  assert.equal((h.match(/supabase\.co/g) || []).length, 1, 'and one in the page');
});

test('the page cannot be talked into showing, sending or opening anything it was not given', () => {
  const h = HTML(), js = JS();
  /* nothing that could read as a credential travels in a page a stand leaves on a screen */
  assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(h + js), 'no service key in either file, in either form');
  assert.ok(!/\b(anon|publishable|apikey|api_key|service_role)\b/.test(h + js), 'and no key of any kind, so a pass is the only credential there is');
  /* the strings on screen come from one dictionary, the only place innerHTML is written */
  assert.equal((js.match(/innerHTML/g) || []).length, 1, 'one place puts markup on the page, and it is paint()');
  assert.match(js, /el\.innerHTML = t\(el\.dataset\.k\)/, 'from the dictionary, which holds the design\'s copy and no answer from anywhere');
  assert.ok(/textContent = (?:msg|ek \? t\(ek\) : '')/.test(js), 'the errors and the note are text, so a name cannot be a tag');
  assert.ok(!/\beval\(|new Function|document\.write/.test(js), 'and nothing is compiled or written into the document');
  /* what the door answers is trimmed to what it must be before it is trusted */
  assert.match(js, /PASS_RE = \/\^PASS\[/, 'a pass is eight characters from the alphabet the door uses, from a file that only exists to be read');
  assert.ok(/function safeBrain/.test(js) && /\^https\?:/.test(js),
    'and the Brain address is checked to be an http(s) page before it becomes a link or a location');
  assert.ok(!/location\.href\s*=\s*(?!url)/.test(js.replace(/location\.href = url/g, 'location.href=url')), 'the only thing the page navigates to is that checked address');
  /* the two doors a bot is expected to come through */
  assert.match(js, /if \(F\['hp'\]\.value\) return/, 'the field no person sees throws the attempt away before the fetch');
  assert.match(js, /data\._t = Math\.max\(1, Date\.now\(\) - opened\)/, 'and how long the form was open is sent, for the door to judge');
  assert.ok(!/fetch\([^)]*method: 'GET'[^)]*full_name/.test(js), 'nothing is put in an address, where a shoulder and a browser history would read it');
  /* and the page is not offered to the world as something to crawl, twice over */
  assert.match(h, /<meta name="robots" content="noindex, nofollow, noarchive">/, 'in the page');
  assert.ok(fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8').includes('Disallow: /spark-event'), 'and in the robots file');
});

/* jsdom is not a dependency of this site, it is a thing a developer installs to look at a page, so
   this whole check is skipped where it is absent rather than failing a build for a missing extra. */
let JSDOM = null;
try { JSDOM = require('jsdom').JSDOM; } catch (e) { /* skip below */ }

test('the page as shipped fills itself, validates, joins the names and hands Mira a pass', { skip: JSDOM ? false : 'jsdom not installed' }, async () => {
  const dom = new JSDOM(HTML(), { url: 'https://boasis.ae/spark-event', runScripts: 'dangerously', pretendToBeVisual: true });
  const w = dom.window, posts = [];
  w.__pwned = false;
  w.alert = () => { w.__pwned = true; };
  w.fetch = (u, o) => {
    posts.push({ url: String(u), body: (o && o.body) || '' });
    if (String(u).includes('create-pass')) {
      return Promise.resolve({ json: () => Promise.resolve({ ok: true, pass: 'PASSAB12CD34', brain_url: 'https://brain.boasis.ae' }) });
    }
    return Promise.resolve({ json: () => Promise.resolve({ ok: true }) });
  };
  w.eval(JS());
  const d = w.document;
  assert.deepEqual([...d.querySelectorAll('[data-k]')].filter(el => !el.textContent.trim()).map(el => el.dataset.k), [],
    'every label on the page found its text in the dictionary, so no string is silently blank');

  d.getElementById('fn').value = 'Navaira <img src=x onerror="window.__pwned=1">';
  d.getElementById('ln').value = "O'Brien";
  d.getElementById('em').value = 'n@corp.example';
  d.getElementById('ph').value = '50 123 4567';
  d.querySelector('input[name=consent]').checked = true;
  d.querySelector('.cta').click();
  await new Promise(r => setTimeout(r, 250));

  const sent = posts.map(p => p.url);
  assert.ok(sent.some(p => p.includes('/functions/v1/create-pass')), 'the button posts for a pass at the door, not at a demo endpoint');
  assert.ok(sent.some(p => p.endsWith('/api/spark-thanks')), 'and asks once for the receipt');
  const create = posts.find(p => p.url.includes('create-pass')) || { body: '{}' };
  const body = JSON.parse(create.body);
  assert.equal(body.full_name, "Navaira <img src=x onerror=\"window.__pwned=1\"> O'Brien",
    'the two fields the design drew arrive as the one name every door here reads, quotes and all, unfixed');
  assert.equal(body.page, 'spark-event', 'the row says which entrance it came from, which is all that picks its table');
  assert.equal(body.source, 'sharjah-next-2026', 'and which offer it came for');
  assert.equal(body.consent, 'on', 'the tick box travels, because the row is the proof somebody agreed');
  assert.ok(!('hp' in body), 'the honeypot field is never posted');
  assert.equal(body.country_code, '+971', 'and the dial code the pill was showing when they pressed it');
  assert.ok(Number(body._t) >= 1, 'with how long the form was open, for the door to judge');
  assert.equal(d.getElementById('doneView').className.trim(), 'done on', 'the page changes to the ready view the design drew');
  assert.equal(d.getElementById('miraLink').href, 'https://brain.boasis.ae/?pass=PASSAB12CD34',
    'with the pass in the address, which is the one thing that makes Mira their Mira');
  assert.ok(!w.__pwned, 'and a name written as markup stays a name');
  const stored = JSON.parse(w.localStorage.getItem('boasis.spark-event.v1'));
  assert.equal(stored.pass, 'PASSAB12CD34', 'the pass is kept under this page\'s own key, so a returning phone goes back to the Brain');
  assert.match(JSON.stringify(stored), /"at":\d+/, 'with the hour it was given, because it stops being a key after a day');
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
  assert.match(HTML(), /<meta name="robots" content="noindex, nofollow, noarchive">/, 'the page says it itself as well, in the head where a crawler reads it');
  const head = HTML().slice(0, HTML().indexOf('</head>'));
  for (const tag of ['<title>', 'name="description"', 'name="theme-color"', 'name="format-detection"']) {
    assert.ok(head.includes(tag), tag + ' is inside <head>, which is where the design had left it out and a browser looks for it');
  }
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
    assert.match(await page.text(), /id="snForm"/, 'and it is the same file, not a second copy to fall out of date');
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

test('no file is handed to import() as a bare path, because Windows reads C:\\ as a URL scheme', () => {
  /* the bug this exists for: the rehearsal stub worked on the Linux box that builds this site and
     died on the owner's laptop with ERR_UNSUPPORTED_ESM_URL_SCHEME, which is exactly the kind of
     failure that only shows up on the night, on the machine you are actually using */
  for (const f of ['lib/spark.js', 'scripts/spark-stub.js', 'test/spark.test.js', 'test/spark-event.test.js']) {
    const src = read(f);
    const bare = [...src.matchAll(/import\(\s*(?:path\.join|CORE\b|`)/g)];
    assert.equal(bare.length, 0, f + ' must pass a file URL to import(), saw ' + bare.length + ' bare path' + (bare.length === 1 ? '' : 's'));
  }
  for (const f of ['lib/spark.js', 'scripts/spark-stub.js']) {
    assert.ok(read(f).includes('pathToFileURL'), f + ' says out loud that the path is turned into a URL');
  }
});

