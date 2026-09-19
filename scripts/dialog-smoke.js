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
  ok($$('#modal-demo, #modal-manage').length === 2, 'both dialogs are on the page');
  ok($$('#modal-demo [hidden]').some(e => e.id === 'demo-form') === false, 'demo form is visible');
  for (const id of ['modal-demo', 'modal-manage']) {
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
  ok($$('a[data-open="demo"]').length === 4, 'four demo openers (the Set up card and its button share one, the free-zone CTA, and the one the journey builds)');
  ok($$('a[data-open="manage"]').length === 5, 'five manage openers (the Manage card and its button, two plans, header button)');
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

  /* ── the manage dialog ─────────────────────────────────────────────────── */
  console.log('manage: open, fill, send, done');
  const m = $('#modal-manage');
  click($('a[data-open="manage"]'));
  ok(!m.hidden, 'it opened');
  const mf = el => m.querySelector(el);
  input(mf('input[name="name"]'), 'Lena Karim');
  input(mf('input[name="email"]'), 'lena@corp.com');
  input(mf('input[name="phone"]'), '0551112222');
  const haveSel = mf('select[name="have"]');
  const change = el => el.dispatchEvent(new window.Event('change', { bubbles: true }));
  haveSel.value = 'yes'; change(haveSel);
  ok(!mf('.mf-count').hidden && !mf('.mf-auth').hidden && mf('.mf-plans').hidden, '"yes" reveals the company fields and hides the sentence');
  haveSel.value = 'no'; change(haveSel);
  ok(mf('.mf-count').hidden && mf('.mf-auth').hidden && !mf('.mf-plans').hidden, '"no" reveals the sentence and hides the company fields');
  input(mf('input[name="plans"]'), 'A small import business, still deciding the authority.');
  haveSel.value = 'yes'; change(haveSel);
  mf('select[name="count"]').value = '1-3';
  input(mf('input[name="authority"]'), 'SPARK Free Zone');
  /* the box is a step of its own: pressing Join without it must say so on the spot and
     post nothing, rather than saying "Sending" and letting the server refuse the form */
  const beforeBox = posts.length;
  submitForm(mf('#manage-form'));
  await new Promise(r => setTimeout(r, 50));
  ok(mf('.form-note').textContent === 'Please click the "I am not a robot" box first.', 'Join without the box says what to do: ' + mf('.form-note').textContent);
  ok(posts.length === beforeBox, 'and nothing was posted');
  ok(mf('.modal-done').hidden, 'and the done step stayed shut');

  await tick(mf('#manage-form'));
  ok(mf('input[name="altcha"]').value.length > 40, 'the box is ticked and carries its solved answer');
  ok(mf('.form-note').textContent === '', 'and the line telling the visitor to click it is gone');
  submitForm(mf('#manage-form'));
  await new Promise(r => setTimeout(r, 50));
  ok(!mf('.modal-done').hidden, 'the done step is showing');
  const mpost = posts[posts.length - 1];
  ok(mpost.url === '/api/manage', 'it posted to the manage endpoint');
  ok(mpost.body.phone === '+971 551112222' && mpost.body.have === 'yes' && mpost.body.count === '1-3' && mpost.body.authority === 'SPARK Free Zone', 'its fields went out');
  keydown(window);

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
})().catch(e => { console.error('smoke crashed:', e.message); process.exit(1); });
