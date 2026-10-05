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
  for (const p of ['/js/try-mira.js', '/js/yara-orb.js', '/js/countries.js', '/assets/orb/orb.mp4', '/assets/logo/orb-512.png']) {
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
    ['/try-mira', true], ['/try-mira.html', true], ['/js/try-mira.js', true], ['/js/yara-orb.js', true],
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

test('the page wears the site look: one sky, glass panels, and a light that runs round the box', () => {
  const html = HTML();
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
  const rule = (sel) => {
    const at = css.indexOf(sel + '{');
    assert.ok(at >= 0, 'the page styles ' + sel);
    return css.slice(at, css.indexOf('}', at));
  };
  const tight = (t) => t.replace(/\s+/g, '');
  const site = read('css/site.css');   // the header and the sky are compared against it, rule for rule

  /* the night, pinned, with the brand tokens and the site own colour-scheme for what the
     browser paints itself: the select list, the scrollbars, the yellow of autofill */
  assert.match(html, /<html lang="en" data-theme="dark">/, 'the page is night on every machine, not on the setting of one laptop');
  assert.match(css, /:root\[data-theme="dark"\], :root\{/, 'and the values are written once, for that case and for no js at all');
  assert.match(html, /<style>[\s\S]{0,400}?--bo-night:#0B0D12[\s\S]*?<\/style>/, 'the brand tokens, in the page own style block');
  assert.match(html, /<meta name="color-scheme" content="dark">/, 'the same answer for the parts a browser draws by itself');
  assert.match(html, /<meta name="theme-color" content="#0B0D12">/, 'and the night of the brand, which is what the home page asks for too');
  assert.match(html, /href="https:\/\/fonts\.googleapis\.com\/css2\?family=Outfit[^"]*IBM\+Plex\+Mono/, 'the site fonts, the same three families at the same weights');

  /* the header: the home page's own floating capsule, at its own measure, with only the fill
     taken out, because the owner made this one transparent. Every other property is the site's. */
  assert.match(html, /<header class="nav">\s*<div class="nav-bar">\s*<a class="brand" href="https:\/\/boasis\.ae\/"[^>]*>B<img src="\/assets\/logo\/orb-160\.png" alt="O">ASIS<\/a>\s*<\/div>\s*<\/header>/, 'the header is the site own bar with the logo, and one child only');
  assert.ok(!/class="tabs"|nav-wait|nav-contact|tab-dot/.test(html), 'no links, no button, no dot: the bar carries the mark and nothing else');
  for (const sel of ['.nav', '.nav .brand', '.brand', '.brand img']) {
    const line = site.split('\n').find(l => l.startsWith(sel + '{'));
    assert.ok(tight(css).includes(tight(line)), sel + ' is css/site.css, copied as written');
  }
  const open_rule = (t) => tight(t).replace(/}$/, '');   // rule() stops before the brace, a line does not
  const siteBar = site.split('\n').find(l => l.startsWith('.nav-bar{')) || '';
  assert.ok(siteBar.length > 0, 'css/site.css has the bar to compare against');
  assert.equal(open_rule(rule('.nav-bar')), open_rule(siteBar).replace('background:rgba(11,13,18,.97);', ''),
    '.nav-bar is the site rule with exactly one property removed, and no other edit');
  assert.ok(!/background/.test(rule('.nav-bar')), 'the one removed property is the fill: the capsule is transparent, the light of the page shows inside it');
  assert.match(rule('.nav-bar'), /border-radius:999px/, 'it is still the capsule, and not a bar with corners');
  assert.match(rule('.nav'), /position:fixed[\s\S]*z-index:50/, 'it floats over the page at the site own height in the stack');
  assert.match(rule('.hero-in'), /padding:calc\(74px/, 'and the hero starts below it, at 14px of top padding plus the 60px of the bar');
  for (const sel of ['.hero-in', '.main']) {
    assert.match(rule(sel), /width:min\(100% - 56px,1124px\)/, sel + ' is cut to the measure the capsule is cut to, so the logo lines up with what is under it');
  }

  /* one background for the whole page: the sky, fixed, the three lights of the home page */
  assert.match(html, /<div class="sky" aria-hidden="true"><i><\/i><i><\/i><i><\/i><i><\/i><\/div>/, 'the three lights the home page drifts, plus the wash behind /early-access');
  assert.match(rule('.sky'), /position:fixed[\s\S]*z-index:-1[\s\S]*pointer-events:none/, 'behind everything, and it never takes a click');
  const skyRules = (site.match(/^\.sky i:nth-child\(\d\)\{.*$/gm) || []);
  assert.equal(skyRules.length, 3, 'the home page drifts three lights, so the sky rule is read three times');
  const ea = read('css/early-access.css');
  const wash = /\.ea-page::before\{[^}]*background:radial-gradient\(([^;]*)\);/.exec(ea);
  assert.ok(wash, 'the registration page mixes two colours behind its panel, and that rule is read here, not remembered');
  assert.ok(tight(css).includes(tight('radial-gradient(' + wash[1] + ')')), 'the fourth light is that same mix of navy into teal');
  for (const line of skyRules) {
    const glow2 = /radial-gradient\((.*?)\)(?=[;}])/.exec(line);
    const want = glow2[0];
    assert.ok(tight(css).includes(tight(want)), 'and the light is copied, not invented: ' + want);
  }
  assert.ok(!/^html[ ,]/m.test(css) && !/html\{[^}]*background/.test(css), 'nothing is painted behind the sky: a background on html too would stop the body\'s from reaching the canvas, and the page would read flat black');
  assert.match(rule('body'), /background:var\(--bg\)/, 'the night is the body\'s own, the way the site writes it');
  assert.ok(!/background/.test(rule('.hero')), 'the hero paints no plate of its own');
  assert.ok(!/background/.test(rule('.main')), 'nor does the section the form stands in: one page, one background');
  for (const m of css.match(/\.hero-in\{[^}]*\}|\.main\{[^}]*\}/g) || []) {  /* same check, both section wrappers */
    assert.ok(!/background/.test(m), 'and that holds for ' + m.slice(0, m.indexOf('{')));
  }

  /* glass, with the site own two numbers for a panel */
  assert.match(rule('.card'), /background:var\(--glass\)/, 'a panel is the light of the page, dimmed');
  assert.match(css, /--glass:rgba\(255,255,255,\.04\); --hair:rgba\(255,255,255,\.16\)/, 'the same .04 over .16 the home page uses on its cards');
  for (const sel of ['.card', '.offer']) {
    assert.match(rule(sel), /backdrop-filter:blur\(\d+px\)[^;]*; -webkit-backdrop-filter:blur/, sel + ' blurs what is behind it, and ships the prefix Safari still needs');
  }

  /* the form on the right, the other things on the left, and the orb held in its middle */
  assert.ok(html.indexOf('<aside class="side">') < html.indexOf('id="start"'), 'the four points and the offers come first, so they sit left of the form');
  assert.match(rule('.main'), /grid-template-columns:minmax\(0,\.9fr\) minmax\(0,1\.1fr\)/, 'and the form takes the wider half of the row');
  assert.match(rule('.orbwrap'), /margin:0 auto/, 'the orb is centred in its own column');
  assert.ok(!/margin:-\d/.test(rule('.orbwrap') + rule('.main') + rule('.orbwrap')), 'and nothing is pulled up or down out of its section any more');
  assert.match(rule('.hero-in'), /align-items:center/, 'the two halves of the hero meet in the middle');

  /* the scan sits on the How it works box, not on the form: a line of light round the frame,
     forever, its glow lifting the four points as it crosses them. Pure CSS, no scroll, no script,
     and it still behaves on a machine that asks for less movement */
  assert.match(html, /<div class="card beam" data-scan>\s*<div class="beam-in">\s*<div class="eyebrow">How it works<\/div>/, 'the light belongs to the How it works panel');
  assert.ok(!/class="[^"]*beam[^"]*" id="start"/.test(html), 'and the form is a plain panel: nothing runs round the box a person types into');
  const plate = /\.beam > \.beam-in\{[^}]*\}/.exec(css)[0];
  assert.match(plate, /rgba\(11,13,18,\.[45]/, 'the plate over the words stays thin, so the light reads through it rather than being painted out');
  assert.match(rule('.beam'), /padding:1px; overflow:hidden/, 'the frame is one pixel wide, so the line is a line');
  for (const pseudo of ['.beam::before', '.beam::after']) {
    assert.match(css, new RegExp(pseudo.replace(/[.:*]/g, '\\$&') + '[^}]*animation:sweep 7s linear infinite'), pseudo + ' is on the same clock as the other');
    assert.match(css, new RegExp(pseudo.replace(/[.:*]/g, '\\$&') + '[^}]*conic-gradient'), pseudo + ' is a cone of light, so it has a head and a tail');
  }
  assert.match(css, /\.beam::after\{[^}]*mix-blend-mode:plus-lighter/, 'the glow adds itself onto the text it passes over, which is what lightens it');
  assert.match(css, /@keyframes sweep\{to\{rotate:360deg\}\}/, 'one full turn, then again, and nothing about the scroll');
  const rm = /@media \(prefers-reduced-motion:reduce\)\{([\s\S]*?)\n\}/.exec(css);
  assert.ok(rm && /\.beam::before,\.beam::after\{animation:none\}/.test(rm[1]), 'asked for less movement the light stands still instead of stopping dark');

  /* the fields, still the design own, and still only what the plan may ask */
  assert.ok(!/<select/.test(html), 'the native country select is gone from this page, as it is from the other three');
  for (const sel of ['.sr', '.mf-pill', '.mf-pill input', '.mf-phone', '.mf-phone .mf-code', '.cc-btn', '.cc-pop', '.cc-find', '.cc-list', '.cc-list li', '.cc-none']) {
    const line = site.split('\n').find(l => l.startsWith(sel + '{'));
    assert.ok(line, 'css/site.css has a ' + sel + ' rule to copy');
    assert.ok(tight(css).includes(tight(line)), 'and this page carries it as written there, not retuned: ' + sel);
  }
  assert.match(css, /input:-webkit-autofill[^}]*-webkit-box-shadow:0 0 0 1000px/, 'and the night stays the night when the browser remembers a name for you');

  /* what the page is allowed to carry, unchanged by any of the above */
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/, 'one meta tag, to keep the page out of the index');
  assert.ok(!/<img[^>]*src="data:/.test(html), 'no picture carried as text');
  assert.ok(!/orbvid/.test(html), 'and the video is streamed from /assets rather than carried as text in the page');
  assert.ok(!/data-endpoint/.test(html), 'no address in the markup for the form to post at: it is in the script, where it can be read');
  assert.equal((html.match(/<script src="\/js\//g) || []).length, 3, 'three external scripts and no inline one, because a policy of this site forbids inline script on every page');
  assert.ok(html.indexOf('/js/countries.js') < html.indexOf('/js/try-mira.js'), 'the shared picker loads before the page script that calls it');
  assert.ok(!/<script(?![^>]*\bsrc=)/.test(html), 'and not one line of inline script: the light above is css, so it needs none');
  assert.match(html, /<p class="err" data-note><\/p>/, 'one empty line for a sentence the fields cannot carry, hidden while empty');
  assert.match(html, /<link rel="icon" href="\/assets\/icons\/favicon\.ico" sizes="any">\s*<link rel="icon" type="image\/png" sizes="32x32" href="\/assets\/icons\/favicon-32\.png">\s*<link rel="apple-touch-icon" href="\/assets\/icons\/apple-touch-icon\.png">/, 'the site own three icons in the head, so the tab is not blank');
  assert.match(html, /<footer><a class="brand" href="https:\/\/boasis\.ae\/">[\s\S]*?Boasis - FZC · support@boasis\.ae<\/p><\/footer>/, 'and the footer the design file has');
  assert.ok(!/demo\/spark|\.\.\/|css\/try-mira/.test(html), 'no bundle to assemble and no path that walks out of it');
  for (const m of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) {
    assert.ok(fs.existsSync(path.join(ROOT, m[1])), 'and ' + m[1] + ' is a file the site really has');
  }
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
    for (const p of ['/js/try-mira.js', '/js/yara-orb.js', '/js/countries.js', '/assets/logo/orb-512.png']) {
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
