/* BOASIS · the contact form.
   Same rules as the waiting list on the home page, on purpose: a stamp of when the visitor
   started (a script posts too fast to have read the page), a honeypot no human can see, and
   a line that answers. One file for one form, so nothing here can reach into the home page.

   Every field answers as it is written, not only when the button is pressed: the email and
   the phone are checked on every keystroke, and the fault lands under the field that
   carries it. The phone is two controls, one number: the code the visitor picks on the
   left, the number typed on the right, and the owner reads them as one string. */

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduce) document.documentElement.classList.add('reduce');

/* the same rules as lib/validate.js on the server, so what the page accepts is exactly what
   the API accepts: no second, looser truth the visitor can learn by trial and error. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const validEmail = v => {
  const e = String(v == null ? '' : v).trim().toLowerCase();
  return !!e && e.length <= 254 && EMAIL_RE.test(e) && !/\.{2,}/.test(e);
};
const digits = v => String(v == null ? '' : v).replace(/\D/g, '');
/* the NANP has no trunk prefix to drop; everywhere else a number dialed at home starts with 0,
   and that 0 is a local dialing digit, not part of the international number */
const NO_TRUNK = new Set(['+1']);
const fullPhone = (code, number) => {
  let d = digits(number); if (!d) return '';
  if (!NO_TRUNK.has(code)) d = d.replace(/^0+(?=\d)/, '');
  return code + ' ' + d;
};

function contactForm() {
  const form = document.getElementById('contact-form'); if (!form) return;
  const note = form.querySelector('.form-note');
  const stamp = form.querySelector('input[name="_t"]');
  const code = () => { const s = form.querySelector('select[name="country_code"]'); return s && s.value ? s.value : '+971'; };
  const input = {
    name: form.querySelector('input[name="name"]'),
    email: form.querySelector('input[name="email"]'),
    phone: form.querySelector('input[name="phone"]'),
    message: form.querySelector('textarea[name="message"]'),
  };
  const slot = n => form.querySelector(`[data-err="${n}"]`);
  const say = (n, msg) => {
    const p = slot(n);
    if (p) { p.textContent = msg || ''; p.hidden = !msg; }
    const f = input[n]; if (f) { const pill = f.closest('.ct-fields'); if (pill) pill.classList.toggle('bad', !!msg); }
  };

  /* the four checks, shared by the keystroke and the send, so the two can never disagree */
  const rule = {
    name: v => (String(v || '').trim().length >= 2 ? '' : 'Name is required.'),
    email: v => { const e = String(v || '').trim(); return !e ? 'Email is required.' : (validEmail(e) ? '' : 'Please enter a valid email address.'); },
    phone: v => { const d = digits(v); return !d ? 'Phone number is required.' : (d.length >= 7 && d.length <= 15 ? '' : 'Please enter a valid phone number.'); },
    message: v => (String(v || '').trim().length >= 4 ? '' : 'Message is required.'),
  };

  /* when they started. the server compares this with its own clock, so it cannot be faked
     into "I filled this in instantly" by a clock on the visitor's machine being wrong. */
  let opened = 0;
  const markOpen = () => { if (!opened) opened = Date.now(); };
  form.querySelectorAll('input, select, textarea, button').forEach(el => el.addEventListener('focus', markOpen, { once: true }));
  ['touchstart', 'pointerdown', 'keydown'].forEach(ev => form.addEventListener(ev, markOpen, { once: true, passive: true }));

  /* while they write: a field that is wrong about itself is told so at once, and a field
     that has righted itself goes quiet. An empty field stays quiet until the send, when
     "required" is the honest thing to say. */
  input.email.addEventListener('input', () => {
    const e = input.email.value.trim();
    say('email', e && !validEmail(e) ? 'Please enter a valid email address.' : '');
  });
  input.phone.addEventListener('input', () => {
    const raw = input.phone.value;
    const clean = digits(raw);
    if (clean !== raw) input.phone.value = clean;   // the box holds the number, and the code lives in the picker: nothing else belongs in it
    say('phone', clean && (clean.length < 7 || clean.length > 15) ? 'Please enter a valid phone number.' : '');
  });
  input.name.addEventListener('input', () => { if (!rule.name(input.name.value)) say('name', ''); });
  input.message.addEventListener('input', () => { if (!rule.message(input.message.value)) say('message', ''); });

  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    markOpen();
    if (stamp) stamp.value = opened || Date.now();
    const data = Object.fromEntries(new FormData(form).entries());

    /* every field is judged at the send, and its fault is printed under it, in the order a
       person fills the form, so the first error is also the first thing they have to fix */
    let firstBad = null;
    for (const n of ['name', 'email', 'phone', 'message']) {
      const msg = rule[n](data[n] || '');
      say(n, msg);
      if (msg && !firstBad) firstBad = n;
    }
    if (firstBad) {
      input[firstBad].focus();
      note.textContent = '';
      note.className = 'form-note';
      return;
    }

    /* the number the owner reads: the code on the left, the number on the right, one string */
    data.phone = fullPhone(code(), data.phone) || data.phone;

    note.textContent = 'Sending';
    note.className = 'form-note';
    try {
      const r = await fetch(form.dataset.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) {
        /* every rule the page already enforces is the server's, so only an unexpected name
           reaches the visitor here. Known names land under their field; anything unknown is
           named plainly rather than dropped, and the address below is the fallback that
           never depends on the API being happy. */
        const names = { name: 'your name', email: 'your email address', phone: 'your phone number', message: 'a short message' };
        const e = (j.errors || []).filter(x => names[x]);
        e.forEach(x => say(x, 'Please check ' + names[x] + '.'));
        note.textContent = e.length
          ? 'Please check the fields marked above.'
          : 'Please try again, or write to support@boasis.ae.';
        note.className = 'form-note err';
        return;
      }
      form.reset(); opened = 0;
      if (stamp) stamp.value = '';
      for (const n of ['name', 'email', 'phone', 'message']) say(n, '');
      note.textContent = 'Thank you. Your enquiry has been sent, and a confirmation is on its way to your inbox.';
      note.className = 'form-note ok';
    } catch (e) {
      note.textContent = 'That did not send. Please try again, or write to support@boasis.ae.';
      note.className = 'form-note err';
    }
  });
}

/* the heading types itself, the way the wish does on the home page: one span per character,
   punctuation given room to breathe, and a teal cursor that blinks then leaves. The pauses are
   copied from js/site.js rather than invented, so the two pages type at the same speed. */
function typeHeading() {
  const el = document.getElementById('ct-wish'); if (!el) return null;
  /* The file already holds the heading as plain text, so a browser without this script reads
     it normally. We only take it apart once we are sure we are running. */
  const text = el.dataset.text || el.textContent;
  const chars = [];
  for (const ch of text) {
    const s = document.createElement('span'); s.className = 'c'; s.textContent = ch;
    chars.push(s);
  }
  const cur = document.createElement('i'); cur.className = 'cursor';

  const build = () => {
    el.textContent = '';
    chars.forEach(c => { c.classList.remove('on'); el.appendChild(c); });
    el.appendChild(cur);
  };
  if (reduce) { build(); chars.forEach(c => c.classList.add('on')); el.classList.add('done'); return null; }
  build();

  /* One character every ~55ms, with a real stop at the full stop. The wish on the home page is
     faster because it types 130 characters; this one is 13, so at the wish's speed the whole
     line finished in under two frames and read as a static heading with a cursor stuck on it.
     Same shape, a speed a person can actually watch. */
  const due = []; let t = 250;                       // a beat before the first letter
  chars.forEach(c => { const ch = c.textContent; t += ch === '.' ? 260 : ch === ',' ? 170 : ch === ' ' ? 90 : 55; due.push(t); });
  const total = due[due.length - 1] || 0;
  let raf = 0;

  /* the cursor floats after the last letter you can read, exactly as .wish .cursor does, so the
     line never shifts sideways as it types */
  const place = n => {
    const last = chars[n - 1]; if (!last) { cur.style.transform = 'translate(0px, 0px)'; return; }
    const h = cur.offsetHeight || 2;
    cur.style.transform = `translate(${last.offsetLeft + last.offsetWidth + 3}px, ${last.offsetTop + (last.offsetHeight - h) / 2}px)`;
  };

  const play = () => {
    if (raf) cancelAnimationFrame(raf);
    el.classList.remove('done'); el.classList.add('typing');
    chars.forEach(c => c.classList.remove('on'));
    place(0);
    const start = performance.now();
    const tick = () => {
      const now = performance.now() - start; let n = 0;
      chars.forEach((c, i) => { if (due[i] <= now) { c.classList.add('on'); n++; } });
      place(n);
      if (n >= chars.length) { el.classList.remove('typing'); el.classList.add('done'); raf = 0; return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  };

  /* It starts on load, and again when the visitor arrives: a tab coming back to the
     foreground, and a back/forward restore, which is loaded from cache and never re-runs a
     script. Clamped so a quickly flicked tab cannot stack runs. */
  let last = 0;
  const playThrottled = () => { const n = Date.now(); if (n - last < total + 300) return; last = n; play(); };
  play();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) playThrottled(); });
  window.addEventListener('pageshow', e => { if (e.persisted) playThrottled(); });
  return playThrottled;
}

const replayHeading = typeHeading();

/* the lines under the form arrive the way the cards do on the site, and never move on their own */
function reveal() {
  const els = [...document.querySelectorAll('.reveal')]; if (!els.length) return;
  if (reduce || !('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .15 });
  els.forEach((el, i) => { el.style.transitionDelay = (i % 3) * 90 + 'ms'; io.observe(el); });
}

const y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();
contactForm(); reveal();
