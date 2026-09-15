/* BOASIS · the contact form.
   Same rules as the waiting list on the home page, on purpose: a stamp of when the visitor
   started (a script posts too fast to have read the page), a honeypot no human can see, and a
   line that answers. One file for one form, so nothing here can reach into the home page. */

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduce) document.documentElement.classList.add('reduce');

function contactForm() {
  const form = document.getElementById('contact-form'); if (!form) return;
  const note = form.querySelector('.form-note');
  const stamp = form.querySelector('input[name="_t"]');
  const clear = () => form.querySelectorAll('.bad').forEach(f => f.classList.remove('bad'));

  /* when they started. the server compares this with its own clock, so it cannot be faked
     into "I filled this in instantly" by a clock on the visitor's machine being wrong. */
  let opened = 0;
  const markOpen = () => { if (!opened) opened = Date.now(); };
  form.querySelectorAll('input, select, textarea, button').forEach(el => el.addEventListener('focus', markOpen, { once: true }));
  ['touchstart', 'pointerdown', 'keydown'].forEach(ev => form.addEventListener(ev, markOpen, { once: true, passive: true }));

  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    markOpen();
    clear();
    if (stamp) stamp.value = opened || Date.now();
    const data = Object.fromEntries(new FormData(form).entries());
    const bad = [];
    if (String(data.name || '').trim().length < 2) bad.push('name');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(data.email || '').trim())) bad.push('email');
    // presence, not shape: the API takes any sane phone string, and a strict pattern here
    // would reject numbers people actually type (+971, 050, spaces, brackets)
    const phone = String(data.phone || '').trim();
    if (phone.replace(/[^\d]/g, '').length < 7) bad.push('phone');
    if (bad.length) {
      // the pill is what gets the flag, so the whole group lights up rather than one edge
      bad.forEach(n => { const i = form.querySelector(`[name="${n}"]`); const f = i && i.closest('.ct-fields'); if (f) f.classList.add('bad'); });
      (form.querySelector('.ct-fields.bad input') || form.querySelector('input[name="name"]')).focus();
      note.textContent = 'Please fill in your name, email and phone number.';
      note.className = 'form-note err';
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
        // name and email are checked here already, so only a rule we cannot predict reaches
        // the visitor. Anything unknown is named plainly rather than dropped, and the address
        // below is the fallback that never depends on the API being happy.
        const labels = { message: 'a short message', phone: 'your phone number', organisation: 'your company name' };
        const e = (j.errors || []).filter(x => !['name', 'email'].includes(x));
        note.textContent = e.length
          ? 'Please add ' + e.map(x => labels[x] || x).join(' and ') + '.'
          : 'Please try again, or write to support@boasis.ae.';
        note.className = 'form-note err';
        return;
      }
      form.reset(); opened = 0;
      if (stamp) stamp.value = '';
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

/* arriving from the site with ?i=setup or ?i=manage: the picker already answers it, so nobody
   has to read the form twice to find the control. Unknown values leave the default alone. */
function prefillFromLink() {
  const form = document.getElementById('contact-form'); if (!form) return;
  const want = new URLSearchParams(location.search).get('i');
  if (want !== 'setup' && want !== 'manage') return;   // anything else leaves the default alone
  const input = [...form.querySelectorAll('input[name="about"]')].find(i => i.value === want);
  if (input) input.checked = true;
}

const y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();
contactForm(); prefillFromLink(); reveal();
