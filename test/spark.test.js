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

test('the page wears the site look: one sky, glass panels, and the four points on one line', () => {
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
  assert.match(css, /\.orbwrap \.mira > div\{[^}]*border-radius:999px[^}]*backdrop-filter:blur\(8px\)/, 'the name in the orb stands on a chip, so the ring cannot cut across the letters');
  assert.match(html, /<meta name="color-scheme" content="dark">/, 'the same answer for the parts a browser draws by itself');
  assert.match(html, /<meta name="theme-color" content="#0B0D12">/, 'and the night of the brand, which is what the home page asks for too');
  assert.match(html, /href="https:\/\/fonts\.googleapis\.com\/css2\?family=Outfit[^"]*IBM\+Plex\+Mono/, 'the site fonts, the same three families at the same weights');

  /* the header: the home page's own floating capsule, at its own measure, filled with the night of
     the brand. One property was taken out once on request and put back on request; it is now the
     site's rule entire, so there is no difference left to explain */
  assert.match(html, /<header class="nav">\s*<div class="nav-bar">\s*<a class="brand" href="https:\/\/boasis\.ae\/"[^>]*>B<img src="\/assets\/logo\/orb-160\.png" alt="O">ASIS<\/a>\s*<\/div>\s*<\/header>/, 'the header is the site own bar with the logo, and one child only');
  assert.ok(!/class="tabs"|nav-wait|nav-contact|tab-dot/.test(html), 'no links, no button, no dot: the bar carries the mark and nothing else');
  for (const sel of ['.nav', '.nav .brand', '.brand', '.brand img']) {
    const line = site.split('\n').find(l => l.startsWith(sel + '{'));
    assert.ok(tight(css).includes(tight(line)), sel + ' is css/site.css, copied as written');
  }
  const open_rule = (t) => tight(t).replace(/}$/, '');   // rule() stops before the brace, a line does not
  const siteBar = site.split('\n').find(l => l.startsWith('.nav-bar{')) || '';
  assert.ok(siteBar.length > 0, 'css/site.css has the bar to compare against');
  assert.equal(open_rule(rule('.nav-bar')), open_rule(siteBar),
    '.nav-bar is css/site.css entire, nothing removed and nothing added');
  assert.match(rule('.nav-bar'), /background:rgba\(11,13,18,\.97\)/, 'the bar carries the solid night of the brand, the site own value');
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

  /* the four points are joined by one line, and the light runs down that line from 1 to 4. Not
     round the box: the box has nothing on it. Pure CSS, no scroll, no script, no measuring */
  assert.ok(!/beam|sweep|conic-gradient/.test(html), 'the line round the box is gone, the word with it');
  assert.ok(!/data-scan/.test(html), 'and no panel is a scan plate any more');
  const seg = /\.step::before\{([^}]*)\}/.exec(css)[1];
  assert.match(seg, /left:17px/, 'the line is on the centre of the 36px numbers');
  assert.match(seg, /top:36px; bottom:-10px/, 'from the bottom of one number to the top of the next, the 10px being the grid gap');
  assert.ok(!/top:\s*0|height:100%/.test(seg), 'it is cut to the row it belongs to, so it cannot be short or long at another text length');
  assert.match(/\.step:last-child::before,\.step:last-child::after\{[^}]*\}/.exec(css)[0], /display:none/, 'the fourth point has no one below it, so nothing hangs under the list');
  for (const i of [1, 2, 3, 4]) {
    assert.match(css, new RegExp('\\.step:nth-child\\(' + i + '\\)\{--i:' + (i - 1) + '\}'), 'point ' + i + ' knows its place in the order');
  }
  const head = /\.step::after\{([^}]*)\}/.exec(css)[1];
  assert.match(head, /animation:flow 5\.6s/, 'the light runs on one clock for the whole list');
  assert.match(head, /animation-delay:calc\(var\(--i\) \* 1\.4s\)/, 'and each piece waits its turn, a quarter of the clock apart');
  assert.match(head, /mix-blend-mode:plus-lighter/, 'it adds itself to the line and the number it passes, which is what makes them glow');
  assert.match(/\.step\{animation:arrive[^}]*\}/.exec(css)[0], /animation-delay:calc\(var\(--i\) \* 1\.4s\)/, 'and the number lights on the same clock and the same delay, so it cannot fall out of step');
  assert.match(css, /@keyframes flow\{[\s\S]*?25%\{opacity:\.55\}[\s\S]*?\n  \}/, 'one piece hands off to the next instead of both burning at once');
  assert.ok(!/\.step\s*\{[^}]*animation:[^}]*scroll/.test(css) && !/animation-timeline/.test(css), 'nothing here is driven by the scroll');
  const rm2 = /@media \(prefers-reduced-motion:reduce\)\{([\s\S]*?)\n\}/.exec(css);
  assert.ok(/\.step::after\{display:none\}/.test(rm2[1]), 'asked for less movement the light stops and the line stays: the four points are still joined');
  assert.match(rm2[1], /\.step::before\{background:linear-gradient\(180deg, rgba\(95,211,232,\.5\)/, 'and the line itself takes the teal once, quietly, instead of running');

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

test('the phone is how this page gets read, so it has its own rules and not a squeezed desktop', () => {
  const html = HTML();
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
  const at = css.indexOf('@media (max-width:699px){');
  assert.ok(at > 0, 'there is a block for a narrow screen');
  const end = css.indexOf('\n}', at);
  const phone = css.slice(at, end);
  const base = css.slice(0, at);
  assert.ok(end > at, 'and it is closed');
  assert.ok(css.indexOf('}', end) < css.indexOf('@media (prefers-reduced-motion'), 'and it comes after the base rules, so it wins where they disagree');

  assert.match(phone, /\.hero-in\{[^}]*text-align:center/, 'the first section reads down the middle');
  assert.match(phone, /\.hero \.sub\{[^}]*margin-left:auto[^}]*margin-right:auto/, 'the sentence under the headline centres with it');
  assert.match(phone, /\.facts\{[^}]*justify-content:center/, 'the three tags are centred under it, not left in a ragged row');
  assert.match(phone, /\.facts span\{[^}]*font-size:13px/, 'and they are sized for a phone, not for 1120px');
  assert.match(phone, /#start\{order:-1\}/, 'the form comes first, above the four points: at a stand the thing to do is type');
  assert.match(phone, /\.card\{[^}]*padding:22px 18px/, 'the cards give the thumb the room the wide page does not need');
  assert.match(phone, /\.field > input,\.mf-pill input\{height:54px/, 'every typed field is 54px tall on a phone');
  assert.match(phone, /\.cta\{width:100%\}/, 'and the button is the whole width of the card, which is the thing you aim for');
  assert.match(phone, /\.cc-pop\{width:min\(252px, calc\(100vw - 72px\)\)\}/, 'the country panel cannot hang off the side of the screen');
  assert.match(css, /env\(safe-area-inset-bottom\)/, 'and the last line clears the bar at the bottom of a phone');

  /* the two fields iOS likes to spoil: a capital A in an email address, and a spellcheck squiggle
     under a phone number, both of which arrive as typos in the lead file */
  assert.match(html, /name="email"[^>]*autocapitalize="none"[^>]*spellcheck="false"/, 'the address is typed as typed');
  assert.match(html, /name="phone"[^>]*autocapitalize="none"[^>]*spellcheck="false"/, 'and the number is not underlined as a mistake');

  /* the label in the orb is sized with the orb, which is what stops the cut on a small screen */
  assert.match(css, /\.orbwrap \.mira b\{display:block; font-size:clamp\(26px,2\.6vw,38px\)/, 'the name scales with the circle it stands in');
  assert.match(base, /\.orbwrap\{[^}]*max-width:340px/, 'and the wide page keeps the orb it had');
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

test('the stand QR reads, and the web cannot fetch it back', async (t) => {
  const dir = path.join(ROOT, 'docs', 'qr');
  const svg = fs.readFileSync(path.join(dir, 'try-mira.svg'), 'utf8');
  const png = fs.readFileSync(path.join(dir, 'try-mira.png'));
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20);   // IHDR follows the 8-byte signature and the 8-byte chunk head
  assert.equal(png.slice(1, 4).toString('latin1'), 'PNG', 'the file is really a PNG');
  assert.ok(w === h && w >= 1200, 'and it is square at the size asked for, saw ' + w + 'x' + h);
  assert.ok(png.length > 20000, 'and it is a drawing, not a stub: ' + png.length + ' bytes');
  assert.match(svg.slice(0, 500), /https:\/\/boasis\.ae\/try-mira · error correction H · quiet zone 4 modules/, 'the file says what it is, so nobody reprints the wrong thing');
  assert.match(svg, /<path fill="#0B0D12" d="M/, 'the code is modules in the page colour on white, not a picture of one');

  /* the one file the owner asked for: open it anywhere, crop the picture. The point of it is that
     nothing outside it is needed, so the PNG has to be inside as data and there may be no request
     out to a network, a font, or the folder sitting next to it */
  const cardFile = path.join(dir, 'try-mira-card.html');
  assert.ok(fs.existsSync(cardFile), 'docs/qr/try-mira-card.html is there to open');
  const card = fs.readFileSync(cardFile, 'utf8');
  assert.match(card, /<img[^>]*src="data:image\/png;base64,[A-Za-z0-9+/]{4096,}/, 'the card holds the picture itself, as data');
  assert.ok(!/(?:src|href)="(?:https?:)?\/\//.test(card), 'and asks nothing of a network or of a folder next to it');
  assert.match(card, /class="addr">boasis</, 'and shows the address under the code, the way the code encodes it');
  assert.ok(!/[\u200b\u200e\u202a-\u202e\u00ad]/.test(card), 'with no hidden character in it, in case a person copies that line');
  assert.match(card, /@media print\{[\s\S]*?\.skip\{display:none\}/, 'and on paper the dark and the words step out of the way');

  /* it lives under docs/ because that prefix is closed to the web: a QR in /assets/ would be a
     guessable file that hands the entrance address to anything that comes looking for it */
  for (const p of ['/docs/qr/try-mira.png', '/docs/qr/try-mira.svg', '/docs/qr/try-mira-card.html', '/assets/qr/try-mira.png']) {
    assert.equal((await get(p)).status, 404, p + ' must not be fetchable, saw ' + (await get(p)).status);
  }
  assert.ok(!/qr|try-mira/.test(read('index.html')), 'and no page of the site points at it');

  try { require.resolve('qrcode'); require.resolve('sharp'); require.resolve('jsqr'); }
  catch { return t.skip('regenerating and decoding needs: npm i --no-save qrcode sharp jsqr'); }

  /* run the generator into a temp folder and let it decode itself: this is the command that
     makes the file, so it is tested rather than trusted */
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'boasis-qr-'));
  try {
  const done = await new Promise((res, rej) => {
    const p = spawn(process.execPath, [path.join(ROOT, 'scripts/make-qr.js'), '--out=' + out, '--size=600'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    p.stdout.on('data', d => { log += d; });
    p.on('error', rej);
    p.on('exit', c => res({ c, log }));
    setTimeout(() => { p.kill('SIGTERM'); res({ c: -1, log }); }, 60000);
  });
  assert.equal(done.c, 0, 'the generator says the code reads back at four sizes, saw:\n' + done.log);
  assert.match(done.log, /reads +600px ok · 600px ok · 320px ok · 160px ok/);
  assert.match(done.log, /symbol +33x33 modules, version 4, error correction H/);
  assert.ok(fs.existsSync(path.join(out, 'try-mira-card.html')), 'and it writes the card file beside them');
  } finally {
    fs.rmSync(out, { recursive: true, force: true });   // a failing run leaves nothing behind
  }
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
