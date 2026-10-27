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
const postJSON = async (p, b) => {
  const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  return { status: r.status, j: await r.json().catch(() => null) };
};

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
  assert.equal((h.match(/data:image\/png;base64,/g) || []).length, 4,
    'the two logos and the orb twice, inline, one fewer than before because the ready view gave up its copy of the orb with its headline');
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
  assert.ok(!/<link[^>]*site\.css/.test(h), 'it links no stylesheet of ours, because it is not trying to be a page of the site');
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
    /* one line is not the design's: it read "If she didn't open automatically", and Mira is not a she.
       Words the boss corrects outrank words the design typed. */
    'Start with Mira',
    'How it works', 'Tell Mira what you do', 'In your own words, typed or spoken.',
    'Choose your activities', 'Mira suggests them. Your package shows on top.',
    'Get your reference number', 'On screen, and by email.',
    'Finish at the payment counter', 'Show your reference, apply and pay.',
    'Open on 28 and 29 October only.', 'Head to the counter with your reference number and finish the payment before you leave.', 'Powered by',
  ];
  for (const s of need) assert.ok(t.includes(s), 'the design says "' + s + '" and so does the page');
  /* two things the boss took back off this page: the page promises a coloured line to follow and there is
     no such line at this event, and the date box painted a calendar chip that only repeated the dates
     the sentence next to it had just said. Neither comes back, markup and CSS both. */
  assert.ok(!/Follow the green|green signs/i.test(h + js), 'and no instruction to follow anything green survives on the page');
  assert.ok(!/class="cal"/.test(h) && !/\.today \.cal/.test(h), 'and the calendar chip is gone from the box and from the rules that drew it');
  assert.ok(!/lorem|TODO|FIXME|REPLACE/i.test(t), 'and nothing is left to be filled in');
  /* the fourth heading is the boss's, not the design's: the stand is a desk with a card machine at it,
     and a visitor who is told to find a block number in a free zone will ask somebody anyway */
  const order = ['Tell Mira what you do', 'Choose your activities', 'Get your reference number', 'Finish at the payment counter'];
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
  /* the dial code: the eighteen-option list the design came with is replaced by the control the
     rest of boasis.ae already uses, so the list of countries is one file and not two truths */
  assert.ok(!/<select/.test(h), 'there is no select on this page any more');
  assert.match(h, /<div class="cc" data-cc>[\s\S]{0,1200}?<input type="hidden" name="country_code" value="\+971">/,
    'the site\'s picker is there, and the UAE is what it opens on, because the stand is in Sharjah');
  assert.match(h, /class="cc-btn"[^>]*aria-haspopup="listbox"[^>]*aria-expanded="false"/,
    'the closed control is a listbox to a screen reader and says so before it is opened');
  assert.match(h, /class="cc-search"[^>]*inputmode="search"/, 'the panel opens with a search box, as it does on /contact');
  assert.match(h, /<script src="\/js\/countries\.js\?v=\d+"><\/script>\n<script src="\/js\/sharjah-next\.js\?v=\d+"><\/script>/,
    'the file that drives it is the site\'s own, loaded first, versioned on this page as well, because a tablet at a stand keeps whatever it was given at ten in the morning');
  assert.ok(h.includes('.cc-btn{display:flex;align-items:center;gap:8px') && h.includes('.cc-list li[aria-selected="true"]{color:var(--bo-teal)}'),
    'its rules are copied out of css/site.css as they are written there, not restyled here');
  assert.match(h, /\.cc-pop\{width:min\(252px, calc\(100vw - 40px\)\)\}/, 'and on a small phone the panel cannot hang off the side of the screen');
  assert.match(h, /<div class="hp"[\s\S]*?name="hp"/, 'the honeypot is there, hidden from a person and not from a bot');
  assert.match(h, /aria-live="polite"/, 'and the ready screen announces itself, because it replaces the form with no page load');
  const js = JS();
  assert.match(js, /data\.full_name=\(data\.first_name\.trim\(\)\+' '\+data\.last_name\.trim\(\)\)/,
    'the two names are joined into the one field every door here reads, so the record does not change shape');
});

test('the button records the lead, checks it the way the site checks it, and opens Mira in the card', () => {
  const h = HTML(), js = JS();
  assert.match(h, /data-endpoint="\/api\/sharjah-lead"/, 'the page posts to this site\'s own door, the same host, no key and no second origin');
  assert.ok(!/supabase\.co/.test(h + js), 'nothing in the page names a database, because the browser has no business in one');
  assert.match(js, /const SOURCE = 'sharjah-next-2026'/, 'the row is stamped with the offer it came from');
  assert.match(js, /data\.full_name=\(data\.first_name\.trim\(\)\+' '\+data\.last_name\.trim\(\)\)/,
    'the two names the design drew arrive as the one name every form here writes');
  assert.ok(!/data\.page=/.test(js), 'no table is named by the visitor, because the backend is not decided yet');
  assert.match(js, /cleanRef\(j\.ref\)/, 'the reference the mails show comes back from the door, trimmed');
  assert.match(js, /const src=brainHref\(url, ref, pass\);\s*\n\s*const fr=document\.getElementById\('miraFrame'\); if\(fr&&src&&fr\.getAttribute\('src'\)!==src\) fr\.setAttribute\('src',src\);/,
    'and Mira is put in the card where the form was, out of one built address, with that reference and the pass if there is one, and that is the only line in the page that writes anywhere');
  assert.match(h, /<iframe id="miraFrame" title="Mira" src="about:blank">/,
    'the frame starts on about:blank, the way the other entrance does, so a person who only reads the offer asks the Brain for nothing');
  assert.ok(!/brain\.boasis\.ae/.test(h), 'and the Brain is named in no line of this page\'s markup, only in its script');
  assert.ok(!/class="fine"|miraLink|notShowing/.test(h),
    'and there is no spare way out under the frame at all, because a second thing to press is how a desk loses a person');
  assert.ok(!/data-k="doneH"|data-k="doneP"|class="done"[^>]*>\s*<img/.test(h),
    'and the ready view is the frame alone: no headline, no ring, nothing a person has to read past');
  assert.ok(!/\.brain\{/.test(h),
    'the frame has no box of its own at all any more: no border, no radius, no background of ours around the Brain, because at that moment the Brain is the screen');
  assert.match(h, /\.brain iframe\{display:block; width:100%; height:100vh; height:100dvh; border:0; background:var\(--night\)\}/,
    'the frame is the viewport, dvh written over vh so a phone with its own bars gives the Brain a whole screen rather than one that scrolls a little');
  assert.match(h, /html\.mira-open \.top,html\.mira-open footer,html\.mira-open \.hero,html\.mira-open \.side,html\.mira-open \.today\{display:none\}/,
    'and at that moment the header, the footer, the offer they have just read, the four points and the date box all step out together');
  assert.match(h, /html\.mira-open #start\{padding:0; margin:0; border:0; border-radius:0; box-shadow:none; background:none\}/,
    'the card gives up its padding, its border, its radius, its shadow and its own background too, so the Brain has the page and not a window in it');
  assert.match(h, /html\.mira-open \.main,html\.mira-open \.wrap\.main\{max-width:none; margin:0; padding:0; gap:0\}/,
    'the row it sits in is uncapped and unpadded at every width, which is the one answer that is right on a 360px phone and on a 1440px tablet alike');
  assert.match(h, /html\.mira-open\{background:var\(--night\)\}/,
    'and the page turns the Mira black behind it, with the body not scrolling, so there is no white band at the bottom of a phone while the Brain fills');
  assert.match(js, /root\.classList\.add\('mira-open'\)/,
    'one class on the html element does all of it, put there on the same click that fills the frame, and before that click nothing of the page has moved');
  assert.ok(!/scrollIntoView\(\{behavior:'smooth',block:'start'\}\)/.test(js),
    'and there is no scroll to the card any more, because there is nothing above it left to scroll past');
  assert.match(h, /class="card side"/, 'the four points are named for what they are, so the page can put them away');
  assert.match(h, /class="card side"/, 'the four points are named for what they are, so the page can put them away');
  assert.match(h, /\.main\.opened\{grid-template-columns:minmax\(0,1fr\)\}/,
    'and the moment Mira is open the card takes the whole width, which is what the other page does and the only way a framed app is workable on a tablet at a stand');
  assert.match(h, /\.main\.opened \.side,\.main\.opened \.today\{display:none\}/,
    'the how it works card and the date box step out at that moment, because both of them describe a step the person has just finished');
  assert.match(js, /main\.classList\.add\('opened'\)/, 'and the page puts itself into that shape on the same click that fills the frame');
  assert.ok(!/location\.href\s*=/.test(js), 'the page no longer jumps: the record, the receipt and Mira stay on one screen');
  const code = js.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');   // the header names what is not wired, on purpose
  assert.ok(!/localStorage|PASS_RE|get-lead|create-pass/.test(code), 'no pass, no resume, nothing kept in the browser, until the backend is settled');
  assert.match(js, /if\(F\['hp'\]\.value\) return/, 'the honeypot is honoured before anything is posted');
  assert.match(js, /if\(!valid\(\)\) return/, 'and nothing is posted until the fields the design asked for are filled');
  assert.match(js, /data\._t=Math\.max\(1,Date\.now\(\)-opened\)/, 'with how long the form was open, for the door to judge');
});

test('the email and the number are checked by the site\'s rules, on the page and at the door', () => {
  const js = JS(), core = read('demo/supabase/functions/_shared/spark-core.js');
  const EMAIL_BODY = '[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}';      // one text, twice, so the two cannot drift
  assert.ok(js.includes(EMAIL_BODY), 'the page checks an address with a domain after the at');
  assert.ok(core.includes(EMAIL_BODY), 'and so does the door, so a curl cannot file what the page refuses');
  assert.match(js, /d\.length>=7&&d\.length<=15/, 'a number is seven to fifteen digits after the code');
  assert.match(core, /digits\.length < PHONE_MIN \|\| digits\.length > PHONE_MAX/, 'the door agrees, by name, not by a copy of the number');
  assert.match(core, /export const PHONE_MIN = 7;[\s\S]{0,120}export const PHONE_MAX = 15;/, 'and both ends are written once, in the module both back ends import');
  assert.match(js, /const digits=v=>String\(v==null\?''\:v\)\.replace\(\/\\D\/g,''\)/, 'the box holds digits, because the code has its own control');
  assert.match(js, /if\(d!==raw\) F\['phone'\]\.value=d;/, 'and what they typed is tidied as they type it, not after the send');
  assert.match(js, /setErr\('email', e&&!validEmail\(e\)\?'eEmail':''\)/, 'a wrong field says so while it is being written');
  assert.match(js, /setErr\('phone', st\.empty\|\|st\.ok\?'':'ePhone'\)/, 'and so does a number shorter than that country asks for');
  assert.match(read('js/countries.js'), /new CustomEvent\('codechange'/, 'and the picker says the day the code changes, so a page can rejudge');
  assert.match(js, /data\.phone=digits\(data\.phone\);/, 'what is posted is the number alone, the code travelling beside it');
  /* the length a number has to reach is the picked country's, and it is written beside the list */
  const cjs = read('js/countries.js');
  assert.match(cjs, /const LENGTHS = \{[\s\S]{0,2400}AE: \[9, 9\][\s\S]*?IN: \[10, 10\]/, 'the pairs are there: nine for a UAE mobile, ten for India');
  assert.match(cjs, /BY_CODE\[dial\] = had \? \[Math\.min/, 'two countries on one code take the wider range, never the narrower');
  assert.match(cjs, /const LOOSE = \[7, 15\];/, 'and a code the table does not know falls back to the door\'s own rule');
  /* the table itself, read back rather than trusted: a pair outside the door's range would be a
     wall, and a country without a pair would be a hole */
  const pairs = {};
  for (const m of cjs.slice(cjs.indexOf('const LENGTHS'), cjs.indexOf('};', cjs.indexOf('const LENGTHS'))).matchAll(/([A-Z]{2}): \[(\d+), (\d+)\]/g)) {
    pairs[m[1]] = [Number(m[2]), Number(m[3])];
  }
  const listed = [...new Set((cjs.match(/\['[A-Z]{2}', '/g) || []).map(t => t.slice(2, 4)))];
  assert.equal(Object.keys(pairs).length, listed.length, Object.keys(pairs).length + ' pairs for ' + listed.length + ' countries, one each');
  for (const iso of listed) {
    const w = pairs[iso];
    assert.ok(w, iso + ' is in the list and has no length pair, so it falls back and the point of the check is lost');
    assert.ok(w[0] >= 7 && w[1] <= 15 && w[0] <= w[1], iso + ' ' + w.join('-') + ' must sit inside the door\'s 7 to 15, or the page expects what the server refuses');
  }
  assert.deepEqual([pairs.AE, pairs.IN, pairs.PK], [[9, 9], [10, 10], [10, 10]],
    'and the three this stand will see most are mobiles, not landlines: nine for the Emirates, ten for India, ten for Pakistan');
  assert.equal(pairs.AE[0], 9, 'eight under +971 is a landline, and a lead nobody can WhatsApp is not a lead');
  assert.match(cjs, /return \{ init, lengthOf, ok, LENGTHS \};/, 'exported, so every page that asks for a number can ask the same file');
  assert.match(js, /CP\.ok\(code\(\), d\)\.valid/, 'this page asks it, rather than holding its own copy of what India looks like');
  assert.match(js, /addEventListener\('codechange', rejudgePhone\)/, 'and it rejudges the number the moment the country changes, without waiting for a keystroke');
  assert.match(js, /const REFUSE=\{email:\['email','eEmail'\],phone:\['phone','ePhone'\]/,
    'and if the door still refuses one of the two, the note goes under that field rather than under the button');
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
  w.eval(read('js/countries.js'));   // the picker first, because this page's script looks for it
  w.eval(JS());
  const d = w.document;
  assert.deepEqual([...d.querySelectorAll('[data-k]')].filter(el => !el.textContent.trim()).map(el => el.dataset.k), [],
    'every label on the page found its text in the dictionary, so no string is silently blank');

  /* the picker is a real control, not a picture of one: it opens, it searches, and the code it
     lands on is the code the form posts */
  const btn = d.querySelector('.cc-btn');
  const list = read('js/countries.js');
  const every = (list.match(/\['[A-Z]{2}', '/g) || []).length;
  assert.ok(every >= 50, 'the shared list holds ' + every + ' countries, which is the site\'s own and not this page\'s');
  assert.equal(d.querySelector('.cc-list').children.length, every, 'and the panel shows all of them, where the design listed eighteen');
  btn.click();
  assert.equal(btn.getAttribute('aria-expanded'), 'true', 'and the button says when it is open');
  const find = d.querySelector('.cc-search');
  find.value = 'ind';
  find.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.deepEqual([...d.querySelectorAll('.cc-list li')].map(li => li.textContent.trim()), ['India+91', 'Indonesia+62'],
    'one keystroke narrows the list to the countries that name matches, name and code, in that order');
  d.querySelector('.cc-list li').click();
  assert.equal(d.querySelector('input[name="country_code"]').value, '+91', 'the choice is written into the field the form posts');
  assert.equal(btn.textContent.trim(), 'IN+91', 'and the closed control says it back');

  d.getElementById('first_name').value = 'Navaira <img src=x onerror="window.__pwned=1">';
  d.getElementById('last_name').value = "O'Brien";
  d.getElementById('email').value = 'n@corp.example';

  /* the number is judged against the country the picker is on, and that is India now: nine digits
     is not a number there, so it is said out loud before the button is ever pressed */
  const typePhone = v => {
    const el = d.getElementById('phone');
    el.value = v;
    el.dispatchEvent(new w.Event('input', { bubbles: true }));
  };
  const phoneErr = () => d.querySelector('[data-err="phone"]').textContent.trim();
  typePhone('987 654 321');
  assert.equal(d.getElementById('phone').value, '987654321', 'the box keeps every digit and loses the spaces, as it is typed');
  assert.equal(phoneErr(), 'Please enter a valid number.', 'nine digits under +91 is too few, and the page says so before the button');
  d.querySelector('.cta').click();
  assert.equal(posts.length, 0, 'and nothing is posted while a field is wrong');
  typePhone('9876543210');
  assert.equal(phoneErr(), '', 'and it goes quiet on the tenth digit, which is the length that country asks for');

  /* and the other way round: changing the country rejudges what is already typed, rather than
     leaving a green tick on a number that stopped being a number one field to the left of it */
  d.querySelector('.cc-btn').click();
  find.value = 'uae';
  find.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.deepEqual([...d.querySelectorAll('.cc-list li')].map(li => li.textContent.trim()), ['United Arab Emirates+971'],
    'the search knows the short name nobody writes in full, which is why "uae" finds the Emirates');
  d.querySelector('.cc-list li').click();
  assert.equal(phoneErr(), 'Please enter a valid number.', 'and ten digits under +971 is one too many, told at once');
  typePhone('050 123-45 67');
  assert.equal(d.getElementById('phone').value, '0501234567', 'the zero they typed for a local call stays in the box, because it is the door that drops it');
  assert.equal(phoneErr(), '', 'and nine digits after that zero is a whole UAE number');
  d.querySelector('input[name=consent]').checked = true;
  d.querySelector('.cta').click();
  await new Promise(r => setTimeout(r, 250));

  const sent = posts.map(p => p.url);
  assert.deepEqual(sent, ['/api/sharjah-lead'], 'one call, to this site\'s own door, and nothing else leaves the page');
  const create = posts.find(p => p.url.includes('sharjah-lead')) || { body: '{}' };
  const body = JSON.parse(create.body);
  assert.equal(body.phone, '0501234567', 'the number that arrives is digits, nothing else, and the trunk zero is the door\'s to drop');
  assert.equal(body.country_code, '+971', 'and the code is the one the picker was left on');
  assert.equal(body.full_name, "Navaira <img src=x onerror=\"window.__pwned=1\"> O'Brien",
    'the two fields the design drew arrive as the one name every door here reads, quotes and all, unfixed');
  assert.equal(body.source, 'sharjah-next-2026', 'and which offer it came for');
  assert.equal(body.consent, 'on', 'the tick box travels, because the row is the proof somebody agreed');
  assert.ok(!('hp' in body), 'the honeypot field is never posted');
  assert.ok(Number(body._t) >= 1, 'with how long the form was open, for the door to judge');
  assert.equal(d.getElementById('doneView').className.trim(), 'done on', 'the page changes to the ready view the design drew');
  assert.equal(d.getElementById('miraFrame').getAttribute('src'), 'https://brain.boasis.ae?src=sharjah-next&ref=SN-K7QF3M',
    'Mira opens in the card, carrying the reference the mails show');
  assert.equal(/(^| )opened( |$)/.test(d.querySelector('.main').className), true,
    'the shipped page is in its Mira shape after the submit: one column, steps and date box gone');
  assert.equal(/(^| )mira-open( |$)/.test(d.documentElement.className), true,
    'and the html element itself carries the opened class, so the header, the footer and the offer are gone from the page the person is looking at');
  assert.ok(!w.__pwned, 'and a name written as markup stays a name');
  assert.equal(w.localStorage.length, 0, 'and nothing at all is kept in the browser, because there is no session to resume yet');
});

test('the mailbox check is drawn into the form itself, in the form\'s own words', () => {
  const h = HTML();
  const iEmail = h.indexOf('id="email"'), iRow = h.indexOf('data-vrow'), iPhone = h.indexOf('id="phone"');
  assert.ok(iEmail > 0 && iRow > iEmail && iPhone > iRow,
    'the verify row sits under the email field and above the mobile one, which is where it was asked for');
  const row = h.slice(iRow, iPhone);
  assert.match(row, /<button type="button" class="vbtn" data-sendcode/, 'a button that says what it does, and never submits the form by accident');
  assert.match(row, /data-vcode hidden/, 'the code box is folded away until a code is actually on its way');
  assert.match(row, /name="emailv"/, 'the proof the door hands back is a field of the form, so it travels with the lead and nowhere else');
  assert.match(row, /autocomplete="one-time-code"/, 'and the phone is offered the digits out of the message, the way the early access form does');
  assert.match(row, /maxlength="6"/, 'six, and no more');
  for (const k of ['vSend', 'vCode', 'vCheck']) {
    assert.match(row, new RegExp('data-k="' + k + '"'), k + ' is painted from the dictionary, like every other word on this page');
  }
  const css = h.slice(h.indexOf('.card.bo{'));   /* the card's own block, where every rule that colours this form lives */
  assert.match(css, /\.bo \.vbtn\{/, 'it is styled inside the card, in the card\'s own tokens, not a second look bolted on');
  assert.match(css, /border:1\.5px solid var\(--bo-line\)/, 'the same border as the fields above it');
  assert.match(css, /\.bo \.vstat\{[^}]*--bo-muted/, 'and the same quiet grey the help text uses');
  const dict = JS().slice(0, JS().indexOf('const root='));
  for (const k of ['vSend', 'vAgain', 'vBusy', 'vCode', 'vCheck', 'vSent', 'vOk', 'vSoon', 'eCode', 'eTries', 'eSend', 'eVerify']) {
    assert.ok(dict.includes(k + ":'"), k + ' has words of its own at the top of the script, where the page keeps them');
  }
});

test('the door wants a code the mailbox answered, spends it once, and can be told to drop the whole check', () => {
  const sp = read('lib/spark.js');
  assert.match(sp, /o\.verify\.peek\(form\.contact\.email, proof\)/, 'it looks at the proof without spending it, so any other refusal leaves the code usable');
  assert.match(sp, /error: 'emailv'/, 'and the reason it says is the name of the field the page can act on');
  assert.ok(sp.indexOf('verify.peek') < sp.indexOf('const ref = newRef()'), 'a lead with no proof is turned away before a reference is made or a file is written');
  assert.ok(sp.indexOf('saveJson(snFile(ref)') < sp.indexOf('o.verify.consume'), 'the proof is spent only after the record is on disk');
  assert.match(sp, /const need = !!o\.verify && o\.verifyRequire !== false/, 'the whole thing hangs on one switch, not on an edit to this file');
  assert.match(read('server.js'), /verify: emailVerify,\s*\n\s*verifyRequire: config\.verify\.require,/,
    'and the stand is handed the same module and the same switch the early access door reads, so one value decides it for both');
  assert.match(read('lib/leads.js'), /emailv/, 'the mirror into the table drops the proof, because a row has no business carrying a key to anything');
});

test('the mail that carries the code says nothing about which form it came from', () => {
  const { verifyCode } = require(path.join(ROOT, 'lib/mail-templates'));
  const m = verifyCode({ email: 'a@b.co', code: '246813' });
  const all = m.subject + ' ' + m.text + ' ' + m.html;
  assert.match(m.text, /Enter it on the form you are filling in\./, 'it says where to put the code, which is all it needs to say');
  assert.ok(!/early access|BOASIS Manage/i.test(all), 'and it never names the other entrance, because a person at the stand would read a lie');
  assert.equal(m.subject, 'Your BOASIS code is 246813', 'the subject is the code, so it is findable in a full inbox at a loud stand');
});

test('a live box takes the code, then the lead, and never the same code twice', async () => {
  /* a fresh address every run, because the wait between codes is measured per mailbox and a second
     run of the suite must not inherit a minute of patience from the first */
  const email = 'sn-check-' + Date.now().toString(36) + '@example.com';
  const lead = extra => ({
    full_name: 'Rehearse Person', email, phone: '501234567', country_code: '+971',
    consent: 'on', source: 'sharjah-next-2026', _t: 5000, ...extra,
  });
  const sent = await postJSON('/api/verify-email/send', { email, _t: Date.now() - 4000 });
  assert.equal(sent.status, 200, 'the code door answers for this address as it does for the other form');
  assert.match(String(sent.j.devCode), /^\d{6}$/, 'this box mails nobody, so it hands the code back and the walk through stays possible');

  const blind = await postJSON('/api/sharjah-lead', lead());
  assert.equal(blind.status, 400, 'a lead without the proof is refused');
  assert.equal(blind.j.error, 'emailv', 'by the name the page knows what to do with');
  const snDir = path.join(DATA, 'sharjah-next');
  const snFiles = () => (fs.existsSync(snDir) ? fs.readdirSync(snDir) : []);
  assert.equal(snFiles().length, 0, 'and nothing at all was written on the way');

  assert.equal((await postJSON('/api/verify-email/verify', { email, code: '000000' })).j.errors[0], 'code', 'a wrong code is a wrong code');
  const got = await postJSON('/api/verify-email/verify', { email, code: sent.j.devCode });
  assert.ok(got.j.ok && got.j.token, 'the right one comes back as a signed proof');
  const inTime = await postJSON('/api/sharjah-lead', lead({ emailv: got.j.token }));
  assert.equal(inTime.status, 200, 'and one look at the mailbox is all the stand needs');
  assert.match(inTime.j.ref, /^SN-[A-Z0-9]{6}$/, 'with the reference the print and the mails show');
  const replay = await postJSON('/api/sharjah-lead', lead({ emailv: got.j.token }));
  assert.equal(replay.j.error, 'emailv', 'the same proof does not open the door a second time');
  const again = await postJSON('/api/verify-email/send', { email, _t: Date.now() - 4000 });
  assert.equal(again.status, 429, 'and that mailbox is left alone for a minute, so the code is not a way to make the site mail');
  assert.ok(again.j.retryIn > 0 && again.j.retryIn <= 60, 'which the answer counts down for the page');

  const raw = fs.readFileSync(path.join(snDir, snFiles()[0]), 'utf8');
  assert.ok(!/eyJ|emailv/.test(raw), 'the proof is nowhere in the record, because only the address was ever worth keeping');
  assert.match(raw, /"email": "sn-check-/, 'the address itself is there, checked and all');
});

test('the page opens the box, takes six digits, and carries the proof to the door', { skip: JSDOM ? false : 'jsdom not installed' }, async () => {
  const dom = new JSDOM(HTML(), { url: 'https://boasis.ae/sharjah-next', runScripts: 'dangerously', pretendToBeVisual: true });
  const w = dom.window, posts = [];
  const answer = b => ({ status: 200, json: () => Promise.resolve(b) });
  let sent = null;
  /* the door answers the first submit the way a stale proof makes it answer, because the recovery
     is the half of this flow nobody sees coming and the half most likely to break in six months */
  let staleOnce = true;
  w.fetch = (u, o) => {
    const body = (o && o.body) || '{}';
    posts.push({ url: String(u), body });
    const b = JSON.parse(body);
    if (u.includes('/api/verify-email/send')) { sent = b; return Promise.resolve(answer({ ok: true, devCode: '246813' })); }
    if (u.includes('/api/verify-email/verify')) {
      return Promise.resolve(answer(b.code === '246813' ? { ok: true, token: 'PROOF-FOR-' + b.email } : { ok: false, errors: ['code'] }));
    }
    if (u.includes('/api/sharjah-lead')) {
      const refused = staleOnce; staleOnce = false;
      return Promise.resolve(answer(refused ? { ok: false, error: 'emailv' }
        : { ok: true, ref: 'SN-K7QF3M', brain_url: 'https://brain.boasis.ae' }));
    }
    return Promise.resolve(answer({ ok: true }));
  };
  w.eval(read('js/countries.js'));
  w.eval(JS());
  const d = w.document, form = d.getElementById('snForm');
  const box = form.querySelector('[data-vcode]'), vBtn = form.querySelector('[data-sendcode]');
  const codeIn = d.getElementById('vcode'), tokenIn = form.elements['emailv'];
  const errOf = k => form.querySelector('[data-err="' + k + '"]').textContent.trim();
  const tick = ms => new Promise(r => setTimeout(r, ms));

  assert.equal(box.hidden, true, 'nobody is shown a code box before a code is on its way');
  assert.equal(vBtn.textContent.trim(), 'Verify my email', 'the button under the email says what it does');
  vBtn.click();
  assert.equal(posts.length, 0, 'and pressing it with nothing typed asks the server for nothing');
  assert.equal(errOf('email'), 'Please enter a valid email.', 'it says which field is short instead');

  form.elements['email'].value = 'reader@corp.example';
  vBtn.click();
  await tick(30);
  assert.deepEqual(posts.map(p => p.url), ['/api/verify-email/send'], 'one call, for the code, and nothing else');
  assert.equal(sent.email, 'reader@corp.example', 'about the address in the field at that moment');
  assert.ok(Number(sent._t) > 0, 'with the age of the page, which is what tells the door a person read it');
  assert.equal(box.hidden, false, 'the box is open, and the digits are expected in it');
  assert.match(vBtn.textContent, /^Next code in \d+s$/, 'the button counts the minute out loud rather than waiting to be told no');
  assert.equal(codeIn.value, '246813', 'a box that mails nobody shows its code, so a rehearsal can be walked all the way through');

  codeIn.value = '111111';
  codeIn.dispatchEvent(new w.Event('input', { bubbles: true }));
  await tick(30);
  assert.match(errOf('code'), /That is not the code/, 'five wrong digits are said out loud, under the box they belong to');
  assert.equal(tokenIn.value, '', 'a wrong code buys nothing');
  codeIn.value = '246813';
  codeIn.dispatchEvent(new w.Event('input', { bubbles: true }));
  await tick(30);
  assert.equal(tokenIn.value, 'PROOF-FOR-reader@corp.example', 'the right six, and the proof is in the form');
  assert.equal(box.hidden, true, 'the box closes once it has done its job');
  assert.match(form.querySelector('[data-vstat]').textContent, /Verified · reader@corp\.example/, 'and the line beside the button says so, with the address it is about');
  assert.equal(vBtn.hidden, true, 'and the button steps aside, because at that moment nothing is missing');

  /* the proof is about one address, so editing the address has to cost it, and the wait has to go
     with it: a different mailbox is a different question, and nothing here may strand a person at a
     stand with a form they are not allowed to finish */
  form.elements['email'].value = 'reader@corp.examp';
  form.elements['email'].dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(tokenIn.value, '', 'a keystroke in the email and the proof is gone');
  assert.equal(box.hidden, false, 'the box is back');
  assert.equal(vBtn.disabled, false, 'and the button works again at once, for the address that is typed now');
  assert.equal(vBtn.hidden, false, 'and it is visible again, since the thing it asks for is needed again');
  form.elements['email'].value = 'reader2@corp.example';
  vBtn.click();
  await tick(30);
  assert.equal(sent.email, 'reader2@corp.example', 'a second code, asked for the new address');
  codeIn.value = '246813';
  codeIn.dispatchEvent(new w.Event('input', { bubbles: true }));
  await tick(30);
  assert.equal(tokenIn.value, 'PROOF-FOR-reader2@corp.example', 'and the proof is for that one');

  d.getElementById('first_name').value = 'Ada';
  d.getElementById('last_name').value = 'Lovelace';
  d.getElementById('phone').value = '0501234567';
  d.getElementById('phone').dispatchEvent(new w.Event('input', { bubbles: true }));
  d.querySelector('input[name=consent]').checked = true;
  d.querySelector('.cta').click();
  await tick(250);
  const gone = JSON.parse(posts[posts.length - 1].body);
  assert.equal(posts[posts.length - 1].url, '/api/sharjah-lead', 'then the one call the page has always made');
  assert.equal(gone.emailv, 'PROOF-FOR-reader2@corp.example', 'carrying the proof beside the lead');
  assert.ok(!('code' in gone), 'but never the six digits themselves, which are nobody\'s business once they have been read');
  assert.equal(gone.email, 'reader2@corp.example', 'and the address that was checked is the address that is kept');
  assert.equal(d.getElementById('doneView').className.trim(), 'done', 'and the person is not sent to Mira with a record the door refused');
  assert.equal(tokenIn.value, '', 'the stale proof is dropped, not carried along to be refused twice');
  assert.equal(errOf('email'), 'Please verify your email first.', 'and the note goes under the field it is about');
  assert.equal(box.hidden, false, 'with the code box open underneath it');
  assert.equal(vBtn.hidden, false, 'and the ask came back by itself, so nobody reloads and retypes four fields at a stand');

  /* six minutes at the stand, the case the button exists for: one press, one code, the same fields */
  vBtn.click();
  await tick(30);
  codeIn.value = '246813';
  codeIn.dispatchEvent(new w.Event('input', { bubbles: true }));
  await tick(30);
  assert.equal(tokenIn.value, 'PROOF-FOR-reader2@corp.example', 'a fresh proof for the same address');
  assert.equal(vBtn.hidden, true, 'and the button is out of the way again');
  d.querySelector('.cta').click();
  await tick(250);
  const last = JSON.parse(posts[posts.length - 1].body);
  assert.equal(last.emailv, 'PROOF-FOR-reader2@corp.example', 'the fresh proof travelled with the lead');
  assert.equal(d.getElementById('doneView').className.trim(), 'done on', 'and Mira opens, with nothing retyped');
  dom.window.close();
});

test('a pass from the door opens Mira on that person row, and a bad one opens nothing of the sort', { skip: JSDOM ? false : 'jsdom not installed' }, async () => {
  const fill = async (answer) => {
    const dom = new JSDOM(HTML(), { url: 'https://boasis.ae/sharjah-next', runScripts: 'dangerously', pretendToBeVisual: true });
    const w = dom.window, posts = [];
    w.fetch = (u, o) => {
      posts.push({ url: String(u), body: (o && o.body) || '' });
      if (u.includes('/api/sharjah-lead')) return Promise.resolve({ status: 200, json: () => Promise.resolve(answer) });
      return Promise.resolve({ status: 200, json: () => Promise.resolve({ ok: true }) });
    };
    w.eval(read('js/countries.js'));
    w.eval(JS());
    const d = w.document, F = d.getElementById('snForm').elements;
    d.getElementById('first_name').value = 'Ada';
    d.getElementById('last_name').value = 'Lovelace';
    F['email'].value = 'ada@corp.example';
    d.getElementById('phone').value = '0501234567';
    d.getElementById('phone').dispatchEvent(new w.Event('input', { bubbles: true }));
    d.querySelector('input[name=consent]').checked = true;
    F['emailv'].value = 'PROOF-OK';
    d.querySelector('.cta').click();
    await new Promise(r => setTimeout(r, 250));
    const out = {
      src: d.getElementById('miraFrame').getAttribute('src') || '',
      posts: posts.map(p => p.url),
    };
    dom.window.close();
    return out;
  };

  const withPass = await fill({ ok: true, ref: 'SN-K7QF3M', pass: 'PASS4SBM6NN5', brain_url: 'https://brain.boasis.ae' });
  assert.equal(withPass.src, 'https://brain.boasis.ae?src=sharjah-next&pass=PASS4SBM6NN5&embed=1&ref=SN-K7QF3M',
    'the pass goes to Mira in the address, which is the only credential she needs to write on that row');
  assert.ok(!('href' in withPass), 'and that address is handed to nothing else, so there is no second visit to open by accident');
  assert.deepEqual(withPass.posts, ['/api/sharjah-lead'], 'and the page still speaks to one door, our own: it never reaches the project directly');

  const junk = await fill({ ok: true, ref: 'SN-K7QF3M', pass: 'PASS123', brain_url: 'https://brain.boasis.ae' });
  assert.ok(!/pass=/.test(junk.src), 'a string that is not a shaped pass is not sent anywhere, because it is a row key');
  assert.equal(junk.src, 'https://brain.boasis.ae?src=sharjah-next&ref=SN-K7QF3M', 'the visit opens on the reference alone, the way it did before passes');

  const none = await fill({ ok: true, ref: 'SN-K7QF3M', brain_url: 'https://brain.boasis.ae' });
  assert.equal(none.src, 'https://brain.boasis.ae?src=sharjah-next&ref=SN-K7QF3M',
    'and a door that could not mint a pass still hands over a working page: no pass is a smaller record, never a lost lead');
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

test('the paste copies of the SQL are the same statements, with the prose gone', () => {
  const { stripSql } = require(path.join(ROOT, 'scripts/strip-comments.js'));
  for (const rel of ['spark.sql', 'leads.sql', 'sharjah-next.sql', 'sharjah-next-passes.sql']) {
    const src = read('demo/supabase/' + rel);
    const bare = read('demo/supabase/paste/' + path.basename(rel));
    assert.equal(bare, stripSql(src), path.basename(rel) + ' in paste/ is exactly what the generator takes out of it');
    const flat = t => t.replace(/--[\s\S]*?(?=\n)/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\s+/g, ' ').replace(/\s*([(),;])\s*/g, '$1').trim();
    assert.equal(flat(bare), flat(src), path.basename(rel) + ': no statement, no quote and no grant changed on the way');
    assert.ok(bare.length < src.length, path.basename(rel) + ' is the shorter read, ' + bare.length + ' bytes against ' + src.length);
    assert.match(bare, /row level security/, 'and the lock is still in there, comments or no comments');
  }
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

test('the page\'s submit opens a queue rather than sending a mail, and the watch sends what is due', () => {
  const spark = read('lib/spark.js');
  const watch = read('lib/sharjah-watch.js');
  assert.match(spark, /if \(mode === 'submit' \|\| mode === 'each'\)/,
    'the door sends on its own only in the two read through values, so a live submit records the lead and marks the queue instead of mailing a receipt nobody has earned');
  assert.match(spark, /\} else \{\n      try \{ snWatch\.note\(\{ ref, pass,/,
    'and the live path opens one file for that reference, carrying the pass and the moment of the form, which is the whole queue');
  assert.match(spark, /snWatch\.start\(\)/, 'the timer is mounted with the doors, in the process that already knows where its data directory is');
  assert.match(watch, /t\.unref\(\)/, 'and it is unref\'d, so a test run or a shutdown is never left waiting on it');
  assert.match(read('lib/mailer.js'), /\['congrats', 'sharjahCongrats'\], \['paid', 'sharjahPaid'\], \['reminder', 'sharjahReminder'\]/,
    'the three are one named list in the mailer, which is what lets one moment send exactly one of them');
  assert.match(read('lib/mailer.js'), /SN_MAIL_KINDS\.filter\(pair => kinds\.indexOf\(pair\[0\]\) >= 0\)/,
    'and one mail can be sent on its own, which is what the three separate moments need');
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

