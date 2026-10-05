const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/* The contact page is HTML + CSS + a small script, so it is tested as a served thing:
   does it load, does everything it points at exist, and does it reach the API.
   The form asks four things only: name, email, phone (code picked, number typed) and message;
   every one of those is required, and every fault lands under its own field. */

const ROOT = path.resolve(__dirname, '..');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'boasis-contact-'));
let proc, base;

before(async () => {
  proc = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, BOASIS_NO_ENV_FILE: '1', PORT: '0', DATA_DIR: DATA, MAIL_DRY_RUN: '1', VISITOR_SALT: 'test-salt' , RATE_LIMIT_FORMS_PER_MIN: '10000', RATE_LIMIT_VISITS_PER_MIN: '10000' },
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

const { withCaptcha } = require('./helpers/captcha');
const get = p => fetch(base + p);
const HUMAN = () => ({ _t: Date.now() - 12000 });
/* exactly the body the browser sends: FormData of the form, JSON.stringify'd */
/* FormData picks up every named control, hidden ones included, so the real body carries
   hp and _t, and the phone arrives as ONE string: the code the visitor picked, the number
   typed. js/contact.js does the joining; this fixture is what that joining produces. */
const formPayload = extra => ({ hp: '', ...HUMAN(),
  name: 'Amina Al Mazroui', email: 'amina@example.com',
  country_code: '+971', phone: '+971 50 123 4567',
  message: 'We sell skincare online, need two visas.', ...extra });

/* The 'Contact us' buttons were mailto: until 13 September; two were relabelled on 15
   September, and the header's button was removed on 16 September, on every page, because
   the header is the same on each of them. Set-up visitors get "Book a demo"; Manage
   visitors get "Join early access", which since 4 October leads to the early-access page.
   These tests are what stops any of that quietly regressing. */
test('the header has no Contact us button, on any page', async () => {
  for (const p of ['/', '/contact.html', '/blog.html', '/privacy.html', '/terms.html']) {
    const html = await (await get(p)).text();
    assert.ok(!/nav-contact/.test(html), p + ' still carries the header button');
    assert.match(html, /class="nav-wait"[^>]*>Join Early Access</, p + ' header button is Join Early Access');
    assert.ok(!/class="nav-wait"[^>]*data-open/.test(html), p + ' header button opens no dialog: it is a link');
  }
});

test('the main page points set-up at the demo dialog and manage at the early-access page', async () => {
  const home = await (await get('/')).text();
  const demos = [...home.matchAll(/class="(?:act|btn btn-light)" href="\/contact\.html"[^>]*data-open="demo"[^>]*>Book a demo/g)];
  assert.equal(demos.length, 2, 'the Set up door and the free-zone CTA open the demo dialog, saw ' + demos.length);
  const joins = [...home.matchAll(/href="\/early-access">Join early access/g)];
  assert.equal(joins.length, 4, 'the Manage door and all three plans lead to the early-access page, saw ' + joins.length);
  assert.ok(!/data-open="manage"/.test(home), 'and nothing on the home page opens the old list dialog');
  /* the plans · the onboarding document prices two of them (1 company AED 30, up to 3 AED 90),
     so those numbers are pinned: a plan that loses its price is a promise the site cannot keep.
     It carries no list of what each plan includes, so the page states none — if a feature list
     ever comes back, the client's document has to come with it. */
  const plans = [...home.matchAll(/<p class="plan-name">([^<]+)<\/p>/g)].map(m => m[1]);
  assert.deepEqual(plans, ['One company', 'Up to three companies', 'Enterprise'], 'the three plans, in order, saw ' + JSON.stringify(plans));
  const amounts = [...home.matchAll(/<span class="plan-amount">([^<]+)<\/span>/g)].map(m => m[1]);
  assert.deepEqual(amounts, ['AED 30', 'AED 90', 'Custom'], 'each plan shows what it costs, saw ' + JSON.stringify(amounts));
  assert.match(home, /<span class="plan-free">Free for the first year<\/span>/, 'the launch offer rides on the first plan');
  assert.ok(!/class="plan-(list|lead|body)"/.test(home),
    'no plan states what it includes: only what the client confirmed, and the document lists no per-plan features');
  assert.ok(!/id="waitlist"/.test(home), 'the waiting list section is gone from the page');
  /* 19 September: the owner asked for the two hero cards to go to their own sections, and
     for the button inside to be the only thing that opens a dialog. The title's link carries
     the real href and its ::after covers the card, so the card glides; the button is the
     opener and js/site.js skips the glide for an opener, so one click can never do both. */
  assert.match(home, /<div class="door">/, 'the hero card itself is not a dialog opener any more');
  assert.ok(!/<div class="door" data-open/.test(home), 'no hero card opens a dialog');
  assert.match(home, /<a class="t" href="#setup">Set up<\/a>/, 'the Set up card goes to the Set up section');
  assert.match(home, /<a class="t" href="#manage">Manage<\/a>/, 'and the Manage card goes to Manage');
  assert.match(home, /<a class="act" href="\/contact\.html" data-open="demo">Book a demo<\/a>/, 'the Set up button still opens the demo dialog');
  assert.match(home, /<a class="act" href="\/early-access">Join early access<\/a>/, 'and the Manage button leads to the early-access page');
  const js = await (await get('/js/site.js')).text();
  assert.match(js, /if \(!a \|\| a\.hasAttribute\('data-open'\)\) return;/, 'an opener is not an in-page anchor: no glide behind the dialog');
  assert.match(home, /<div class="foot-ask">\s*<h2>Any questions\?<\/h2>\s*<a class="btn btn-light" href="\/contact\.html">Contact us/, 'the footer question is the last Contact us');
  const buttons = [...home.matchAll(/class="btn[^"]*" href="([^"]+)">Contact us/g)].map(m => m[1]);
  assert.deepEqual(buttons, ['/contact.html'], 'only the footer keeps the Contact us label, saw ' + JSON.stringify(buttons));
  assert.equal((await get(buttons[0])).status, 200, buttons[0] + ' does not resolve');
  assert.ok(!/class="btn[^"]*" href="mailto:/.test(home), 'no button may open an email draft any more');
  assert.match(home, /href="mailto:/, 'but the footer address stays a mailto, on purpose');
});

test('the demo dialog is on the home page, and the early-access form is a page of its own', async () => {
  const home = await (await get('/')).text();
  assert.match(home, /<div class="modal" id="modal-demo"/, 'the demo dialog');
  assert.ok(!/id="modal-manage"/.test(home), 'the early access dialog is gone from the home page');
  assert.match(home, /id="demo-form" data-endpoint="\/api\/demo"/, 'the dialog posts to its own endpoint');
  /* the embed form Google documents: the full schedule URL with gv=true. The short
     calendar.app.google link is refused inside a frame. */
  assert.match(home, /<iframe data-src="https:\/\/calendar\.google\.com\/calendar\/appointments\/schedules\/[\w-]+\?gv=true"/,
    'the demo step two carries the calendar, lazy-loaded, in the embeddable form');
  assert.match(home, /name="who"/, 'the demo asks who they are');
  assert.match(home, /name="entity"/, 'and, once answered, the name of the company or authority');
  assert.match(home, /<option value="" selected disabled>Who are you\?/);

  /* the early-access page carries the fields the dialog carried, one to one, and the same
     endpoint: the API, the rules and the mails are exactly what they were */
  const early = await (await get('/early-access')).text();
  assert.match(early, /id="join-form" data-endpoint="\/api\/manage"/, 'the page form posts to the manage endpoint');
  for (const f of ['name', 'email', 'phone', 'have', 'count', 'authority', 'plans'])
    assert.match(early, new RegExp(`name="${f}"`), 'the page form is missing ' + f);
  assert.ok(!/value="opening"/.test(early), '"thinking of opening" is not an answer to "how many companies"');
  assert.match(early, /<option value="" selected disabled>Do you have a company\?/);
  assert.match(early, /<option value="" selected disabled>How many companies\?/);
  assert.match(early, /<div class="captcha" data-captcha>/, 'and the box that keeps the cost of automation high');
  /* the mailbox proof: the code field a visitor types, and the hidden field the signed
     token rides in. Both are in the DOM from the first pixel, hidden one step at a time. */
  assert.match(early, /<input type="hidden" name="code" value="">/, 'the code the form carries is one hidden value');
  assert.equal((early.match(/class="ea-d"/g) || []).length, 6, 'and the visitor types it into six boxes, one digit each');
  assert.match(early, /data-code[\s>]/, 'the boxes are a group the script can find');
  assert.match(early, /autocomplete="one-time-code"/, 'and the first one takes the browser\'s own code autofill');
  assert.equal((early.match(/<main>/g) || []).length, 1, 'one main on the page: a second one doubles the header space above the split');
  assert.equal((early.match(/<\/main>/g) || []).length, 1, 'and it closes once');
  assert.equal((early.match(/data-back>Back/g) || []).length, 4, 'four steps carry a way back, and the code step asks its own question instead');
  assert.match(early, /class="ea-verified" data-verified hidden>/, 'the verified address gets a line under the field');
  {
    /* every element this page hides with the hidden attribute, if it is also given a display
       by class name, needs its own [hidden] rule: the browser puts the author rule first, so
       the attribute alone does not hide it. This is the check that catches "Verified as,"
       sitting on a form where nothing has been verified yet, and it catches the next one. */
    const css = fs.readFileSync(path.join(ROOT, 'css/early-access.css'), 'utf8');
    const js = fs.readFileSync(path.join(ROOT, 'js/early-access.js'), 'utf8');
    const shownBy = new Map();
    for (const m of css.matchAll(/([^{}\n]+)\{([^{}]*)\}/g)) {
      const sel = m[1], body = m[2];
      const d = (body.match(/display:\s*([a-z-]+)/) || [])[1];
      if (!d) continue;
      for (const cls of sel.match(/\.[A-Za-z0-9_-]+/g) || []) {
        const name = cls.slice(1);
        if (sel.includes('[hidden]')) shownBy.set(name, 'guarded');
        else if (shownBy.get(name) !== 'guarded' && d !== 'none') shownBy.set(name, d);
      }
    }
    /* which classes this page puts away: the elements are found by selector, so a class is
       counted as toggled when the script hides something it reaches by that name */
    const reached = [...js.matchAll(/querySelector\(\S{0,40}?[.#]([a-z][a-z0-9-]*)[^\n]{0,120}?\.hidden\s*=|\.hidden\s*=[\s\S]{0,60}?closest\('\.([a-z][a-z0-9-]*)'\)/g)].map(m => m[1] || m[2]);
    const toggled = new Set([...reached, 'ea-verified', 'ea-sum', 'ea-go', 'ea-code-sent', 'ea-step']);
    const loose = [...shownBy].filter(([name, v]) => v !== 'guarded' && toggled.has(name) && name !== 'ea-step');
    assert.deepEqual(loose, [], 'no element this page hides by attribute is left open by a display rule: ' + loose.map(x => x[0]).join(', '));
  }
  assert.match(early, /so it cannot be changed\.<\/p>/, 'the line says the fact and stops, without naming where');
  assert.ok(!/data-unlock/.test(early), 'and it is not a menu: no link under a verified address');
  assert.match(early, /<input type="hidden" name="emailv"/, 'and carries its proof to the endpoint');
  for (const b of ['data-sendcode', 'data-verifycode', 'data-resend', 'data-backemail']) {
    assert.match(early, new RegExp(b), 'the code step needs its ' + b + ' control');
  }
  assert.ok(!/data-open/.test(early), 'nothing on the page opens a dialog');
  assert.ok(!/pictures|images/i.test(early), 'the captcha is never explained with pictures');
  for (const f of ['/api/demo', '/api/manage']) {
    const r = await fetch(base + f, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.notEqual(r.status, 404, f + ' does not exist');
  }
});

test('the form asks name, email, phone and message, and nothing it does not answer', async () => {
  const html = await (await get('/contact.html')).text();
  assert.ok(!/name="about"/.test(html), 'the Set up / Manage question is gone: the form no longer asks it');
  assert.ok(!/What are you contacting us about/.test(html), 'and its heading went with it');
  assert.match(html, /name="country_code"/, 'the phone carries a country code selector');
  assert.match(html, /<input type="hidden" name="country_code" value="\+971">/, 'and the UAE is the default, since that is the market');
});

/* 15 September: the owner asked for the three phone fields to be one control, searchable,
   and for the contact page's native <select> — which said "+966" and nothing else — to
   become the dialogs' own picker. One script drives all three (js/countries.js), so the
   markup is asserted byte for byte: if a country is added to one picker it is added to all
   three, and the search box can never appear in one place and go missing in another. */
test('the four phone fields carry one country picker, with one search box', async () => {
  const home = await (await get('/')).text();
  const early = await (await get('/early-access')).text();
  const contact = await (await get('/contact.html')).text();
  /* the demo entrance came later, and it asks the same question, so it is in the count: the
     owner asked for its dropdown to be the site's own control rather than a fourth design */
  const demo = await (await get('/try-mira')).text();

  const PICKER = /<span class="sr">Country code<\/span>[\s\S]*?<input type="hidden" name="country_code" value="\+971">/g;
  const norm = s => s.replace(/\s+/g, ' ').trim();
  const onHome = home.match(PICKER) || [];
  const onEarly = early.match(PICKER) || [];
  const onContact = contact.match(PICKER) || [];
  const onDemo = demo.match(PICKER) || [];
  assert.equal(onHome.length, 1, 'the demo dialog carries a picker, saw ' + onHome.length);
  assert.equal(onEarly.length, 1, 'the early-access form carries one, saw ' + onEarly.length);
  assert.equal(onContact.length, 1, 'and the contact form carries one, saw ' + onContact.length);
  assert.equal(onDemo.length, 1, 'and the stand form carries one, saw ' + onDemo.length);
  assert.equal(norm(onHome[0]), norm(onEarly[0]), 'the early-access picker must be the same control');
  assert.equal(norm(onHome[0]), norm(onContact[0]), 'the contact picker must be that same control, not a second one');
  assert.equal(norm(onHome[0]), norm(onDemo[0]), 'and so must the one on /try-mira, down to the order of the tags');

  for (const block of [...onHome, ...onEarly, ...onContact, ...onDemo]) {
    assert.match(block, /class="cc-btn"[^>]*aria-haspopup="listbox"/, 'the closed control opens a listbox');
    assert.match(block, /<div class="cc-pop" hidden>/, 'the panel starts closed');
    assert.match(block, /class="cc-search"[^>]*placeholder="Search country"/, 'and it carries the search box');
    assert.match(block, /class="cc-list" role="listbox"/, 'with the list of countries');
    assert.match(block, /class="cc-none" hidden/, 'and the line it says when a search finds nothing');
  }
  assert.ok(!/<select name="country_code"/.test(contact), 'the native select on the contact page must not come back');
  assert.ok(!/<option value="\+971"/.test(contact), 'nor any of its sixty options');
  assert.ok(!/<select/.test(demo), 'and the stand form keeps no native select either');
  assert.ok(/window\.BoasisCountryPicker\.init/.test(fs.readFileSync(path.join(__dirname, '..', 'js', 'try-mira.js'), 'utf8')),
    'and its own script is the one that asks the shared picker to run');

  for (const [page, html, own] of [['/', home, '/js/site.js'], ['/early-access', early, '/js/early-access.js'], ['/contact.html', contact, '/js/contact.js'], ['/try-mira', demo, '/js/try-mira.js']]) {
    const script = /<script src="\/js\/countries\.js"><\/script>/.exec(html);
    assert.ok(script, page + ' must load the one picker script');
    assert.ok(html.indexOf('/js/countries.js') < html.indexOf(own),
      page + ' must load the picker before the script that asks it for one');
  }
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
  assert.match(html, /name="name"[^>]*required/);
  assert.match(html, /name="email"[^>]*required/);
  /* This asserted the opposite until 13 September 2026, when the owner asked for every field
     to be required. Both sides are pinned now: the page asks, and validate.js refuses without
     a number, so neither can drift back to optional by accident. */
  assert.match(html, /name="phone"[^>]*required/, 'phone is required, on the owner instruction');
  assert.match(html, /name="message"[^>]*required/, 'an enquiry with no message is not worth mailing');
  assert.ok(!/Set up is a new company/.test(html), 'the explanation line was removed on request');
  assert.ok(!/ct-sub/.test(html) && !/ct-sub/.test(cssOf), 'and its CSS went with it');
  // one field per pill, full width, all four required, as asked
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
  // the fault lands under its own field, not in a line below the button
  for (const f of ['name', 'email', 'phone', 'message'])
    assert.match(html, new RegExp(`data-err="${f}"`), 'the ' + f + ' fault has a place to land');
});

test('the waiting list is gone from the main page, and contact borrows no field from it', async () => {
  const contact = await (await get('/contact.html')).text();
  assert.ok(!/name="intent"/.test(contact), 'contact must not steal `intent` for anything else');
  assert.ok(!/name="about"/.test(contact), 'and the old Set up / Manage field is gone for good');
});

/* The site has a voice, and it is narrow enough to check mechanically. Read from index.html:
   the brand never says "we" or "us", never re-explains Set up / Manage, and the aside I invented
   ("Or, the long way") is gone for good. These fail loudly if a rewrite drifts back. */
test('the copy keeps the site voice: no first person, no invented sections', async () => {
  const html = await (await get('/contact.html')).text();
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  /* The owner moved THIS page into a first person voice on 13 September 2026 ("Write to us.").
     The home page rule still stands, so the exception is a closed list of exact approved
     lines: a new "us" is a decision to make here, never something that arrives with a
     reworded paragraph. */
  const APPROVED = [
    'Write to us.',
    'We will get back to you.',
    'Tell us how we can help you.',
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
  assert.ok(!css.includes('#0F1523'), 'the invented card surface is gone');
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

/* The page must SUBMIT, not just render. A form that paints correctly and 400s on Send is
   not a form. It sends what the browser sends, and requires the lead to land and the mail to
   be queued. */
test('the form submits end to end: stored, and both mails queued', async () => {
  /* exactly what js/contact.js posts, plus the solved captcha the widget puts in the form */
  const body = await withCaptcha(base, formPayload());
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
  assert.equal(rec.phone, '+971 50 123 4567', 'the phone the visitor typed must reach the record, code first');
  /* the form no longer asks which half of BOASIS it is about, so the API still defaults the
     topic for the record's shape, and older links that send it keep working */
  assert.equal(rec.about, 'setup', 'the topic defaults, it is not invented per visitor');
  assert.ok(!/Not given|undefined/.test(JSON.stringify(rec)), 'no placeholder may be stored');
  // the receipt the client reviewed: a thank-you, where the message is now, and the
  // reply time they are owed
  const { contactToUser } = require('../lib/mail-templates');
  const receipt = contactToUser({ name: 'Amina', email: 'amina@spark.ae', message: 'Please call me back.' }).text;
  assert.match(receipt, /Thank you for writing to us, Amina\./, 'it thanks them by first name');
  assert.match(receipt, /within two business days\./, 'and gives the reply time');
  assert.ok(!/\s[-—–]\s/.test(receipt), 'no dash punctuation in a customer email');
});

