/* BOASIS · the early-access page: its countdown, and its one-question-at-a-time form.
   The countdown reads its own time through Intl and Asia/Dubai, so a machine set to any
   timezone sees the same moment the UAE does; until the opening passes it counts, after it
   the words say so once and nothing ticks.

   The form asks in order — name, email, the six-digit code, phone, the company question,
   the box — because a question answered is a question nobody skims. The code is the new
   heart of it: lib/email-verify.js on the server mints it, the mailbox proves itself, and
   /api/manage refuses a signup whose address was never read. The rules on every field are
   still exactly lib/validate.js's rules: no second, looser truth. The captcha box is the
   site's own; this page clicks it for the visitor when the last step opens, and nothing
   here ever mentions pictures. */

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduce) document.documentElement.classList.add('reduce');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const validEmail = v => {
  const e = String(v == null ? '' : v).trim().toLowerCase();
  return !!e && e.length <= 254 && EMAIL_RE.test(e) && !/\.{2,}/.test(e);
};
const digits = v => String(v == null ? '' : v).replace(/\D/g, '');
/* the NANP has no trunk prefix to drop; everywhere else a home-dialed number starts with 0 */
const NO_TRUNK = new Set(['+1']);
const fullPhone = (code, number) => {
  let d = digits(number); if (!d) return '';
  if (!NO_TRUNK.has(code)) d = d.replace(/^0+(?=\d)/, '');
  return code + ' ' + d;
};

/* the countdown · the one date the page makes a promise about, and the only arithmetic
   it does. 08:00 on 17 November 2026, in Dubai's clock whatever the machine's is set to:
   the hour the UAE reads is taken from Intl, and the difference between that clock and
   the machine's own is the one correction applied. Dubai keeps no summer time, so +04:00
   is always the answer; taking it from Intl rather than hard-coding it keeps the promise
   true even if that ever changes. */
function countdown() {
  const vals = { days: document.getElementById('c-days'), hours: document.getElementById('c-hours'), mins: document.getElementById('c-mins'), secs: document.getElementById('c-secs') };
  if (!vals.days) return;
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const dubaiParts = () => { const p = {}; for (const x of fmt.formatToParts(new Date())) p[x.type] = x.value; return p; };
  const pad = n => String(n).padStart(2, '0');
  /* what the wall clock in Dubai reads, minus the same instant read as UTC, is the offset;
     the machine clock corrected by it is the Dubai clock, and that is what we count against */
  const dubaiShift = () => {
    const p = dubaiParts();
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Date.now();
  };
  const open = Date.UTC(2026, 10, 17, 8, 0, 0); /* 08:00 in Dubai, held as its UTC reading */
  const tz = document.getElementById('c-tz');
  if (tz) {
    const off = Math.round(dubaiShift() / 60000);
    tz.textContent = ' ' + (off < 0 ? '-' : '+') + pad(Math.floor(Math.abs(off) / 60)) + ':' + pad(Math.abs(off) % 60) + ' Dubai time';
    tz.hidden = false;
  }
  const tick = () => {
    const real = open - (Date.now() + dubaiShift());
    if (real <= 0) {
      const box = document.getElementById('count');
      if (box) box.innerHTML = '<p class="ea-opens ea-open-now">Manage is open.</p>';
      return true;
    }
    const sec = Math.floor(real / 1000);
    vals.days.textContent = Math.floor(sec / 86400);
    vals.hours.textContent = pad(Math.floor(sec / 3600) % 24);
    vals.mins.textContent = pad(Math.floor(sec / 60) % 60);
    vals.secs.textContent = pad(sec % 60);
    return false;
  };
  /* tick once a second; when the moment passes, say so once and stop */
  if (!tick()) {
    const t = setInterval(() => { if (tick()) clearInterval(t); }, 1000);
  }
}

function joinForm() {
  const form = document.getElementById('join-form'); if (!form) return;
  const note = form.querySelector('.form-note');
  const stamp = form.querySelector('input[name="_t"]');
  const cc = form.querySelector('[data-cc]');
  const codeSel = form.querySelector('input[name="country_code"]');
  const picker = window.BoasisCountryPicker && cc ? window.BoasisCountryPicker.init(cc) : null;
  const fields = {};
  form.querySelectorAll('input[name], select[name]').forEach(el => {
    if (['hp', '_t', 'country_code', 'emailv'].includes(el.name)) return;
    fields[el.name] = el;
  });

  const say = (n, msg) => {
    const p = form.querySelector(`[data-err="${n}"]`);
    if (p) { p.textContent = msg || ''; p.hidden = !msg; }
    const f = fields[n]; if (f) { const pill = f.closest('.mf-pill'); if (pill) pill.classList.toggle('bad', !!msg); }
  };

  const rule = {
    name: v => (String(v || '').trim().length >= 2 ? '' : 'Name is required.'),
    email: v => { const e = String(v || '').trim(); return !e ? 'Email is required.' : (validEmail(e) ? '' : 'Please enter a valid email address.'); },
    phone: v => { const d = digits(v); return !d ? 'Phone number is required.' : (d.length >= 7 && d.length <= 15 ? '' : 'Please enter a valid phone number.'); },
    have: v => (v ? '' : 'Please answer: do you have a company?'),
    count: v => (v ? '' : 'Please choose how many.'),
    authority: v => (String(v || '').trim() ? '' : 'Please write the name of the authority.'),
    plans: v => (String(v || '').trim() ? '' : 'Write a sentence about it. It helps us answer properly.'),
    code: v => (/^\d{6}$/.test(String(v || '').trim()) ? '' : 'The code is six digits.'),
  };
  const STEP_FIELDS = { 0: ['name'], 1: ['email'], 2: ['code'], 3: ['phone'], 4: ['have', 'count', 'authority', 'plans'] };

  /* when they started: the server compares this with its own clock, so a submission that
     lands in under three seconds is a script, not a person */
  let opened = 0;
  const markOpen = () => { if (!opened) opened = Date.now(); };
  form.querySelectorAll('input, select, button').forEach(el => el.addEventListener('focus', markOpen, { once: true }));
  ['touchstart', 'pointerdown', 'keydown'].forEach(ev => form.addEventListener(ev, markOpen, { once: true, passive: true }));

  /* ── the steps ────────────────────────────────────────────────────────────────
     A step that is answered collapses to one line, plain. The field underneath never
     disappears from the form, so a scriptless browser still sees the whole thing, and so
     does the browser's autofill. */
  const stepEls = ['name', 'email', 'code', 'phone', 'have', 'last']
    .map(n => form.querySelector(`[data-step="${n}"]`)).filter(Boolean);
  const pips = [...document.querySelectorAll('.ea-pips i')];
  let cur = 0;
  let furthest = 0;                       /* how far they have got: Back goes back, and Continue comes forward to here, not through everything again */
  const summarise = step => {
    const name = step.getAttribute('data-step');
    if (name === 'name') return fields.name ? fields.name.value.trim() : '';
    if (name === 'email') return fields.email ? fields.email.value.trim() : '';
    if (name === 'code') return 'Email verified';
    if (name === 'phone') {
      const p = fields.phone ? fields.phone.value.trim() : '';
      return (codeSel ? codeSel.value + ' ' : '') + p;
    }
    if (name === 'have') {
      const v = fields.have ? fields.have.value : '';
      if (v === 'yes') return 'A company' + (fields.count && fields.count.value ? ' · ' + fields.count.value : '');
      if (v === 'no') return 'Still deciding';
      return '';
    }
    return '';
  };
  const stepDone = (step, on) => {
    if (!step) return;
    const q = step.querySelector('.ea-q'), go = step.querySelector('.ea-go'), sum = step.querySelector('.ea-sum');
    if (q) q.hidden = on; if (go) go.hidden = on;
    if (sum) { sum.hidden = !on; const sv = sum.querySelector('[data-sum]'); if (sv && on) sv.textContent = summarise(step); }
    step.classList.toggle('is-done', on);
  };
  const paint = () => pips.forEach((p, i) => p.classList.toggle('on', i <= cur));
  /* whether a step's answer is still worth its place: an answered question that has not
     gone stale is not shown again on the way forward */
  function answerGood(k) {
    if (k === stepEls.indexOf(codeStep)) return !!(tokenField && String(tokenField.value || '').trim());
    const names = STEP_FIELDS[k] || [];
    if (!names.length) return false;              /* the last step is the box and Join, it is never "answered" until it is sent */
    for (const n of names) {
      const f = fields[n]; if (!f) continue;
      const branchOff = (n === 'count' || n === 'authority') && fields.have && fields.have.value !== 'yes';
      const plansOff = n === 'plans' && fields.have && fields.have.value !== 'no';
      if (branchOff || plansOff) continue;
      if (rule[n] && rule[n](f.value)) return false;
    }
    return true;
  }
  /* the next question to face: after a fix further back, this is where they were standing,
     not every step in between. Nothing is skipped that has gone stale or invalid. */
  function nextOpen(i) {
    for (let k = i + 1; k <= furthest && k < stepEls.length; k += 1) if (!answerGood(k)) return k;
    return Math.min(Math.max(furthest, i + 1), stepEls.length - 1);
  }
  function checkStep(i) {
    const names = STEP_FIELDS[i] || [];
    let firstBad = null;
    for (const n of names) {
      const f = fields[n]; if (!f) continue;
      const branchOff = (n === 'count' || n === 'authority') && fields.have && fields.have.value !== 'yes';
      const plansOff = n === 'plans' && fields.have && fields.have.value !== 'no';
      if (branchOff || plansOff) { say(n, ''); continue; }
      const msg = rule[n] ? rule[n](f.value) : '';
      say(n, msg);
      if (msg && !firstBad) firstBad = n;
    }
    if (firstBad) fields[firstBad].focus();
    return !firstBad;
  }
  /* the box: clicked for the visitor when the last step opens, once per page */
  let boxClicks = 0;
  function autoBox() {
    const btn = form.querySelector('[data-captcha-start]');
    if (!btn || boxClicks >= 2 || btn.disabled) return;
    const wrapEl = form.querySelector('[data-captcha]');
    if (wrapEl && wrapEl.classList.contains('is-done')) return;
    boxClicks += 1;
    btn.click();
  }
  function openStep(i) {
    stepEls.forEach((el, k) => { el.hidden = k !== i; });
    furthest = Math.max(furthest, i);
    paint();
    const el = stepEls[i]; if (!el) return;
    const f = el.querySelector('input:not([type=hidden]), select'); if (f) f.focus({ preventScroll: true });
    /* the last step's box solves itself while they read the question: the contract — a
       click, a puzzle, a tick — is untouched, the visitor just never waits on it */
    if (el.getAttribute('data-step') === 'last') autoBox();
    paintVerified();
    const panel = form.closest('.ea-panel');
    if (panel && window.innerWidth < 900 && typeof panel.scrollIntoView === 'function') panel.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }

  /* ── going back · and the one answer that cannot change afterwards ──────────
     A person who spots a typo in their name should fix it and be sent straight back to
     where they were, with every other answer still on the screen. The email address is
     the exception, and it has to be: the code they checked belongs to that address, and
     the token the server gave back is only ever valid for it. So once the code matches,
     the address is read only, the line under it says so in plain words, and changing it
     is a deliberate act that costs a new code. */
  let mailLocked = false;
  const verifiedLine = form.querySelector('[data-verified]');
  const verifiedHost = verifiedLine ? verifiedLine.closest('.ea-step') : null;
  /* shown only while the question it speaks about is the one on screen: a fact about an
     answer already given has no business sitting above the question being answered now */
  function paintVerified() {
    if (!verifiedLine) return;
    const here = verifiedHost && stepEls[cur] === verifiedHost && !verifiedHost.classList.contains('is-done');
    verifiedLine.hidden = !(mailLocked && here);
  }
  const sendBtnEarly = form.querySelector('[data-sendcode]');
  function lockMail(on) {
    mailLocked = on;
    if (fields.email) {
      fields.email.readOnly = on;
      fields.email.setAttribute('aria-readonly', on ? 'true' : 'false');
    }
    if (on && verifiedLine) {
      const to = verifiedLine.querySelector('[data-verified-to]');
      if (to && fields.email) to.textContent = fields.email.value.trim();
    }
    if (sendBtnEarly) sendBtnEarly.textContent = on ? 'Go on' : 'Send the code';
    paintVerified();
  }
  function goBack(i) {
    const codeIdx = stepEls.findIndex(el => el.getAttribute('data-step') === 'code');
    let k = i - 1;
    /* the code question has nothing to correct once it is checked, so Back walks past it
       to the address itself, which is where a wrong address would be fixed */
    if (mailLocked && k === codeIdx) k -= 1;
    if (k < 0) k = 0;
    stepDone(stepEls[i], false);
    stepDone(stepEls[k], false);
    cur = k;
    openStep(k);
    if (k === 0 && fields.name) fields.name.select();
  }

  if (stepEls.length) {
    stepEls.forEach((el, i) => { if (i) el.hidden = true; stepDone(el, false); });
    stepEls.forEach(el => {
      /* the answered line, and nothing to click: the owner asked for the Edit link gone.
         The one way back that stays is the code step's "Wrong address?", because an
         unreadable inbox needs a real exit. */
      const sum = document.createElement('p');
      sum.className = 'ea-sum'; sum.hidden = true;
      const sv = document.createElement('span'); sv.setAttribute('data-sum', '');
      sum.appendChild(sv);
      el.appendChild(sum);
    });
    stepEls.forEach((el, i) => {
      /* Back first, and on its own terms: the email step has no Continue, the last step has
         no Continue either, and an early return for the missing one must not cost a person
         their way back */
      const bk = el.querySelector('[data-back]');
      if (bk) bk.addEventListener('click', () => goBack(i));
      const b = el.querySelector('[data-next]'); if (!b) return;
      b.addEventListener('click', () => {
        if (!checkStep(i)) return;
        stepDone(el, true);
        cur = nextOpen(i);
        openStep(cur);
      });
    });
  }
  if (stepEls.length) openStep(0);   /* after every helper above exists — openStep reaches for all of them */

  /* the company answer opens its own branch, right there under the question: a company
     that exists is counted and named; one that is still a thought is described */
  if (fields.have) fields.have.addEventListener('change', () => {
    const v = fields.have.value;
    const show = (sel, on) => { const w = form.querySelector(sel); if (w) w.hidden = !on; };
    show('.mf-count', v === 'yes');
    show('.mf-auth', v === 'yes');
    show('.mf-plans', v === 'no');
    ['count', 'authority', 'plans'].forEach(n => { if (!v || (v === 'yes' ? n === 'plans' : n !== 'plans')) say(n, ''); });
  });

  /* while they write: a field that is wrong about itself is told so at once, and a field
     that has righted itself goes quiet. An empty one waits for Continue. */
  if (fields.email) fields.email.addEventListener('input', () => {
    /* a token is the address it was issued for: an edit below the lock line makes an old
       proof worse than none, so it goes, and the code question opens again underneath */
    if (tokenField && tokenField.value && !mailLocked) {
      tokenField.value = '';
      if (codeStep) stepDone(codeStep, false);
    }
    const e = fields.email.value.trim();
    say('email', e && !validEmail(e) ? 'Please enter a valid email address.' : '');
  });
  if (fields.phone) fields.phone.addEventListener('input', () => {
    const raw = fields.phone.value, clean = digits(raw);
    if (clean !== raw) fields.phone.value = clean;
    say('phone', clean && (clean.length < 7 || clean.length > 15) ? 'Please enter a valid phone number.' : '');
  });
  if (fields.name) fields.name.addEventListener('input', () => { if (!rule.name(fields.name.value)) say('name', ''); });
  if (fields.authority) fields.authority.addEventListener('input', () => { if (!rule.authority(fields.authority.value)) say('authority', ''); });
  if (fields.plans) fields.plans.addEventListener('input', () => { if (!rule.plans(fields.plans.value)) say('plans', ''); });
  /* ── the six boxes · one digit each ────────────────────────────────────────
     A code read off a screen is typed in pieces, so a digit lost in the wrong box used to
     mean "that is not the code" and a retype. Here a paste, or the browser's own code
     autofill, lands in whichever box the visitor is looking at and spreads itself. The
     hidden input named `code` is what the form and the check read, kept in step on every
     change. A full six is checked on its own, so nobody has to find the button. */
  const codeWrap = form.querySelector('[data-code]');
  const boxes = codeWrap ? [...codeWrap.querySelectorAll('.ea-d')] : [];
  const codeField = form.querySelector('input[name="code"]');
  const codeValue = () => boxes.length ? boxes.map(b => b.value).join('') : (codeField ? codeField.value : '');
  let verifying = false;
  const syncCode = () => {
    if (codeField) codeField.value = codeValue();
    boxes.forEach(b => b.classList.toggle('filled', !!b.value));
    if (codeWrap && codeValue().length === 6) codeWrap.classList.remove('bad');
  };
  const clearCode = () => {
    boxes.forEach(b => { b.value = ''; });
    if (codeField) codeField.value = '';
    if (codeWrap) codeWrap.classList.remove('bad');
    if (boxes[0]) boxes[0].focus();
  };
  function distribute(text, start) {
    const ds = digits(text).slice(0, 6);
    if (!ds.length) return;
    /* six digits in one go is the whole code, whoever it landed on; fewer is a start */
    const from = ds.length === 6 ? 0 : start;
    boxes.forEach((bx, k) => { bx.value = (k >= from && k - from < ds.length) ? ds[k - from] : ''; });
    syncCode();
    const last = Math.min(boxes.length - 1, from + ds.length - 1);
    if (boxes[last]) boxes[last].focus();
  }
  const checkCodeNow = () => { if (!verifying && codeValue().length === 6) checkCode(); };

  boxes.forEach((b, i) => {
    b.addEventListener('input', () => {
      const v = digits(b.value);
      if (v.length > 1) distribute(v, i);
      else { b.value = v; if (v && boxes[i + 1]) boxes[i + 1].focus(); }
      syncCode();
      if (v) say('code', '');
      checkCodeNow();
    });
    b.addEventListener('paste', e => {
      const cd = e.clipboardData || window.clipboardData;
      const text = cd && cd.getData ? cd.getData('text') : '';
      if (!digits(text)) return;                 /* a letter pasted here is their business */
      e.preventDefault();                        /* maxlength would otherwise keep one digit and the rest vanishes */
      /* This is the whole reason the field used to say "that is not the code" for a code
         people had copied correctly: mail clients select a line, a subject, a date, and any
         digits that came along first used to be taken as the code. So the code is read as the
         one run of six that stands out, and if the clipboard leaves that unclear, it is said
         plainly instead of a wrong check burning one of the three tries. */
      const sixes = [...new Set(text.match(/\d{6}/g) || [])];
      if (sixes.length === 1) distribute(sixes[0], i);
      else if (digits(text).length === 6) distribute(text, i);
      else {
        say('code', sixes.length > 1
          ? 'That has more than one 6 digit number in it. Copy only the code.'
          : 'That is not a 6 digit code. Copy the digits themselves, not the whole mail.');
        if (codeWrap) codeWrap.classList.add('bad');
        return;
      }
      checkCodeNow();
    });
    b.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !b.value && i) { const prev = boxes[i - 1]; prev.value = ''; prev.focus(); syncCode(); e.preventDefault(); }
      else if (e.key === 'ArrowLeft' && i) { boxes[i - 1].focus(); e.preventDefault(); }
      else if (e.key === 'ArrowRight' && i < boxes.length - 1) { boxes[i + 1].focus(); e.preventDefault(); }
      else if (e.key === 'Enter') { e.preventDefault(); checkCode(); }
    });
  });

  /* ── the code · sent, counted down, checked ───────────────────────────────
     The messages are ours, not the server's: the API answers with words like too-soon
     and attempts, and none of them should reach a visitor's eyes untranslated. */
  const sentLine = form.querySelector('[data-code-sent]');
  const emailStep = form.querySelector('[data-step="email"]');
  const codeStep = form.querySelector('[data-step="code"]');
  const sendBtn = form.querySelector('[data-sendcode]');
  const verifyBtn = form.querySelector('[data-verifycode]');
  const resendBtn = form.querySelector('[data-resend]');
  const backBtn = form.querySelector('[data-backemail]');
  const tokenField = form.querySelector('input[name="emailv"]');
  let timer = null;

  const sayCode = msg => { if (sentLine) { sentLine.textContent = msg || ''; sentLine.hidden = !msg; } };
  const startCountdown = (secs = 60) => {
    if (timer) clearInterval(timer);
    if (!resendBtn) return;
    let left = secs;
    resendBtn.disabled = true;
    const label = () => { resendBtn.textContent = left > 0 ? 'Send another · ' + left + 's' : 'Send another'; };
    label();
    timer = setInterval(() => { left -= 1; label(); if (left <= 0) { clearInterval(timer); timer = null; resendBtn.disabled = false; } }, 1000);
  };
  async function requestCode(btn) {
    markOpen();
    if (fields.email && rule.email(fields.email.value)) { say('email', rule.email(fields.email.value)); fields.email.focus(); return; }
    const was = btn.textContent;
    btn.disabled = true; btn.textContent = 'Sending';
    let j = null;
    try {
      const r = await fetch('/api/verify-email/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: (fields.email ? fields.email.value.trim() : ''), _t: opened || Date.now() }),
      });
      j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.ok) {
        btn.disabled = false; btn.textContent = was;
        sayCode(j && j.errors && j.errors[0] === 'too-soon' && j.retryIn
          ? 'A code is already on its way. You can ask for another in ' + j.retryIn + ' seconds.'
          : 'That did not send. Please try once more, or write to support@boasis.ae.');
        return;
      }
    } catch (e) {
      btn.disabled = false; btn.textContent = was;
      sayCode('That did not send. Check the connection and try once more.');
      return;
    }
    btn.disabled = false; btn.textContent = was;
    clearCode();
    say('code', ''); sayCode('');
    if (codeStep) {
      const shown = codeStep.querySelector('[data-shown-email]');
      if (shown) shown.textContent = fields.email.value.trim();
    }
    stepDone(emailStep, true);
    cur = Math.max(cur, stepEls.indexOf(codeStep));
    openStep(stepEls.indexOf(codeStep));
    startCountdown();
    /* only a box that is really not sending anything shows its code on screen — the page
       asks the visitor to read their mail everywhere the mail is real */
    if (j.devCode) sayCode('Nothing is being sent right now, so here it is: ' + j.devCode);
  }
  if (sendBtn) sendBtn.addEventListener('click', () => {
    if (mailLocked) { stepDone(emailStep, true); cur = nextOpen(stepEls.indexOf(emailStep)); openStep(cur); return; }
    requestCode(sendBtn);
  });
  if (resendBtn) resendBtn.addEventListener('click', () => requestCode(resendBtn));
  if (backBtn) backBtn.addEventListener('click', () => {
    lockMail(false);
    if (tokenField) tokenField.value = '';
    if (codeStep) stepDone(codeStep, false);
    stepDone(emailStep, false);
    cur = stepEls.indexOf(emailStep);
    openStep(cur);
  });
  async function checkCode() {
    if (verifying) return;
    const short = rule.code(codeValue());
    if (short) {
      say('code', short);
      if (codeWrap) codeWrap.classList.add('bad');
      if (boxes[0]) boxes[0].focus();
      return;
    }
    verifying = true;
    const was = verifyBtn ? verifyBtn.textContent : '';
    if (verifyBtn) { verifyBtn.disabled = true; verifyBtn.textContent = 'Checking'; }
    let j = null;
    try {
      const r = await fetch('/api/verify-email/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: (fields.email ? fields.email.value.trim() : ''), code: codeValue() }),
      });
      j = await r.json().catch(() => null);
    } catch (e) { j = null; }
    verifying = false;
    if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.textContent = was; }
    if (!j || !j.ok) {
      const why = j && j.errors ? j.errors[0] : '';
      say('code', why === 'attempts'
        ? 'Too many tries with that code. Ask for a new one.'
        : why === 'none' ? 'That code has expired. Ask for a new one.'
        : 'That is not the code. Three tries, then a new one is needed.');
      if (codeWrap) codeWrap.classList.add('bad');
      clearCode();
      sayCode('');
      return;
    }
    if (tokenField) tokenField.value = j.token || '';
    if (timer) { clearInterval(timer); timer = null; }
    lockMail(true);
    stepDone(codeStep, true);
    cur = nextOpen(stepEls.indexOf(codeStep));
    openStep(cur);
  }
  if (verifyBtn) verifyBtn.addEventListener('click', () => checkCode());

  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    markOpen();
    if (stamp) stamp.value = opened || Date.now();
    const data = Object.fromEntries(new FormData(form).entries());

    let firstBad = null;
    for (const n of Object.keys(fields)) {
      if (n === 'code') continue;          /* judged by the code step itself; it is not part of the signup */
      const branchOff = (n === 'count' || n === 'authority') && fields.have && fields.have.value !== 'yes';
      const plansOff = n === 'plans' && fields.have && fields.have.value !== 'no';
      if (branchOff || plansOff) { say(n, ''); continue; }
      const msg = rule[n] ? rule[n](data[n] || '') : '';
      say(n, msg);
      if (msg && !firstBad) firstBad = n;
    }
    if (firstBad) {
      const i = stepEls.findIndex(el => el.contains(fields[firstBad]));
      if (i >= 0) { cur = i; openStep(i); }
      fields[firstBad].focus(); note.textContent = ''; note.className = 'form-note'; return;
    }

    /* the number the owner reads: the code on the left, the number on the right, one string */
    data.phone = fullPhone(codeSel ? codeSel.value : '+971', data.phone) || data.phone;
    delete data.country_code;
    delete data.code;                       /* the typed code is never stored; its proof is the token */

    /* the box is part of the form: a send without it still says so here rather than posting
       something the server will refuse after the note has already said Sending */
    if (!String(data.altcha || '').trim()) {
      note.textContent = 'Please click the "I am not a robot" box first.';
      note.className = 'form-note err';
      const boxBtn = form.querySelector('[data-captcha-start]');
      if (boxBtn) boxBtn.focus();
      return;
    }

    /* the mailbox proof, held to the same rule the server holds it: no token, no post.
       The visitor is put back at the code — everything typed stays where it is. */
    if (tokenField && !String(tokenField.value || '').trim()) {
      note.textContent = 'We need the code at your email before this can go through.';
      note.className = 'form-note err';
      if (codeStep) { stepDone(codeStep, false); if (emailStep) stepDone(emailStep, false); cur = stepEls.indexOf(codeStep); openStep(cur); }
      return;
    }

    note.textContent = 'Sending';
    note.className = 'form-note';
    try {
      const r = await fetch(form.dataset.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) {
        if ((j.errors || []).includes('emailv')) {
          /* the token is for the address in the body; if it ran out, the honest way back is
             the email question, not a shrug — everything typed stays where it is */
          note.textContent = 'The email check has run out. Please check the code again from there.';
          note.className = 'form-note err';
          if (tokenField) tokenField.value = '';
          if (codeStep) { stepDone(codeStep, false); if (emailStep) stepDone(emailStep, false); cur = stepEls.indexOf(codeStep); openStep(cur); }
          return;
        }
        const names = { name: 'your name', email: 'your email address', phone: 'your phone number', have: 'the company question', count: 'how many companies', authority: 'the authority name', plans: 'a sentence about the company', captcha: 'the verification box' };
        const e = (j.errors || []).filter(x => names[x]);
        e.forEach(x => say(x, 'Please check ' + names[x] + '.'));
        const tooMany = (j.errors || []).includes('too-many');
        note.textContent = tooMany
          ? 'That is a few too many in a row. Please wait a minute, then press Join again. Your answers are still here.'
          : (e.length ? 'Please check the fields marked above.' : 'Please try again, or write to support@boasis.ae.');
        note.className = 'form-note err';
        if ((j.errors || []).includes('captcha') && window.BoasisCaptcha) window.BoasisCaptcha.reset(form);
        return;
      }
      /* done · the form steps aside, and the page says what happens next in the same words
         the dialog used */
      form.hidden = true;
      const done = document.querySelector('.ea-done');
      if (done) { done.hidden = false; done.querySelector('p').focus?.(); if (typeof done.scrollIntoView === 'function') done.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }); }
      if (window.BoasisCaptcha) window.BoasisCaptcha.reset(form);
    } catch (e) {
      note.textContent = 'That did not send. Please try again, or write to support@boasis.ae.';
      note.className = 'form-note err';
    }
  });
}

/* the sections arrive the way the cards do on the site, and never move on their own */
function reveal() {
  const els = [...document.querySelectorAll('.reveal')]; if (!els.length) return;
  if (reduce || !('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .15 });
  els.forEach((el, i) => { el.style.transitionDelay = (i % 3) * 90 + 'ms'; io.observe(el); });
}

const y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();
countdown(); joinForm(); reveal();
