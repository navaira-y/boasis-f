/* BOASIS · the early-access page's form.
   Same rules as lib/validate.js on the server and the same rules the dialog carried before
   it, so what this page accepts is exactly what the API accepts: no second, looser truth.
   The fields are the dialog's fields, one to one: name, email, phone, the company question,
   and then the branch that follows the answer. The captcha box is the site's own, and the
   note under it never mentions pictures. */

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

function joinForm() {
  const form = document.getElementById('join-form'); if (!form) return;
  const note = form.querySelector('.form-note');
  const stamp = form.querySelector('input[name="_t"]');
  const cc = form.querySelector('[data-cc]');
  const codeSel = form.querySelector('input[name="country_code"]');
  const picker = window.BoasisCountryPicker && cc ? window.BoasisCountryPicker.init(cc) : null;
  const fields = {};
  form.querySelectorAll('input[name], select[name]').forEach(el => {
    if (['hp', '_t', 'country_code'].includes(el.name)) return;
    fields[el.name] = el;
  });

  const say = (n, msg) => {
    const p = form.querySelector(`[data-err="${n}"]`);
    if (p) { p.textContent = msg || ''; p.hidden = !msg; }
    const f = fields[n]; if (f) { const pill = f.closest('.mf-pill'); if (pill) pill.classList.toggle('bad', !!msg); }
  };

  /* a field that is off the form is not judged: the company fields exist only when they have
     a company, and the sentence only when they don't */
  const fieldOff = n => {
    if (n === 'count' || n === 'authority') return !fields.have || fields.have.value !== 'yes';
    if (n === 'plans') return !fields.have || fields.have.value !== 'no';
    return false;
  };

  const rule = {
    name: v => (String(v || '').trim().length >= 2 ? '' : 'Name is required.'),
    email: v => { const e = String(v || '').trim(); return !e ? 'Email is required.' : (validEmail(e) ? '' : 'Please enter a valid email address.'); },
    phone: v => { const d = digits(v); return !d ? 'Phone number is required.' : (d.length >= 7 && d.length <= 15 ? '' : 'Please enter a valid phone number.'); },
    have: v => (v ? '' : 'Please answer: do you have a company?'),
    count: v => (v ? '' : 'Please choose how many.'),
    authority: v => (String(v || '').trim() ? '' : 'Please write the name of the authority.'),
    plans: v => (String(v || '').trim() ? '' : 'Describe it in a sentence — it helps us answer properly.'),
  };

  /* when they started: the server compares this with its own clock, so a submission that
     lands in under three seconds is a script, not a person */
  let opened = 0;
  const markOpen = () => { if (!opened) opened = Date.now(); };
  form.querySelectorAll('input, select, button').forEach(el => el.addEventListener('focus', markOpen, { once: true }));
  ['touchstart', 'pointerdown', 'keydown'].forEach(ev => form.addEventListener(ev, markOpen, { once: true, passive: true }));

  /* the branch the answer opens: a company that exists is counted and named, one that is
     still a thought is described in a sentence */
  if (fields.have) fields.have.addEventListener('change', () => {
    const v = fields.have.value;
    const show = (sel, on) => { const w = form.querySelector(sel); if (w) w.hidden = !on; };
    show('.mf-count', v === 'yes');
    show('.mf-auth', v === 'yes');
    show('.mf-plans', v === 'no');
    ['count', 'authority', 'plans'].forEach(n => { if (fieldOff(n)) say(n, ''); });
  });

  /* while they write: a field that is wrong about itself is told so at once, and a field
     that has righted itself goes quiet. An empty one waits for the send. */
  if (fields.email) fields.email.addEventListener('input', () => {
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

  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    markOpen();
    if (stamp) stamp.value = opened || Date.now();
    const data = Object.fromEntries(new FormData(form).entries());

    let firstBad = null;
    for (const n of Object.keys(fields)) {
      if (fieldOff(n)) { say(n, ''); continue; }
      const msg = rule[n] ? rule[n](data[n] || '') : '';
      say(n, msg);
      if (msg && !firstBad) firstBad = n;
    }
    if (firstBad) { fields[firstBad].focus(); note.textContent = ''; note.className = 'form-note'; return; }

    /* the number the owner reads: the code on the left, the number on the right, one string */
    data.phone = fullPhone(codeSel ? codeSel.value : '+971', data.phone) || data.phone;
    delete data.country_code;

    /* the box is part of the form, so a send without it says so here rather than posting
       something the server will refuse after the note has already said Sending */
    if (!String(data.altcha || '').trim()) {
      note.textContent = 'Please click the "I am not a robot" box first.';
      note.className = 'form-note err';
      const box = form.querySelector('[data-captcha-start]');
      if (box) box.focus();
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
      if (done) { done.hidden = false; done.querySelector('p').focus?.(); done.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }); }
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
joinForm(); reveal();
