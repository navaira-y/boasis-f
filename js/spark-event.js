/* The Sharjah Next page · boasis.ae/spark-event
 *
 * This is the design file the event team handed over, with its own script block lifted out of the
 * page and into this file, because every page on this site is served under a policy that forbids
 * inline script. Nothing about the look, the copy, the translations or the phone pill changed.
 *
 * What changed is what the button does. The design shipped with its send switch off, so the form
 * posted nothing and Mira was a placeholder address. Here the four fields go to the same door the AI
 * Everything page uses, with one extra field that says which entrance this is:
 *
 *   POST <project>/functions/v1/create-pass   { first+last as full_name, email, phone,
 *                                               country_code, consent, source, page, _t, hp }
 *
 * The door mints a pass, starts the person's row in public.spark_event_leads, and answers with the
 * pass and the Brain's address. The page then puts that pass in the link and lets Mira open, which
 * is the whole "add the mira" step: from that moment the Brain saves every step to the same row, and
 * a person who closes the tab and comes back picks up where they stopped.
 *
 * The page navigates rather than framing the Brain, because that is what the design does
 * (it redirects a moment after the button, and "Talk to Mira" is the fallback), and a stand's tablet
 * or phone wants the full screen, not a window inside a page.
 */
(function () {
  'use strict';

  /* ── the three addresses, the only values a deploy ever has to know ─────────
     endpoint  what turns the four fields into a pass and starts the record. The same create-pass
               /try-mira posts to; `page` below is what puts the row in the event table.
     brainUrl  where Mira lives. BRAIN_URL on the function and SPARK_BRAIN_URL on the server answer
               the same question and win when set, so this is the fallback, not the authority.
     source    what lands in the row's `source` column: which offer they came for. */
  var CFG = window.SPARK_EVENT = {
    endpoint: 'https://grsbhupjihwvidxbkymu.supabase.co/functions/v1/create-pass',
    brainUrl: 'https://brain.boasis.ae',
    source: 'sharjah-next-2026',
    page: 'spark-event'
  };

  /* ── the strings, exactly as the design wrote them ───────────────────────── */
  const T = {
    en: {
      hello: "Hi. I'm Mira. A few details, and we start.",
      first: 'First name', last: 'Last name', email: 'Email', mobile: 'Mobile number',
      consent: 'I agree that SPARK and Boasis may contact me about my project.',
      cta: 'Start with Mira',
      doneH: 'Mira is ready for you', doneP: "If she didn't open automatically, tap below.", open: 'Talk to Mira',
      offEy: 'Sharjah Next offer · 28 & 29 Oct', offH: 'Your SPARK company, at the event price',
      y1: 'year 1', y2: 'from, year 1',
      b1: '1 activity', b2: '1 shareholder', b3: 'Free lease',
      p1: 'Up to 3 activities', p2: 'Up to 3 shareholders', p3: 'Visa options',
      secL: 'For these 5 sectors', s1: 'Sustainability', s2: 'Advanced Manufacturing', s3: 'Mobility & Logistics', s4: 'Healthcare', s5: 'AI & Digital Transformation',
      howEy: 'How it works',
      st1: 'Tell Mira what you do', st1s: 'In your own words, typed or spoken.',
      st2: 'Choose your activities', st2s: 'Mira suggests them. Your package shows on top.',
      st3: 'Get your reference number', st3s: 'On screen, and by email.',
      st4: 'Finish in Zone 2, Block B', st4s: 'Show your reference, apply and pay. Follow the green signs.',
      today: '<b>Open on 28 and 29 October only.</b> Complete your payment in Zone 2 before you leave.',
      sig: 'Powered by',
      eFirst: 'Please enter your first name.', eLast: 'Please enter your last name.', eEmail: 'Please enter a valid email.',
      ePhone: 'Please enter a valid number.', eConsent: 'Please tick the box to continue.',
      /* the two sentences the design could not need because its form posted nowhere */
      eBusy: 'The stand is busy for a moment. Try once more in a few seconds.',
      eFail: 'That could not be opened just now. Tap below, or tell someone at the stand and they will open Mira for you.',
      eGone: 'Your visit has closed. Fill the details once more and Mira opens again.'
    }
  };
  const root = document.documentElement;
  function L() { return root.lang === 'en' ? 'en' : 'fr' }
  function t(k) { return T[L()][k] || T.en[k] || '' }
  function paint() {
    document.querySelectorAll('[data-k]').forEach(el => { el.innerHTML = t(el.dataset.k) });
    document.querySelectorAll('[data-err]').forEach(el => { if (el.dataset.ek) el.textContent = t(el.dataset.ek) });
  }

  const form = document.getElementById('snForm'), F = form.elements;
  const btn = form.querySelector('.cta');
  const note = form.querySelector('[data-note]');
  const endpoint = (form.dataset.endpoint || CFG.endpoint || '').trim();

  function setErr(k, ek) {
    const e = form.querySelector('[data-err="' + k + '"]');
    if (!e) return;
    e.dataset.ek = ek || '';
    e.textContent = ek ? t(ek) : '';
  }
  function say(msg) { if (note) note.textContent = msg || ''; }

  function valid() {
    let ok = true;
    ['first_name', 'last_name', 'email', 'phone', 'consent'].forEach(k => setErr(k, ''));
    if (!F['first_name'].value.trim()) { setErr('first_name', 'eFirst'); ok = false }
    if (!F['last_name'].value.trim()) { setErr('last_name', 'eLast'); ok = false }
    if (!/^\S+@\S+\.\S+$/.test(F['email'].value.trim())) { setErr('email', 'eEmail'); ok = false }
    if (F['phone'].value.replace(/\D/g, '').length < 6) { setErr('phone', 'ePhone'); ok = false }
    if (!F['consent'].checked) { setErr('consent', 'eConsent'); ok = false }
    if (!ok) {
      const first = form.querySelector('.err:not(:empty)');
      if (first && first.scrollIntoView) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return ok;
  }
  /* on a phone, the keyboard's "next" moves to the next field instead of pressing the button */
  ['first_name', 'last_name', 'email'].forEach((k, i, a) => F[k].addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); (i < a.length - 1 ? F[a[i + 1]] : F['phone']).focus() }
  }));

  /* ── the pass, and what a person does with it ───────────────────────────────
     The pass is the whole credential: it is what Mira needs to know whose journey this is, and what
     get-lead needs to hand the record back. Nothing else is put in the address. */
  const LS = 'boasis.spark-event.v1';
  const DAY = 24 * 60 * 60 * 1000;
  const PASS_RE = /^PASS[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;
  function remember(pass, brain) {
    try { localStorage.setItem(LS, JSON.stringify({ pass, brain, at: Date.now() })); }
    catch (e) { /* private mode: the form is just there when they come back */ }
  }
  function forget() { try { localStorage.removeItem(LS); } catch (e) {} }
  function remembered() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { return null }
    if (!s || !PASS_RE.test(String(s.pass || '')) || Date.now() - Number(s.at || 0) > DAY) { forget(); return null }
    return s;
  }
  /* where Mira lives. Only http(s) is accepted, whatever the door answered or whatever an older visit
     left in localStorage, because this string ends up in a link a person taps and in location.href:
     a host that is not ours, or a scheme that is not a page, must never be handed a pass. */
  function safeBrain(v) {
    const s = String(v || '').trim();
    return /^https?:\/\/[^\s"'<>]+$/.test(s) ? s.replace(/\/+$/, '') : '';
  }
  function miraHref(pass, brain) {
    const base = safeBrain(brain) || safeBrain(CFG.brainUrl);
    if (!base || !pass) return '';
    return base + (base.indexOf('?') < 0 ? '?' : '&') + 'pass=' + encodeURIComponent(pass);
  }

  /* one row per person, so one receipt: the door marks the pass and refuses a second, whatever this
     page does. Fired with keepalive because the page is about to navigate to Mira. */
  function receipt(pass) {
    if (!pass) return;
    try {
      fetch('/api/spark-thanks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pass }), keepalive: true,
      }).catch(() => {});
    } catch (e) { /* no mail is better than a stuck button */ }
  }

  function ready(pass, brain, navigate) {
    const url = miraHref(pass, brain);
    const link = document.getElementById('miraLink');
    if (link) link.href = url || '#';
    document.getElementById('formView').style.display = 'none';
    document.getElementById('doneView').classList.add('on');
    const card = document.getElementById('start');
    if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (navigate && url) setTimeout(() => { location.href = url }, 900);   /* the design's own beat */
  }

  /* came back, or re-scanned, or closed the tab: their pass is still theirs, so Mira opens rather
     than the form. get-lead has the last word, because a pass that expired is not a visit. */
  (function returning() {
    const s = remembered();
    if (!s) return;
    const check = endpoint.replace(/create-pass[^/]*$/, 'get-lead') + '?pass=' + encodeURIComponent(s.pass);
    ready(s.pass, s.brain, true);
    if (!/supabase\./.test(endpoint)) return;
    fetch(check).then(r => r.json().catch(() => null)).then(j => {
      if (!j || j.ok !== false) return;
      forget();
      document.getElementById('doneView').classList.remove('on');
      document.getElementById('formView').style.display = '';
      say(t('eGone'));
    }).catch(() => { /* no answer is not a reason to lose their place */ });
  })();

  let busy = false;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    say('');
    if (F['hp'].value) return;                 /* a bot filled the field no person can see */
    if (!valid()) return;
    if (!endpoint) { say('The demo is not open on this page yet. Please tell someone at the stand.'); return; }
    if (busy) return;
    busy = true;
    if (btn) btn.disabled = true;
    document.activeElement && document.activeElement.blur();

    const data = Object.fromEntries(new FormData(form));
    delete data.hp;
    data.full_name = ((F['first_name'].value || '') + ' ' + (F['last_name'].value || '')).replace(/\s+/g, ' ').trim();
    data.source = CFG.source;
    data.page = CFG.page;                      /* which table the row goes into */
    data._t = Math.max(1, Date.now() - opened);  /* the door decides if that is a person */

    let j = null;
    try {
      const r = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      });
      j = await r.json().catch(() => null);
    } catch (err) { j = null; }

    busy = false;
    if (btn) btn.disabled = false;

    const pass = j && j.ok !== false ? String(j.pass || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) : '';
    if (!pass) { say(j && j.error === 'limited' ? t('eBusy') : t('eFail')); return; }

    const brain = safeBrain(j && j.brain_url) || safeBrain(CFG.brainUrl);
    if (!brain) { say('Your pass is ready but Mira is not open yet. Please tell someone at the stand.'); return; }

    remember(pass, brain);
    receipt(pass);
    ready(pass, brain, true);
  }, { passive: false });

  const opened = Date.now();
  root.lang = 'en';
  paint();
})();
