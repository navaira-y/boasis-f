/* dialogs smoke · a scripted browser pass over the two dialogs, run against the live
   server. Not part of the test suite on purpose: it needs jsdom, which is a dev-only
   install — `npm i --no-save jsdom` once, then `npm run smoke:dialogs`. */
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.error('jsdom is not installed. Run: npm i --no-save jsdom'); process.exit(1); }

const BASE = process.env.BASE_URL || 'http://localhost:8080';
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + msg); } };

(async () => {
  const dom = await JSDOM.fromURL(BASE + '/', {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } });
      window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      /* the orb and the sky are drawn on canvas; jsdom has no 2d context. A chainable
         no-op keeps the page loading the way a real browser does — the smoke is about the
         dialog logic, not the pixels. */
      const noop = new Proxy(function () {}, {
        get: (t, p) => (p === 'canvas' ? { width: 800, height: 600, style: {} } : noop),
        set: () => true,
        apply: () => noop,
      });
      window.HTMLCanvasElement.prototype.getContext = () => noop;
      window.fetch = async () => {
        throw new Error('fetch not stubbed');
      };
    },
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

  /* a standing fetch stub: records the POSTs and answers like the API would */
  const posts = [];
  window.fetch = async (url, opts) => {
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
  }
  {
    const cc = document.querySelector('#modal-demo [data-cc]');
    click(cc.querySelector('.cc-btn'));
    ok(!cc.querySelector('.cc-list').hidden, 'the list opens');
    const pk = [...cc.querySelectorAll('.cc-list li')].find(li => li.textContent.startsWith('Pakistan'));
    ok(pk && pk.textContent.includes('+92'), 'the open list says the full name plus the code');
    click(pk);
    ok(cc.querySelector('.cc-list').hidden, 'the list closes on choice');
    ok(cc.querySelector('.cc-cur').textContent === 'PK' && cc.querySelector('.cc-code').textContent === '+92', 'selected, it shows the short form and the code');
    ok(cc.querySelector('input[name="country_code"]').value === '+92', 'the hidden input carries the code for the send');
    click(cc.querySelector('.cc-btn'));
    click([...cc.querySelectorAll('.cc-list li')].find(li => li.textContent.startsWith('United Arab Emirates')));
    ok(cc.querySelector('input[name="country_code"]').value === '+971', 'and back to the default for the rest of the flow');
  }
  ok($$('a[data-open="demo"]').length === 3, 'three demo openers (two static, one built by the journey)');
  ok($$('a[data-open="manage"]').length === 4, 'four manage openers (door, two plans, header button)');
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
  ok(ef('.cal-frame iframe').src === 'https://calendar.app.google/53BYnSPnwgk92XRv8', 'the calendar loaded lazily, on arrival at step two');

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
  const late = document.querySelector('.j-next[data-open="demo"]');
  if (late) {
    click(late);
    ok(!d.hidden, 'the journey opener opens the demo dialog');
    keydown();
  } else {
    console.log('  (no journey opener on this build; skipped)');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('smoke crashed:', e.message); process.exit(1); });
