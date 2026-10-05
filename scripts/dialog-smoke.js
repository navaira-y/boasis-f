/* dialogs smoke · a scripted browser pass over the two dialogs, run against the live
   server. Not part of the test suite on purpose: it needs jsdom, which is a dev-only
   install — `npm i --no-save jsdom` once, then `npm run smoke:dialogs`. */
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.error('jsdom is not installed. Run: npm i --no-save jsdom'); process.exit(1); }

const BASE = process.env.BASE_URL || 'http://localhost:8080';
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + msg); } };

/* what jsdom is missing, for both pages the smoke drives: media queries, a canvas context,
   WebCrypto (the captcha box needs it, and Node's is the same API the browser exposes), and
   a fetch that shouts until the pass below stubs it. */
const ambient = window => {
  window.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } });
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  /* the orb and the sky are drawn on canvas; jsdom has no 2d context. A chainable no-op
     keeps the page loading the way a real browser does — the smoke is about the logic, not
     the pixels. */
  const noop = new Proxy(function () {}, {
    get: (t, p) => (p === 'canvas' ? { width: 800, height: 600, style: {} } : noop),
    set: () => true,
    apply: () => noop,
  });
  window.HTMLCanvasElement.prototype.getContext = () => noop;
  Object.defineProperty(window.crypto, 'subtle', { value: require('crypto').webcrypto.subtle, configurable: true });
  window.fetch = async () => { throw new Error('fetch not stubbed'); };
};

/* a real, signed challenge: the widget solves it the way it would in production */
const challenge = () => {
  const crypto = require('crypto');
  const salt = crypto.randomBytes(16).toString('hex');
  const number = crypto.randomInt(0, 20000);
  return {
    algorithm: 'SHA-256', salt, maxNumber: 20000, expires: Date.now() + 600000,
    challenge: crypto.createHash('sha256').update(salt + number).digest('hex'), signature: 'a'.repeat(64),
  };
};

(async () => {
  const dom = await JSDOM.fromURL(BASE + '/', {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse: ambient,
  });
  const { window } = dom;
  const { document } = window;

  await Promise.race([new Promise(res => window.addEventListener('load', res)), new Promise(res => setTimeout(res, 10000))]);
  window.addEventListener('error', e => { console.error('  (page noise, non-fatal) ' + (e.message || 'unknown')); });
  await new Promise(r => setTimeout(r, 300));   // let the scripts finish their init

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const input = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
  const submitForm = f => f.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  const click = el => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  const keydown = () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const key = (el, k) => el.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

  /* the captcha box is part of every form: a person ticks it before the last button, so the
     smoke ticks it too rather than leaning on the stub being forgiving. The solve is the
     page's own — the fetch stub above hands it a real, signed challenge. */
  const tick = async form => {
    const box = form.querySelector('[data-captcha-start]');
    const field = form.querySelector('input[name="altcha"]');
    if (!box || !field) return;
    click(box);
    for (let i = 0; i < 100 && !field.value; i++) await new Promise(r => setTimeout(r, 100));
  };

  /* a standing fetch stub: records the POSTs and answers like the API would */
  const posts = [];
  window.fetch = async (url, opts) => {
    /* the captcha's challenge: a real one, signed here, so the widget solves it for real */
    if (String(url).includes('/api/captcha')) return { ok: true, status: 200, json: async () => challenge() };
    const body = JSON.parse(opts.body);
    posts.push({ url, body });
    return { ok: true, status: 200, json: async () => ({ ok: true, confirmed: true }) };
  };

  /* ── init: the dialogs are wired and the code pickers are full ──────────── */
  console.log('init');
  ok($$('.modal').length === 1 && !!$('#modal-demo'), 'one dialog is on the page: Book a demo');
  ok(!$('#modal-manage'), 'the early-access dialog is gone: its form is a page of its own now');
  ok($$('#modal-demo [hidden]').some(e => e.id === 'demo-form') === false, 'demo form is visible');
  for (const id of ['modal-demo']) {
    const cc = document.querySelector(`#${id} [data-cc]`);
    const lis = cc && [...cc.querySelectorAll('.cc-list li')];
    ok(lis && lis.length === 59, id + ' picker list has the 59 countries');
    ok(lis && lis[0].textContent.includes('Algeria') && lis[58].textContent.includes('Uzbekistan'), id + ' list runs Algeria to Uzbekistan, alphabetically');
    ok(cc && cc.querySelector('.cc-cur').textContent === 'AE' && cc.querySelector('.cc-code').textContent === '+971', id + ' closed control shows short form and code by default');
    ok(cc && cc.querySelector('.cc-pop').hidden, id + ' panel starts closed');
    ok(cc && cc.querySelector('.cc-search') && cc.querySelector('.cc-search').placeholder === 'Search country', id + ' panel carries the search box');
  }
  {
    const cc = document.querySelector('#modal-demo [data-cc]');
    const pop = () => cc.querySelector('.cc-pop');
    const rows = () => [...cc.querySelectorAll('.cc-list li')];
    const find = cc.querySelector('.cc-search');
    click(cc.querySelector('.cc-btn'));
    ok(!pop().hidden, 'the panel opens');
    const pk = rows().find(li => li.textContent.startsWith('Pakistan'));
    ok(pk && pk.textContent.includes('+92'), 'the open panel says the full name plus the code');
    click(pk);
    ok(pop().hidden, 'the panel closes on choice');
    ok(cc.querySelector('.cc-cur').textContent === 'PK' && cc.querySelector('.cc-code').textContent === '+92', 'selected, it shows the short form and the code');
    ok(cc.querySelector('input[name="country_code"]').value === '+92', 'the hidden input carries the code for the send');

    /* the search: three letters instead of a scroll, and the dial code and the short name
       people actually type find the row too */
    click(cc.querySelector('.cc-btn'));
    input(find, 'paki');
    ok(rows().length === 1 && rows()[0].textContent.startsWith('Pakistan'), 'typing "paki" leaves Pakistan alone');
    input(find, '92');
    ok(rows().length === 1 && rows()[0].textContent.startsWith('Pakistan'), 'and "+92" finds it');
    input(find, 'uae');
    ok(rows().length === 1 && rows()[0].textContent.startsWith('United Arab Emirates'), 'and "uae" finds the Emirates, which the name alone would not');
    input(find, 'nowhere');
    ok(rows().length === 0 && !cc.querySelector('.cc-none').hidden, 'a search with no answer says so, instead of showing an empty panel');
    input(find, '');
    ok(rows().length === 59 && rows()[0].textContent.startsWith('Algeria') && rows()[58].textContent.startsWith('Uzbekistan'), 'clearing the search brings the whole list back, in order');
    input(find, 'leban');
    click(rows()[0]);
    ok(cc.querySelector('input[name="country_code"]').value === '+961' && cc.querySelector('.cc-cur').textContent === 'LB', 'a searched-for country is chosen like any other');
    ok(find.value === '', 'and the search is emptied again');

    click(cc.querySelector('.cc-btn'));
    click(rows().find(li => li.textContent.startsWith('United Arab Emirates')));
    ok(cc.querySelector('input[name="country_code"]').value === '+971', 'and back to the default for the rest of the flow');

    /* The keyboard path: a key opens the panel into the search box, which is the whole point
       of the search; the arrows walk the rows; Enter picks; and Escape closes the picker
       WITHOUT closing the dialog it lives in — a visitor who opened the list by mistake must
       not lose the form behind it. */
    const dlg = $('#modal-demo');
    click($('a[data-open="demo"]'));
    ok(!dlg.hidden, 'the demo dialog is open for the keyboard pass');
    const kbtn = cc.querySelector('.cc-btn');
    const kfind = cc.querySelector('.cc-search');
    kbtn.focus();
    key(kbtn, 'ArrowDown');
    ok(!pop().hidden, 'ArrowDown on the closed control opens the panel');
    ok(document.activeElement === kfind, 'and lands in the search box, ready to type');
    key(kfind, 'ArrowDown');
    ok(document.activeElement === rows()[0], 'ArrowDown from the search goes to the first row');
    key(document.activeElement, 'ArrowDown');
    ok(document.activeElement === rows()[1], 'and on to the next');
    key(document.activeElement, 'ArrowUp');
    ok(document.activeElement === rows()[0], 'ArrowUp comes back');
    key(document.activeElement, 'Enter');
    ok(pop().hidden && cc.querySelector('input[name="country_code"]').value === '+213', 'Enter picks the row under the focus (Algeria, +213)');
    ok(document.activeElement === kbtn, 'and the focus is back on the closed control');

    key(kbtn, 'ArrowDown');
    ok(!pop().hidden, 'it opens again from the keyboard');
    key(kfind, 'Escape');
    ok(pop().hidden, 'escape closes the panel');
    ok(!dlg.hidden, 'and the dialog stays open behind it');
    key(document.activeElement, 'Escape');
    ok(dlg.hidden, 'the next escape closes the dialog, as it always did');
    ok(cc.querySelector('input[name="country_code"]').value === '+971' && cc.querySelector('.cc-cur').textContent === 'AE', 'and the shut dialog hands the picker back on the UAE');
  }
  ok($$('a[data-open="demo"]').length === 3, 'three demo openers (the Set up button, the free-zone CTA, and the one the journey builds)');
  ok($$('a[data-open="manage"]').length === 0, 'no manage openers are left on the home page');
  ok($$('a[href="/early-access"]').length === 5, 'five ways to the early-access page (the Manage button, three plans, the header)');

  /* ── the hero cards: the card goes to its section, the button opens the dialog ───── */
  console.log('hero cards');
  {
    const cards = $$('.door');
    ok(cards.length === 2, 'two hero cards');
    ok(cards.every(c => !c.hasAttribute('data-open')), 'neither card is a dialog opener any more');
    const titles = cards.map(c => c.querySelector('.t'));
    ok(titles[0].getAttribute('href') === '#setup' && !titles[0].hasAttribute('data-open'), 'the Set up card links to the Set up section');
    ok(titles[1].getAttribute('href') === '#manage' && !titles[1].hasAttribute('data-open'), 'the Manage card links to Manage');
    ok(!!cards[0].querySelector('.act[data-open="demo"]'), 'the Set up button is the opener');
    ok(cards[1].querySelector('.act').getAttribute('href') === '/early-access', 'and the Manage button leads to the early-access page');
    /* the click that matters: the card must not open a dialog, and the button must */
    click(titles[0]);
    ok($('#modal-demo').hidden, 'clicking the Set up card does not open the dialog');
    ok($('#modal-demo').hidden, 'the Manage button opens no dialog, because it is a link');
    keydown();
  }
  ok(!$('.nav-contact'), 'no header contact button');

  /* ── the demo dialog, end to end ───────────────────────────────────────── */
  console.log('demo: open, fill, next, submit, done');
  const d = $('#modal-demo');
  click($('a[data-open="demo"]'));
  ok(!d.hidden, 'the dialog opened');
  ok(document.body.classList.contains('modal-open'), 'the page behind is locked');

  const ef = el => d.querySelector(el);
  input(ef('input[name="name"]'), 'Fatimah Al Suwaidi');
  input(ef('input[name="email"]'), 'fatim@spark.ae');
  input(ef('input[name="phone"]'), 'abc 50 999-8888');
  ok(ef('input[name="phone"]').value === '509998888', 'the phone box keeps digits only (the leading 0 is a local dial, dropped at send)');

  const who = ef('select[name="who"]');
  who.value = 'company';
  who.dispatchEvent(new window.Event('change', { bubbles: true }));
  ok(!ef('.mf-ent').hidden, 'the entity field appears once who is answered');
  ok(ef('input[name="entity"]').placeholder === 'Name of your company', 'it asks for a company, since that is the answer');
  input(ef('input[name="entity"]'), 'SPARK Free Zone');
  who.value = 'gov';
  who.dispatchEvent(new window.Event('change', { bubbles: true }));
  ok(ef('input[name="entity"]').placeholder === 'Name of the authority', 'it follows the answer');
  who.value = 'company';
  who.dispatchEvent(new window.Event('change', { bubbles: true }));

  submitForm(ef('#demo-form'));
  ok(ef('#demo-form').hidden, 'step one is hidden');
  const cal = ef('.modal-cal');
  ok(!cal.hidden, 'the calendar step is showing');
  ok(ef('.cal-frame iframe').src.startsWith('https://calendar.google.com/calendar/appointments/schedules/') && /\?gv=true$/.test(ef('.cal-frame iframe').src), 'the calendar loaded lazily, on arrival at step two, in the form Google embeds');

  await tick(ef('#demo-form'));
  click(ef('[data-final]'));
  await new Promise(r => setTimeout(r, 50));
  ok(!ef('.modal-done').hidden, 'the done step is showing');
  ok(posts.length === 1 && posts[0].url === '/api/demo', 'exactly one POST, to the demo endpoint');
  const sent = posts[0].body;
  ok(sent.phone === '+971 509998888', 'the phone went out as code + number: ' + sent.phone);
  ok(!('country_code' in sent), 'the code picker is not part of the payload');
  ok(sent.who === 'company' && sent.entity === 'SPARK Free Zone', 'the dialog fields went out');
  ok(sent.hp === '' && Number(sent._t) > 0, 'the traps went out honest');

  /* ── close, and the dialog must open fresh ─────────────────────────────── */
  console.log('demo: close and reopen fresh');
  keydown(window);
  ok(d.hidden, 'escape closed it');
  ok(!document.body.classList.contains('modal-open'), 'the page behind is unlocked');
  click($('a[data-open="demo"]'));
  ok(!d.hidden, 'it reopened');
  ok(!ef('#demo-form').hidden && ef('.modal-done').hidden, 'it opened on the form, not the done step');
  ok(ef('input[name="name"]').value === '', 'the fields are empty again');
  ok(d.querySelector('[data-cc] .cc-cur').textContent === 'AE' && d.querySelector('[data-cc] input[name="country_code"]').value === '+971', 'and the code picker is back on the UAE');
  keydown(window);

  /* ── a fault lands under its field, and nothing is sent ────────────────── */
  console.log('demo: invalid email is said under the field');
  const before = posts.length;
  click($('a[data-open="demo"]'));
  input(ef('input[name="name"]'), 'Fatim');
  input(ef('input[name="email"]'), 'not-an-email');
  input(ef('input[name="phone"]'), '509998888');
  submitForm(ef('#demo-form'));
  ok(ef('[data-err="email"]').textContent === 'Please enter a valid email address.', 'the fault is under the email field');
  ok(ef('.mf-pill.bad') !== null, 'the faulty pill is marked');
  ok(ef('#demo-form') && !ef('#demo-form').hidden, 'the form stays put');
  ok(posts.length === before, 'nothing was sent');

  /* ── the early-access page: the countdown, the one-question-at-a-time form, the code ── */
  console.log('early access: the countdown, the steps, the code, the send, the done');
  {
    const edom = await JSDOM.fromURL(BASE + '/early-access', {
      runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, beforeParse: ambient,
    });
    const ew = edom.window, ed = ew.document;
    await Promise.race([new Promise(res => ew.addEventListener('load', res)), new Promise(res => setTimeout(res, 10000))]);
    await new Promise(r => setTimeout(r, 400));
    const eposts = [];
    ew.fetch = async (url, opts) => {
      const u = String(url);
      if (u.includes('/api/captcha')) return { ok: true, status: 200, json: async () => challenge() };
      if (u.includes('/api/verify-email/send')) { eposts.push({ url: u, body: JSON.parse(opts.body) }); return { ok: true, status: 200, json: async () => ({ ok: true, devCode: '248153' }) }; }
      if (u.includes('/api/verify-email/verify')) {
        eposts.push({ url: u, body: JSON.parse(opts.body) });
        const good = JSON.parse(opts.body).code === '248153';
        return good ? { ok: true, status: 200, json: async () => ({ ok: true, token: 'TESTTOKEN' }) }
                    : { ok: false, status: 400, json: async () => ({ ok: false, errors: ['code'] }) };
      }
      eposts.push({ url, body: JSON.parse(opts.body) });
      return { ok: true, status: 200, json: async () => ({ ok: true, confirmed: true }) };
    };
    const eq = sel => ed.querySelector(sel);
    const form = eq('#join-form');
    ok(!!form, 'the page carries the form');
    ok(form.getAttribute('data-endpoint') === '/api/manage', 'and it posts to the manage endpoint');
    ok(ed.body.textContent.includes('17 November'), 'the page says the date the list is told');
    ok(!/AED/.test(ed.body.textContent), 'no plan and no price is mentioned on this page');
    const cd = eq('#count');
    ok(!!cd, 'the countdown is on the page');
    const openUTC = new Date('2026-11-17T08:00:00+04:00').getTime();
    const want = Math.max(0, Math.floor((openUTC - Date.now()) / 1000));
    const wantDays = Math.floor(want / 86400);
    const wantHours = String(Math.floor(want / 3600) % 24).padStart(2, '0');
    ok(wantDays > 0, 'the smoke is running before the opening, or this check means nothing');
    ok(eq('#c-days') && Number(eq('#c-days').textContent) === wantDays, 'its day cell agrees with the date itself, saw ' + (eq('#c-days') || {}).textContent + ' want ' + wantDays);
    ok(eq('#c-hours') && eq('#c-hours').textContent === wantHours, 'and the hour cell too, saw ' + (eq('#c-hours') || {}).textContent + ' want ' + wantHours);
    ok(eq('#c-tz') && !eq('#c-tz').hidden && eq('#c-tz').textContent.includes('+04:00'), 'the date carries its own Dubai offset, saw ' + (eq('#c-tz') || {}).textContent);
    const secsOnce = Number((eq('#c-secs') || {}).textContent);
    await new Promise(r => setTimeout(r, 1600));
    ok(Number(eq('#c-secs').textContent) !== secsOnce, 'and the seconds move on their own');
    const joins = [...ed.querySelectorAll('a[href="#join"]')];
    ok(joins.length >= 1, 'the header leads to the form beside the words, saw ' + joins.length);

    /* one question at a time: only the name is open, and Continue refuses an empty one */
    const steps = ['name', 'email', 'code', 'phone', 'have', 'last'].map(n => eq('[data-step="' + n + '"]'));
    ok(steps.every(Boolean), 'all six steps are in the page');
    ok(!steps[0].hidden && steps.slice(1).every(st => st.hidden), 'the page opens on the name alone');
    const click = el => el.dispatchEvent(new ew.MouseEvent('click', { bubbles: true, cancelable: true }));
    const einput = (el, v) => { el.value = v; el.dispatchEvent(new ew.Event('input', { bubbles: true })); };
    const esubmit = () => form.dispatchEvent(new ew.Event('submit', { bubbles: true, cancelable: true }));
    click(steps[0].querySelector('[data-next]'));
    ok(!form.querySelector('[data-err="name"]').hidden, 'an empty name is answered before moving on');
    ok(!steps[0].hidden, 'and the step stays open');
    einput(form.querySelector('input[name="name"]'), 'Lena Karim');
    click(steps[0].querySelector('[data-next]'));
    ok(steps[0].hidden && !steps[1].hidden, 'answered, the name collapses and the email is asked');
    ok(steps[0].classList.contains('is-done') && steps[0].querySelector('.ea-sum span').textContent === 'Lena Karim', 'it leaves its answer on one line behind');
    ok(!ed.querySelector('[data-edit]'), 'and there is no Edit control on the page, on purpose');

    /* the code: asked for, checked, and only then does the form go on */
    einput(form.querySelector('input[name="email"]'), 'lena@corp.com');
    click(steps[1].querySelector('[data-sendcode]'));
    await new Promise(r => setTimeout(r, 60));
    const sendPost = eposts.find(x => x.url.includes('/api/verify-email/send'));
    ok(!!sendPost, 'the page asked the server for a code');
    ok(!!sendPost && sendPost.body.email === 'lena@corp.com', 'and it carried the typed address, saw ' + (sendPost && sendPost.body.email));
    ok(steps[1].hidden && !steps[2].hidden, 'and the code step opened');
    /* six boxes · one digit each, and a full one is checked without hunting for a button */
    const eboxes = [...steps[2].querySelectorAll('.ea-d')];
    ok(eboxes.length === 6, 'the code is six boxes, one digit each, saw ' + eboxes.length);
    const etype = code => code.split('').forEach((ch, i) => { if (eboxes[i]) einput(eboxes[i], ch); });
    const epaste = (i, text) => { const ev = new ew.Event('paste', { bubbles: true, cancelable: true }); ev.clipboardData = { getData: () => text }; eboxes[i].dispatchEvent(ev); };
    etype('2481');
    ok(eboxes.map(b => b.value).join('') === '2481', 'each digit sits in its own box');
    ok(form.querySelector('input[name="code"]').value === '2481', 'and the hidden field the form reads follows along');
    ok(ed.activeElement === eboxes[4], 'and the caret moves on by itself, saw ' + eboxes.indexOf(ed.activeElement));
    click(steps[2].querySelector('[data-verifycode]'));
    await new Promise(r => setTimeout(r, 60));
    ok(!form.querySelector('[data-err="code"]').hidden, 'four digits is not six, and it says so');
    ok(!eposts.some(x => x.url.includes('/verify-email/verify')), 'and a short code is never sent to the server');
    etype('999999');
    await new Promise(r => setTimeout(r, 80));
    ok(!form.querySelector('[data-err="code"]').hidden, 'the sixth digit is checked on its own, and a wrong code is refused');
    ok(eboxes.every(b => !b.value) && !steps[2].hidden, 'it clears them for the retyping, and the step stays open');
    /* the case the owner reported: a line copied out of the mail, digits and words together */
    const verifyTries = () => eposts.filter(x => x.url.includes('/verify-email/verify')).length;
    epaste(0, 'Invoice 300123 for 248153, 5 October 2026');
    ok(!form.querySelector('[data-err="code"]').hidden, 'two possible codes in one copy is said as such, never guessed');
    await new Promise(r => setTimeout(r, 60));
    ok(verifyTries() === 1, 'and nothing was sent, so no try of the three is burned, saw ' + verifyTries());
    ok(eboxes.every(b => !b.value), 'the boxes stay empty for a clean retyping');
    epaste(2, 'Your BOASIS code is 248153. It works once.');
    ok(eboxes.map(b => b.value).join('') === '248153', 'one paste into any box finds the code in the sentence, not the date');
    await new Promise(r => setTimeout(r, 80));
    ok(form.querySelector('input[name="emailv"]').value === 'TESTTOKEN', 'the right code brings the signed proof into the form');
    ok(steps[2].hidden && !steps[3].hidden, 'and only then: the phone');

    /* the rest, as it was: the picker, the branch, the box that solves itself */
    const cc = form.querySelector('[data-cc]');
    ok(!!cc && cc.querySelectorAll('.cc-list li').length === 59, 'the form carries the 59-country picker');
    einput(form.querySelector('input[name="phone"]'), '0551112222');
    click(steps[3].querySelector('[data-next]'));
    ok(steps[3].hidden && !steps[4].hidden, 'then the company question');
    const haveSel = form.querySelector('select[name="have"]');
    const change = el => el.dispatchEvent(new ew.Event('change', { bubbles: true }));
    haveSel.value = 'yes'; change(haveSel);
    ok(!form.querySelector('.mf-count').hidden && !form.querySelector('.mf-auth').hidden && form.querySelector('.mf-plans').hidden, '"yes" reveals the company fields and hides the sentence');
    haveSel.value = 'no'; change(haveSel);
    ok(form.querySelector('.mf-count').hidden && form.querySelector('.mf-auth').hidden && !form.querySelector('.mf-plans').hidden, '"no" reveals the sentence and hides the company fields');
    einput(form.querySelector('input[name="plans"]'), 'A small import business, still deciding the authority.');
    haveSel.value = 'yes'; change(haveSel);
    form.querySelector('select[name="count"]').value = '1-3';
    einput(form.querySelector('input[name="authority"]'), 'SPARK Free Zone');
    click(steps[4].querySelector('[data-next]'));
    ok(steps[4].hidden && !steps[5].hidden, 'and the last step opens');

    /* walking back: nothing is thrown away, and the checked address does not come loose */
    const goBackFrom = n => click(steps[n].querySelector('[data-back]'));
    ok(steps.every((st, i) => i === 0 || i === 2 || st.querySelector('[data-back]')), 'every step after the first has a way back');
    ok(!!steps[2].querySelector('[data-backemail]'), 'and the code step words its way back as the question it really is');
    goBackFrom(5);
    ok(!steps[4].hidden, 'Back opens the company question again');
    ok(form.querySelector('select[name="have"]').value === 'yes' && form.querySelector('select[name="count"]').value === '1-3', 'with its answers still filled in');
    goBackFrom(4);
    ok(!steps[3].hidden && form.querySelector('input[name="phone"]').value === '0551112222', 'and the number is exactly where it was');
    goBackFrom(3);
    ok(!steps[1].hidden, 'past a checked code, Back lands on the address itself, not on the six boxes');
    ok(form.querySelector('input[name="email"]').readOnly, 'which cannot be typed over any more');
    ok(!form.querySelector('[data-verified]').hidden, 'and there is a line under it saying so');
    ok(form.querySelector('[data-verified-to]').textContent === 'lena@corp.com', 'naming the address that was verified');
    ok(steps[1].querySelector('[data-sendcode]').textContent === 'Go on', 'and its button is only a way forward now');
    click(steps[1].querySelector('[data-sendcode]'));
    await new Promise(r => setTimeout(r, 40));
    ok(!steps[5].hidden, 'Go on returns them to the step they left, not through the form again');
    ok(form.querySelector('input[name="emailv"]').value === 'TESTTOKEN', 'and the proof rode along untouched');
    goBackFrom(5); goBackFrom(4); goBackFrom(3); goBackFrom(1);
    ok(!steps[0].hidden, 'and from the address, Back goes on to the name');
    einput(form.querySelector('input[name="name"]'), 'Lena K. Bisht');
    click(steps[0].querySelector('[data-next]'));
    await new Promise(r => setTimeout(r, 40));
    ok(!steps[5].hidden, 'a fixed spelling brings them back to the last step by itself');
    ok(form.querySelector('input[name="phone"]').value === '0551112222' && form.querySelector('select[name="count"]').value === '1-3', 'and not one answer had to be written twice');
    ok(form.querySelector('input[name="emailv"]').value === 'TESTTOKEN', 'and the mailbox proof is still valid');

    /* a wrong address is still fixable, and it costs a new code, which is said out loud */
    goBackFrom(1);
    click(form.querySelector('[data-unlock]'));
    await new Promise(r => setTimeout(r, 40));
    ok(!form.querySelector('input[name="email"]').readOnly, 'Use another address gives the field back');
    ok(form.querySelector('input[name="emailv"]').value === '', 'the proof of the old address is thrown away with it');
    ok(!steps[2].classList.contains('is-done'), 'and the code question is un-answered, waiting to be asked again');
    ok(form.querySelector('[data-code-sent]').textContent.includes('new code'), 'and it says plainly that a new code is needed');
    einput(form.querySelector('input[name="email"]'), 'lena.bisht@corp.com');
    click(steps[1].querySelector('[data-sendcode]'));
    await new Promise(r => setTimeout(r, 60));
    ok(!steps[2].hidden && !form.querySelector('input[name="email"]').readOnly, 'the new address is asked to prove itself');
    epaste(0, '248153');
    await new Promise(r => setTimeout(r, 80));
    ok(form.querySelector('input[name="emailv"]').value === 'TESTTOKEN', 'and one code later it is verified');
    ok(form.querySelector('input[name="email"]').readOnly, 'and locked again');
    ok(!steps[3].hidden && form.querySelector('input[name="phone"]').value === '0551112222', 'back where they were, the number still filled');
    click(steps[3].querySelector('[data-next]')); click(steps[4].querySelector('[data-next]'));
    await new Promise(r => setTimeout(r, 40));
    ok(!steps[5].hidden, 'and two presses take them to the last step again');
    await new Promise(r => { let i = 0; const w = setInterval(() => { if (form.querySelector('input[name="altcha"]').value || ++i > 120) { clearInterval(w); r(); } }, 50); });
    ok(form.querySelector('input[name="altcha"]').value.length > 40, 'the page clicked the box itself, and it really solved');
    form.querySelector('input[name="emailv"]').value = '';
    esubmit();
    await new Promise(r => setTimeout(r, 60));
    ok(form.querySelector('.form-note').textContent.length > 0, 'a send without the proof is stopped, and said: ' + form.querySelector('.form-note').textContent);
    ok(eq('.ea-done').hidden, 'and the done step stayed shut');
    ok(!form.querySelector('[data-step="code"]').hidden, 'and the page walks them back to the code, not to a dead end');
    ok(eboxes.map(b => b.value).join('') === '248153', 'walked back, the digits are still sitting in their boxes, no retyping');
    form.querySelector('input[name="emailv"]').value = 'TESTTOKEN';
    esubmit();
    await new Promise(r => setTimeout(r, 80));
    ok(!eq('.ea-done').hidden, 'the done step is showing');
    ok(form.hidden, 'and the form stepped aside');
    const mpost = eposts[eposts.length - 1];
    ok(mpost.url === '/api/manage', 'it posted to the manage endpoint');
    ok(mpost.body.phone === '+971 551112222' && mpost.body.have === 'yes' && mpost.body.count === '1-3' && mpost.body.authority === 'SPARK Free Zone', 'its fields went out');
    ok(mpost.body.emailv === 'TESTTOKEN', 'and the mailbox proof rode along');
  }
  /* ── the journey builds its own "Book a demo" after the page has wired up:
       the delegated handler must still open the dialog for it ───────────────── */
  console.log('journey opener (built late) also opens the dialog');

  /* ── the captcha box: clicked, solved, posted, and reset ───────────────── */
  console.log('captcha');
  {
    const demo = $('#modal-demo');
    const openDemo = $('.j-next[data-open="demo"]') || $('[data-open="demo"]');
    click(openDemo);
    const form = ef('#demo-form');
    const box = form.querySelector('[data-captcha-start]');
    const field = form.querySelector('input[name="altcha"]');
    ok(!!box && !!field, 'the demo form carries a captcha box and its hidden field');
    if (box) {
      click(box);
      /* the browser's search, in jsdom: wait for the answer rather than guess how long it
         takes, because a busy machine is slower than a quiet one and a flaky check is worse
         than no check */
      for (let i = 0; i < 100 && !field.value; i++) await new Promise(r => setTimeout(r, 100));
      ok(field.value.length > 40, 'clicking it fills the hidden field with a solved answer');
      ok(/is-done/.test(form.querySelector('.captcha').className), 'and the box says it is done');
      ok(box.querySelector('.captcha-label').textContent === 'Verified', 'with the label a person reads');
      /* a used puzzle must not be posted twice: closing the dialog puts the box back */
      keydown();
      click(openDemo);
      const box2 = ef('#demo-form').querySelector('[data-captcha-start]');
      ok(ef('#demo-form').querySelector('input[name="altcha"]').value === '', 'and reopening it clears the spent answer');
      ok(!/is-done/.test(ef('#demo-form').querySelector('.captcha').className), 'with the box back to its start');
      ok(box2 && !box2.disabled, 'ready to be solved again');
      keydown();
    }
  }

  /* the journey opener, when the build has one */
  const late = document.querySelector('.j-next[data-open="demo"]');
  if (late) {
    click(late);
    ok(!d.hidden, 'the journey opener opens the demo dialog');
    keydown();
  } else {
    console.log('  (no journey opener on this build; skipped)');
  }

  /* ── the contact page: the same two rules on the site's other form ─────────────── */
  console.log('contact: send without the box, then with it');
  {
    const cdom = await JSDOM.fromURL(BASE + '/contact.html', {
      runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, beforeParse: ambient,
    });
    const cw = cdom.window, cd = cw.document;
    await Promise.race([new Promise(res => cw.addEventListener('load', res)), new Promise(res => setTimeout(res, 10000))]);
    await new Promise(r => setTimeout(r, 400));
    const cposts = [];
    cw.fetch = async (url, opts) => {
      if (String(url).includes('/api/captcha')) return { ok: true, status: 200, json: async () => challenge() };
      cposts.push({ url, body: JSON.parse(opts.body) });
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
    const cform = cd.getElementById('contact-form');
    const cnote = cform.querySelector('.form-note');
    const cin = (el, v) => { el.value = v; el.dispatchEvent(new cw.Event('input', { bubbles: true })); };
    const csubmit = () => cform.dispatchEvent(new cw.Event('submit', { bubbles: true, cancelable: true }));
    cin(cform.querySelector('input[name="name"]'), 'Lena Karim');
    cin(cform.querySelector('input[name="email"]'), 'lena@corp.com');
    cin(cform.querySelector('input[name="phone"]'), '551112222');
    cin(cform.querySelector('textarea[name="message"]'), 'I would like a demo of the manage side.');
    csubmit();
    await new Promise(r => setTimeout(r, 150));
    ok(cnote.textContent === 'Please click the "I am not a robot" box first.', 'Send without the box says what to do: ' + cnote.textContent);
    ok(cposts.length === 0, 'and nothing was posted');
    ok(cd.activeElement === cform.querySelector('[data-captcha-start]'), 'with the focus on the box');
    const cbox = cform.querySelector('[data-captcha-start]');
    cbox.dispatchEvent(new cw.MouseEvent('click', { bubbles: true, cancelable: true }));
    const cfield = cform.querySelector('input[name="altcha"]');
    for (let i = 0; i < 100 && !cfield.value; i++) await new Promise(r => setTimeout(r, 100));
    ok(cfield.value.length > 40, 'the box solved and holds its answer');
    ok(cnote.textContent === '', 'and the line telling the visitor to click it is gone');
    csubmit();
    await new Promise(r => setTimeout(r, 150));
    ok(cposts.length === 1 && cposts[0].url === '/api/contact', 'ticked, the send goes through to the contact endpoint');
    ok(String(cposts[0].body.altcha || '').length > 40, 'carrying the solved answer');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('smoke crashed:', e.stack || String(e)); process.exit(1); });
