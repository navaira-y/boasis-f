/* The second entrance · boasis.ae/sharjah-next, for Sharjah Next on 28 and 29 October
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
const HTML = () => read('sharjah-next.html');
const JS = () => read('js/sharjah-next.js');

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
  for (const p of ['/sharjah-next', '/sharjah-next/', '/sharjah-next.html']) {
    const r = await get(p);
    const html = await r.text();
    assert.equal(r.status, 200, p + ' is where the screen and the QR point, saw ' + r.status);
    assert.match(html, /id="snForm"/, p + ' hands out the form the design drew');
    assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow', p + ' is refused to the index in the header as well as the page');
    const csp = r.headers.get('content-security-policy') || '';
    assert.match(csp, /connect-src 'self';/, p + ' may reach nothing but this host, because its lead goes to our own door');
    assert.ok(!/supabase\.co/.test(csp), p + ' is not given leave to reach the database at all');
    assert.match(csp, /frame-src[^;]*brain\.boasis\.ae/, p + ' frames Mira, and that is the one thing widened for it');
    assert.ok(!/script-src[^;]*unsafe-inline/.test(csp), 'and inline script stays forbidden on it');
  }
  const r2 = await get('/js/sharjah-next.js');
  assert.equal(r2.status, 200, 'the script is the one file the page does not carry inside itself');
  /* every picture is inside the page, as the design file had it: two logos, the orb three times, the
     photograph behind the hero. Nothing at a stand depends on a second request. */
  const h = HTML();
  assert.equal((h.match(/data:image\/png;base64,/g) || []).length, 5, 'the two logos and the orb, three times, inline');
  assert.equal((h.match(/data:image\/jpeg;base64,/g) || []).length, 1, 'and the hero photograph');
  assert.ok(!/src="\/assets|url\("\/assets/.test(h), 'no picture is asked for from the site, so none can go missing');
});

test('it is the design file, token for token, with nothing of the site in it', () => {
  const h = HTML();
  const jsOf = JS;
  const tokens = ['--sand:#F4F0E3', '--paper:#FFFDF6', '--sand2:#E7E3D5', '--line:#DCD6C2', '--line2:#C9C2A8',
    '--logo:#A3A35A', '--olive:#6A7345', '--olive-d:#4E5532', '--gold:#C7A759', '--gold-d:#8E7430',
    '--ink:#1F2414', '--muted:#5E6250', '--navy:#17365E', '--night:#0B0D12', '--mira:#5FD3E8', '--err:#B3261E',
    "--display:'Outfit'", "--body:'Plus Jakarta Sans'", "--mono:'IBM Plex Mono'",
    '--gut:max(16px, env(safe-area-inset-left,0px))'];
  for (const tok of tokens) assert.ok(h.includes(tok), 'the design defines ' + tok + ' in its :root, and the page says it back');
  for (const rule of ['max-width:560px', '@media (min-width:1000px)', 'background:#0B0D12', 'color-scheme:light',
    'touch-action:manipulation', '-webkit-tap-highlight-color:transparent', 'prefers-reduced-motion',
    '.card.bo', 'scroll-padding-top:env(safe-area-inset-top,0px)', 'enterkeyhint=', 'clamp(']) {
    assert.ok(h.includes(rule), 'and it is built the same way: ' + rule.slice(0, 32));
  }
  assert.ok(!/css\/site\.css/.test(h), 'it links no stylesheet of ours, because it is not trying to be a page of the site');
  assert.ok(!/\bunsafe-inline\b/.test(h), 'the page never asks to loosen anything for itself');
  assert.match(h, /<script src="\/js\/sharjah-next\.js\?v=\d+"><\/script>/,
    'one script, asked for with a version, so a phone at a stand cannot hold the old one');
  assert.ok(!/<script>/.test(h), 'and no inline script, because the policy forbids it here as everywhere else on the site');
  assert.ok(!(/\son[a-z]+="/).test(h), 'and no inline handler either, so the script file is the only thing that runs');
  const head = h.slice(0, h.indexOf('</head>'));
  for (const tag of ['<title>', 'name="description"', 'name="theme-color"', 'name="format-detection"', 'rel="preconnect"', 'fonts.googleapis.com']) {
    assert.ok(head.includes(tag), tag + ' sits inside <head>, where a browser and a crawler read it');
  }
  for (const ico of ['/assets/icons/favicon.ico', '/assets/icons/favicon-32.png', '/assets/icons/apple-touch-icon.png']) {
    assert.ok(head.includes(ico), 'and the tab wears the site\'s own ' + ico + ', the same mark /try-mira has');
  }
  assert.match(head, /<title>Sharjah Next Event<\/title>/, 'the tab says what the page is, and does not say it is a copy');
  assert.ok(!/\(Copy\)/.test(h), 'the word the draft file left in the title is gone from the page entirely');
  assert.equal((h.match(/data-k="s\d"/g) || []).length, 6, 'six sectors are offered, in the list style the design drew');
  assert.ok(/s6:'Creative'/.test(jsOf()), 'and the sixth is Creative');
  assert.match(head, /<meta name="robots" content="noindex, nofollow">/, 'and the page says out loud that it is not for the index');
  assert.ok(!/noindex/.test(h.slice(h.indexOf('</head>'))), 'it says it once, in the head, not also in the body where it is ignored');
});

test('the copy is the design\'s own words, in the order it gave them', () => {
  const h = HTML(), js = JS();
  /* this page paints its text from a dictionary, which is how it carries two languages. So the copy
     check reads the markup and the dictionary together, and then proves every name the markup asks for
     has an answer, because paint() would otherwise empty the node in silence. */
  const t = text(h) + ' ' + text(js.slice(js.indexOf('const T={'), js.indexOf('const root')));
  const need = [
    'Sharjah Next offer · 28 & 29 Oct', 'Your SPARK company, at the event price',
    'year 1', 'from, year 1', '1 activity', '1 shareholder', 'Free lease',
    'Beyond', 'AED 1,510', 'Beyond+', 'AED 3,010', 'Up to 3 activities', 'Up to 3 shareholders', 'Visa options',
    'For these 6 sectors', 'Sustainability', 'Advanced Manufacturing', 'Mobility & Logistics', 'Healthcare',
    'AI & Digital Transformation', 'Creative',
    "Hi. I'm Mira. A few details, and we start.",
    'First name', 'Last name', 'Email', 'Mobile number',
    'I agree that SPARK and Boasis may contact me about my project.',
    'Start with Mira', 'Mira is ready for you', "If she didn't open automatically, tap below.", 'Talk to Mira',
    'How it works', 'Tell Mira what you do', 'In your own words, typed or spoken.',
    'Choose your activities', 'Mira suggests them. Your package shows on top.',
    'Get your reference number', 'On screen, and by email.',
    'Finish in Zone 2, Block B', 'Show your reference, apply and pay. Follow the green signs.',
    'Open on 28 and 29 October only.', 'Complete your payment in Zone 2 before you leave.', 'Powered by',
  ];
  for (const s of need) assert.ok(t.includes(s), 'the design says "' + s + '" and so does the page');
  assert.ok(!/lorem|TODO|FIXME|REPLACE/i.test(t), 'and nothing is left to be filled in');
  const order = ['Tell Mira what you do', 'Choose your activities', 'Get your reference number', 'Finish in Zone 2, Block B'];
  assert.deepEqual(order.slice().sort((a, b) => t.indexOf(a) - t.indexOf(b)), order, 'the four points stay in the order the design gave them');
  const want = [...new Set([...h.matchAll(/data-k="([A-Za-z0-9_]+)"/g)].map(m => m[1]))];
  assert.ok(want.length >= 30, 'the page asks for ' + want.length + ' strings by name, saw fewer, so the markup changed shape');
  const dict = js.slice(js.indexOf('en:{'), js.indexOf('const root'));
  for (const k of want) assert.ok(new RegExp('(^|[ ,{\\n])' + k + '\\s*:').test(dict), k + ' has no text in the dictionary and would paint blank');
  assert.ok(!/data-lang=/.test(h), 'only English is switched on, as the design left it, with the hook still in place');
});

test('the form asks what the design asked, in the fields the record already has', () => {
  const h = HTML();
  for (const n of ['first_name', 'last_name', 'email', 'phone', 'country_code', 'consent', 'hp']) {
    assert.ok(new RegExp('name="' + n + '"').test(h), n + ' is in the form');
  }
  assert.ok(!/name="residence"/.test(h), 'and this page does not ask where they live, because the design does not');
  assert.ok(!/name="company"/.test(h), 'nor what the company is called, because Mira asks that next');
  assert.match(h, /<select name="country_code"/, 'the dial code is the design\'s own pill');
  assert.equal((h.match(/<option value="\+\d+"/g) || []).length, 18, 'with the eighteen codes it was drawn with');
  assert.ok(/<option value="\+971">/.test(h.slice(h.indexOf('name="country_code"'), h.indexOf('name="country_code"') + 900)),
    'and the UAE is the first one, because the stand is in Sharjah');
  assert.match(h, /<div class="hp"[\s\S]*?name="hp"/, 'the honeypot is there, hidden from a person and not from a bot');
  assert.match(h, /aria-live="polite"/, 'and the ready screen announces itself, because it replaces the form with no page load');
  const js = JS();
  assert.match(js, /data\.full_name=\(data\.first_name\.trim\(\)\+' '\+data\.last_name\.trim\(\)\)/,
    'the two names are joined into the one field every door here reads, so the record does not change shape');
});

test('the button records the lead, sends the three mails, and opens Mira in the card', () => {
  const h = HTML(), js = JS();
  assert.match(h, /data-endpoint="\/api\/sharjah-lead"/, 'the page posts to this site\'s own door, the same host, no key and no second origin');
  assert.ok(!/supabase\.co/.test(h + js), 'nothing in the page names a database, because the browser has no business in one');
  assert.match(js, /const SOURCE = 'sharjah-next-2026'/, 'the row is stamped with the offer it came from');
  assert.match(js, /data\.full_name=\(data\.first_name\.trim\(\)\+' '\+data\.last_name\.trim\(\)\)/,
    'the two names the design drew arrive as the one name every form here writes');
  assert.ok(!/data\.page=/.test(js), 'no table is named by the visitor, because the backend is not decided yet');
  assert.match(js, /cleanRef\(j\.ref\)/, 'the reference the mails show comes back from the door, trimmed');
  assert.match(js, /openFrame\(url, ref\)/, 'and Mira is put in the card where the form was, with that reference');
  assert.match(h, /<iframe[^>]*id="miraFrame"[^>]*data-src="https:\/\/brain\.boasis\.ae\/"[^>]*referrerpolicy="no-referrer"/,
    'the frame carries no referrer and starts empty, so a person who only reads the offer asks the Brain for nothing');
  assert.ok(!/location\.href\s*=/.test(js), 'the page no longer jumps: the record, the receipt and Mira stay on one screen');
  const code = js.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');   // the header names what is not wired, on purpose
  assert.ok(!/localStorage|PASS_RE|get-lead|create-pass/.test(code), 'no pass, no resume, nothing kept in the browser, until the backend is settled');
  assert.match(js, /if\(F\['hp'\]\.value\) return/, 'the honeypot is honoured before anything is posted');
  assert.match(js, /if\(!valid\(\)\) return/, 'and nothing is posted until the fields the design asked for are filled');
  assert.match(js, /data\._t=Math\.max\(1,Date\.now\(\)-opened\)/, 'with how long the form was open, for the door to judge');
});

test('the page cannot be talked into showing, sending or opening anything it was not given', () => {
  const h = HTML(), js = JS();
  assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(h + js), 'no service key in either file, in either form');
  assert.ok(!/\b(anon|publishable|apikey|api_key|service_role)\b/.test(h + js),
    'and no key of any kind, so the pass is the only credential there is');
  assert.equal((js.match(/innerHTML/g) || []).length, 1, 'one place puts markup on the page, and it is paint()');
  assert.match(js, /el\.innerHTML=t\(el\.dataset\.k\)/, 'from the dictionary, which holds the design\'s copy and no answer from anywhere');
  assert.ok(/e\.textContent=ek\?t\(ek\):''/.test(js), 'the field errors are text, so a name cannot be a tag');
  assert.ok(/function say\(msg\)[\s\S]*n\.textContent=msg/.test(js), 'and so is the note about the door itself');
  assert.ok(!/\beval\(|new Function|document\.write/.test(js), 'and nothing is compiled or written into the document');
  assert.ok(/function cleanRef\(v\)/.test(js) && /\.slice\(0,40\)/.test(js) && /\[\^A-Za-z0-9_-\]/.test(js),
    'a reference is clipped to one safe word before it is shown or framed');
  assert.ok(/function safeBase/.test(js) && /\^https\?:/.test(js),
    'and the Brain address is checked to be an http(s) page before it becomes a link or a location');
  assert.ok(!/location\.href\s*=|location\.assign|window\.open/.test(js),
    'the page never navigates anywhere: the record, the three mails and Mira stay on one screen');
  assert.ok(!/fetch\([^)]*\?[^)]*full_name/.test(js), 'nothing is put in an address, where a shoulder and a history would read it');
  assert.match(h, /<meta name="robots" content="noindex, nofollow">/, 'hidden from the index, in the page');
  assert.ok(fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8').includes('Disallow: /sharjah-next'), 'and in the robots file');
});


/* jsdom is not a dependency of this site, it is a thing a developer installs to look at a page, so
   this whole check is skipped where it is absent rather than failing a build for a missing extra. */
let JSDOM = null;
try { JSDOM = require('jsdom').JSDOM; } catch (e) { /* skip below */ }

test('the page as shipped fills itself, validates, joins the names and opens Mira in the card', { skip: JSDOM ? false : 'jsdom not installed' }, async () => {
  const dom = new JSDOM(HTML(), { url: 'https://boasis.ae/sharjah-next', runScripts: 'dangerously', pretendToBeVisual: true });
  const w = dom.window, posts = [];
  w.__pwned = false;
  w.alert = () => { w.__pwned = true; };
  w.fetch = (u, o) => {
    posts.push({ url: String(u), body: (o && o.body) || '' });
    if (u.includes('/api/sharjah-lead')) {
      return Promise.resolve({ json: () => Promise.resolve({ ok: true, ref: 'SN-K7QF3M', brain_url: 'https://brain.boasis.ae' }) });
    }
    return Promise.resolve({ json: () => Promise.resolve({ ok: true }) });
  };
  w.eval(JS());
  const d = w.document;
  assert.deepEqual([...d.querySelectorAll('[data-k]')].filter(el => !el.textContent.trim()).map(el => el.dataset.k), [],
    'every label on the page found its text in the dictionary, so no string is silently blank');

  d.getElementById('first_name').value = 'Navaira <img src=x onerror="window.__pwned=1">';
  d.getElementById('last_name').value = "O'Brien";
  d.getElementById('email').value = 'n@corp.example';
  d.getElementById('phone').value = '50 123 4567';
  d.querySelector('input[name=consent]').checked = true;
  d.querySelector('.cta').click();
  await new Promise(r => setTimeout(r, 250));

  const sent = posts.map(p => p.url);
  assert.deepEqual(sent, ['/api/sharjah-lead'], 'one call, to this site\'s own door, and nothing else leaves the page');
  const create = posts.find(p => p.url.includes('sharjah-lead')) || { body: '{}' };
  const body = JSON.parse(create.body);
  assert.equal(body.full_name, "Navaira <img src=x onerror=\"window.__pwned=1\"> O'Brien",
    'the two fields the design drew arrive as the one name every door here reads, quotes and all, unfixed');
  assert.equal(body.source, 'sharjah-next-2026', 'and which offer it came for');
  assert.equal(body.consent, 'on', 'the tick box travels, because the row is the proof somebody agreed');
  assert.ok(!('hp' in body), 'the honeypot field is never posted');
  assert.equal(body.country_code, '+971', 'and the dial code the pill was showing when they pressed it');
  assert.ok(Number(body._t) >= 1, 'with how long the form was open, for the door to judge');
  assert.equal(d.getElementById('doneView').className.trim(), 'done on', 'the page changes to the ready view the design drew');
  assert.equal(d.getElementById('miraFrame').getAttribute('src'), 'https://brain.boasis.ae?src=sharjah-next&ref=SN-K7QF3M',
    'Mira opens in the card, carrying the reference the mails show');
  assert.ok(!w.__pwned, 'and a name written as markup stays a name');
  assert.equal(w.localStorage.length, 0, 'and nothing at all is kept in the browser, because there is no session to resume yet');
});

test('nothing on the site links it, every crawler is told to leave it out, and no sitemap names it', async () => {
  const pages = ['index.html', 'contact.html', 'early-access.html', 'blog.html', 'privacy.html', 'terms.html', '404.html'];
  for (const f of pages) {
    assert.ok(!/sharjah-next/.test(read(f)), f + ' must not link the event entrance');
  }
  const robots = read('robots.txt');
  assert.ok((robots.match(/Disallow: \/try-mira/g) || []).length >= 5, 'the other entrance is still refused everywhere');
  assert.equal((robots.match(/Disallow: \/sharjah-next/g) || []).length, (robots.match(/Disallow: \/try-mira/g) || []).length,
    'and so is this one, in every block that is allowed in');
  const sm = await get('/sitemap.xml');
  assert.ok(!/sharjah-next/.test(await sm.text()), 'it is in no sitemap');
  const r = await get('/sharjah-next');
  assert.match(HTML(), /<meta name="robots" content="noindex, nofollow">/, 'the page says it itself as well, in the head where a crawler reads it');
  const head = HTML().slice(0, HTML().indexOf('</head>'));
  for (const tag of ['<title>', 'name="description"', 'name="theme-color"', 'name="format-detection"']) {
    assert.ok(head.includes(tag), tag + ' is inside <head>, which is where the design had left it out and a browser looks for it');
  }
  assert.equal(r.status, 200);
});

test('the stand leads sit in their own table, and one door writes to both', () => {
  const sql = read('demo/supabase/sharjah-next.sql');
  assert.match(sql, /create table if not exists public\.sharjah_next_leads/, 'the stand has its own table, not a kind inside the site\'s');
  for (const c of ['ref', 'full_name', 'email', 'phone', 'country_code', 'consent', 'source', 'at', 'received_at', 'data']) {
    assert.ok(new RegExp('^  ' + c + '\\s+', 'm').test(sql), c + ' is a column of it, or the insert fails on the night');
  }
  assert.match(sql, /ref\s+text\s+unique/, 'and the reference is unique, so a row cannot be written twice by a retry');
  for (const need of ['enable row level security;', 'revoke all on table public.sharjah_next_leads from anon, authenticated;',
    'grant select, insert on table public.sharjah_next_leads to service_role;']) {
    assert.ok(sql.includes(need), 'locked the same way as every table here: ' + need);
  }
  assert.ok(!/drop table|delete from|update public\.sharjah_next_leads/i.test(sql.split('\n').filter(l => !/^\s*--/.test(l)).join('\n')),
    'nothing in the paste destroys a row that is already in');
  assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(sql) && !/supabase\.co/.test(sql), 'no key and no project host in the file, so it pastes into any project');

  const door = read('demo/supabase/functions/save-lead/index.js');
  assert.match(door, /const STAND = "sharjah_next_leads"/, 'the one door every form already posts to knows the second table');
  assert.match(door, /const table = kind === "sharjah_next" \? STAND : TABLE;/, 'the kind picks the table, and nothing else decides it');
  assert.ok(!/body\?\.table|body\.table/.test(door), 'a caller cannot name a table, which is the whole reason this is a door and not a query');
  assert.match(door, /consent: record\.consent === true \|\| record\.consent === "on"/, 'the tick box is stored as a real boolean, not as a string');
  const dash = read('demo/supabase/dashboard/save-lead.js');
  assert.equal(dash, require('../scripts/make-supabase-single.js').compose('save-lead'),
    'and the file you paste into the dashboard is exactly that, table map inside it');
});

test('the three mails have no trigger today, and one value away from having one', () => {
  const spark = read('lib/spark.js');
  assert.match(spark, /process\.env\.SPARK_SN_MAIL \|\| 'off'/, 'off unless the event team says otherwise, so a submit records and stays quiet');
  assert.ok(!/SPARK_SN_MAIL \|\| 'submit'/.test(spark), 'the testing default is gone, it was only ever for the read through');
});

test('the two tables are the same shape, and each entrance writes to its own', () => {
  const store = read('demo/supabase/functions/_shared/spark-supabase.js');
  assert.match(store, /export const TABLES = \{[\s\S]*"": TABLE,[\s\S]*"sharjah-next": "sharjah_next_passes",/,
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

  const sql = read('demo/supabase/sharjah-next-passes.sql');
  const first = read('demo/supabase/spark.sql');
  assert.match(sql, /create table if not exists public\.sharjah_next_passes/, 'the SQL makes the second table');
  const cols = [...first.matchAll(/^  ([a-z_]+)\s+(text|boolean|integer|numeric|timestamptz|jsonb|text\[\])/gm)].map(m => m[1]);
  assert.ok(cols.length >= 16, 'the first table has the columns rowOf writes, saw ' + cols.length);
  for (const c of cols) assert.ok(new RegExp('^  ' + c + '\\s+', 'm').test(sql), c + ' is in the new table too, or an insert fails at the stand');
  for (const need of ['enable row level security;', 'revoke all on table public.sharjah_next_passes from anon, authenticated;',
    'grant select, insert, update on table public.sharjah_next_passes to service_role;']) {
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
    assert.ok(dash.includes('sharjah_next_passes'), name + ' has both tables in it, because a pasted file has no folder to import from');
  }
});

test('the handover says the second entrance exists, and what to run for it', () => {
  const doc = read('docs/SPARK.md');
  for (const need of ['/sharjah-next', 'sharjah_next_passes', 'sharjah_next_leads', 'sharjah-next.sql', 'sharjah-next-passes.sql', 'js/sharjah-next.js', 'sharjah-next-2026', 'readLeadAny']) {
    assert.ok(doc.includes(need), 'docs/SPARK.md must name ' + need);
  }
  assert.ok(!/sharjah-next[^]{0,200}service_role/.test(doc), 'and it never puts the service key near the new page either');
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
    const page = await at('/sharjah-next');
    assert.equal(page.status, 200, 'the rehearsal serves the event page at the same address the print says');
    assert.match(await page.text(), /id="snForm"/, 'and it is the same file, not a second copy to fall out of date');
    const js = await (await at('/js/sharjah-next.js')).text();
    assert.match(js, /MIRA_URL = '\/brain'/, 'the stub is what fills in where the person goes after, so the rehearsal never reaches the live project');
    assert.ok(!/grsbhupjihwvidxbkymu|brain\.boasis\.ae/.test(js), 'and nothing live survives in the script it is handed');
    const served = await (await at('/sharjah-next')).text();
    assert.match(served, /data-endpoint="\/functions\/v1\/create-pass"/, 'the event page keeps its door in the markup, and the stub rewrites that too');
    assert.ok(!/supabase\.co/.test(served.slice(served.indexOf('</head>'))), 'so the body of the page the stand sees asks for nothing outside the rehearsal');

    const stamp = Date.now();
    const other = await post('/functions/v1/create-pass', {
      full_name: 'Rehearsal Two', email: 'both+' + stamp + '@corp.example', phone: '0551112222',
      country_code: '+971', consent: true, _t: 9000, source: 'ai-everything-2026',
    });
    const mine = await post('/functions/v1/create-pass', {
      full_name: 'Rehearsal One', email: 'both+' + stamp + '@corp.example', phone: '0551112222',
      country_code: '+971', consent: true, _t: 9000, source: 'sharjah-next-2026', page: 'sharjah-next',
    });
    assert.ok(other.ok && mine.ok, 'the same person is accepted on both entrances');
    assert.notEqual(other.pass, mine.pass, 'and gets a row of their own on each, which is the point of the second table');
    const row = JSON.parse(fs.readFileSync(path.join(dir, 'leads', mine.pass + '.json'), 'utf8'));
    assert.equal(row.source, 'sharjah-next-2026', 'the row carries the offer it came from');
    assert.equal(row.contact.full_name, 'Rehearsal One', 'the two names arrive as the one field every door here reads');
    const again = await post('/functions/v1/create-pass', {
      full_name: 'Rehearsal One', email: 'both+' + stamp + '@corp.example', phone: '0551112222',
      country_code: '+971', consent: true, _t: 9000, page: 'sharjah-next',
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
  for (const f of ['lib/spark.js', 'scripts/spark-stub.js', 'test/spark.test.js', 'test/sharjah-next.test.js']) {
    const src = read(f);
    const bare = [...src.matchAll(/import\(\s*(?:path\.join|CORE\b|`)/g)];
    assert.equal(bare.length, 0, f + ' must pass a file URL to import(), saw ' + bare.length + ' bare path' + (bare.length === 1 ? '' : 's'));
  }
  for (const f of ['lib/spark.js', 'scripts/spark-stub.js']) {
    assert.ok(read(f).includes('pathToFileURL'), f + ' says out loud that the path is turned into a URL');
  }
});

