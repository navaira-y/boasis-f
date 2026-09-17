/* BOASIS site · 12 September 2026
   intro    · the wish, Mira at work, the turn, the promise, the two doors. one screen at a time, driven by the scroll.
   setup    · the journey in six steps (click a step, nothing pinned), the real SPARK Brain screen for each;
              one line of light lights the free zone and the setup company that could be next.
   smooth   · Lenis glides the wheel; in-page links land below the header; touch and reduced motion stay native.
   tabs     · the header lights the section you are in, and the sky behind the page moves its light to match.
   waitlist · name, email and plan (Standard or Enterprise), posted to /api/waitlist; the plan buttons preselect the plan.
   manage   · the real portal film swings in flat and plays while on screen.
   reveals  · devices, monitors and cards arrive from a visible resting state; the dial draws itself once. */

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduce) document.documentElement.classList.add('reduce');

/* smooth scroll · Lenis turns each wheel notch into a glide (the guide's settings: 1.2 s, fast start and a long tail).
   Touch scrolling stays native. Nothing runs for people who ask for less motion. In-page links glide and land below the header. */
let lenis = null;
function smooth() {
  if (reduce || typeof Lenis === 'undefined') return;
  lenis = new Lenis({ duration: 1.2, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true, syncTouch: false, wheelMultiplier: 1, autoRaf: true });
  document.addEventListener('click', e => {
    /* an opener is not an anchor: a hero door's title keeps href="#setup" for a browser with
       no script, and with one it opens the dialog, so it must not also glide the page */
    const a = e.target.closest('a[href^="#"]'); if (!a || a.hasAttribute('data-open')) return;
    const id = a.getAttribute('href'), el = id === '#top' ? 0 : (id.length > 1 ? document.querySelector(id) : null);
    if (el === null) return;
    e.preventDefault();
    const target = el === 0 ? 0 : el.getBoundingClientRect().top + scrollY - (parseFloat(getComputedStyle(el).scrollMarginTop) || 40);
    const far = Math.abs(target - scrollY);
    // links glide with an ease-out that lands, not the wheel's long exponential tail (which crept for a second at the end)
    lenis.scrollTo(target, { duration: Math.min(1.7, 0.8 + far / 8000), easing: t => 1 - Math.pow(1 - t, 3) });
  });
}

/* the intro · one screen at a time
   the first screen says who we are and gives the two ways in: still, the same on every visit.
   on the first scroll it rises away and the orb comes up to meet the wish, which types as you arrive.
   the parts Mira reads are lit as they are typed; then the wish goes up and out and the orb settles beside her words.
   Mira works in a fixed place - once there the orb and its status never move or resize, only the words change.
   Yes, that's possible now. BOASIS did it. Then Set up. */
function intro() {
  const sec = document.querySelector('[data-intro]'); if (!sec) return;
  const hello = document.getElementById('hello');
  const wishEl = document.getElementById('wish'), mira = document.getElementById('mira');
  const sayEl = document.getElementById('mira-line'), status = document.getElementById('status'), statusText = document.getElementById('status-text');
  const LINES = JSON.parse(document.getElementById('mira-lines').textContent);
  const turn = document.getElementById('turn');
  const turnWords = [...turn.querySelectorAll('h2 .w')];
  const orbBox = mira.querySelector('.mira-orb');
  const host = document.getElementById('orb');
  const orb = (!reduce && window.YaraOrb && host) ? YaraOrb.create({ host, size: 420, src: '/assets/orb/orb.mp4', color: [90, 170, 255] }) : null;

  /* the wish: one span per character. [brackets] are the parts Mira reads, and they type out already lit. */
  const chars = []; let mark = null;
  for (const ch of wishEl.dataset.text) {
    if (ch === '[') { mark = document.createElement('mark'); wishEl.appendChild(mark); continue; }
    if (ch === ']') { mark = null; continue; }
    const s = document.createElement('span'); s.className = 'c'; s.textContent = ch; (mark || wishEl).appendChild(s); chars.push(s);
  }
  const cur = document.createElement('i'); cur.className = 'cursor'; wishEl.appendChild(cur);

  let skipped = !!reduce, typed = false, wishReach = 0;
  const typeWish = () => new Promise(res => {
    wishEl.classList.add('typing');
    const due = []; let t = 150;
    chars.forEach(c => { const ch = c.textContent; t += ch === '.' ? 120 : ch === ',' ? 65 : ch === ' ' ? 17 : 11; due.push(t); });
    const start = performance.now();
    const place = n => { const last = chars[n - 1]; if (!last) return; cur.style.transform = `translate(${last.offsetLeft + last.offsetWidth + 3}px, ${last.offsetTop + (last.offsetHeight - cur.offsetHeight) / 2}px)`; };
    const tick = () => {
      const el = performance.now() - start; let n = 0;
      const byScroll = Math.ceil(chars.length * wishReach);   // a fast scroll pulls the typing along, so it is complete before the wish leaves
      chars.forEach((c, i) => { if (skipped || due[i] <= el || i < byScroll) { c.classList.add('on'); n++; } });
      // the cursor sits after the last letter you can already read, never ahead of ones still fading in
      let vis = n; while (vis > 1 && +getComputedStyle(chars[vis - 1]).opacity < 0.6) vis--;
      place(vis);
      if (n >= chars.length) { wishEl.classList.remove('typing'); res(); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  /* Mira's line and status appear in place; a short swap keeps it from snapping */
  let shown = -1, swapT = 0;
  const show = i => {
    if (i === shown) return; shown = i; clearTimeout(swapT);
    sayEl.classList.add('swap'); status.classList.add('swap');
    swapT = setTimeout(() => { sayEl.textContent = LINES[i][0]; statusText.textContent = LINES[i][1]; sayEl.classList.remove('swap'); status.classList.remove('swap'); }, reduce ? 0 : 170);
  };

  /* the scroll · written in screens of scrolling on a laptop, then turned into fractions of the pinned run
     (the section height minus one screen; css .intro is RUN + 100svh).
     each of Mira's lines keeps 0.667 of a screen. The orb gets its own settle (0.44) before she speaks, so her first
     line never shows while the orb is still on its way; then "BOASIS did it." holds and the page carries it into Set up. */
  // the orb stays under the wish; when the wish leaves, Mira's three lines take its place one by one (css .intro is RUN + 100svh: 510svh, phone 483svh)
  const N = LINES.length, RUN = 3.55;
  const SCREENS = { helloOut: 0.28, wishIn: 0.37, orbUp: 0.62, wishOut: 0.86,
                    mira: 0.90, miraEnd: 2.90, miraOut: 2.91,
                    turn: 2.91, turnEnd: 3.21, turnOut: 3.36 };
  const A = Object.fromEntries(Object.entries(SCREENS).map(([k, v]) => [k, v / RUN]));
  const stage = sec.querySelector('.intro-stage');
  const progress = () => { const run = sec.offsetHeight - innerHeight; return run <= 0 ? 1 : Math.min(1, Math.max(0, -sec.getBoundingClientRect().top / run)); };
  const clamp = v => Math.min(1, Math.max(0, v)), ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const mix = (a, b, t) => a + (b - a) * t;
  let ox = 0, oy = 0, tick = false, orbOn = null, orbRest = 0;

  const ORB = 420;   // the orb is drawn at 420px and scaled down, so it stays sharp at its biggest
  /* where the orb is on each screen: waiting half below the first screen, under the wish, then its own place beside Mira's words */
  function placeOrb(p) {
    const phone = innerWidth <= 980, base = phone ? 88 / ORB : 112 / ORB;
    const r = orbBox.getBoundingClientRect();
    const natX = r.left + r.width / 2 - ox, natY = r.top + r.height / 2 - oy;
    // measured on the stage (100svh), not innerHeight, so a phone's address bar sliding away does not nudge the orb
    const W = stage.clientWidth, H = stage.clientHeight, top = stage.getBoundingClientRect().top;
    // on the first screen the orb is the picture: big, rising into the bottom of the screen close under the doors (as mal.ai's does)
    const heroD = phone ? Math.min(300, W * 0.78) : Math.min(420, H * 0.47), heroS = heroD / ORB, heroX = W / 2, heroY = top + H + heroD * (phone ? -0.1 : 0.02);
    const wishX = W / 2, wishY = top + H * (phone ? 0.7 : 0.74);
    // it rises under the wish and stays there while Mira speaks in the wish's place
    const up = ease(clamp(p / A.orbUp));
    const x = mix(heroX, wishX, up), y = mix(heroY, wishY, up), sc = mix(heroS, base, up);
    ox = x - natX; oy = y - natY;
    orbBox.style.setProperty('--ox', ox.toFixed(1) + 'px'); orbBox.style.setProperty('--oy', oy.toFixed(1) + 'px');
    orbBox.style.setProperty('--os', sc.toFixed(4));
  }

  // the scroll guide sits in the middle of the space between the two doors and the top of the orb; its line shortens if the space is small
  const cue = document.getElementById('scroll-cue'), doors = hello.querySelector('.doors');
  function placeCue() {
    if (!cue || !doors) return;
    const ring = host.firstElementChild, d = doors.getBoundingClientRect().bottom, o = (ring || host).getBoundingClientRect().top, st = stage.getBoundingClientRect().top;
    const gap = o - d, text = 17, lineMax = 34, room = gap - text - 10 - 20;
    if (gap < text + 16) { cue.classList.remove('placed'); return; }       // no room at all: no guide
    const line = room >= 10 ? Math.min(lineMax, room) : 0, h = text + (line ? 10 + line : 0);   // a short screen gets the word without its line
    cue.classList.toggle('short', !line);
    cue.style.setProperty('--cl', line.toFixed(0) + 'px');
    cue.style.setProperty('--cy', (d + (gap - h) / 2 - st).toFixed(0) + 'px');
    cue.classList.add('placed');
  }
  function paint() {
    tick = false; const p = progress();
    sec.classList.toggle('moved', p > 0.008);
    // the first screen rises away on the first scroll, and comes back if you return to the top
    hello.classList.toggle('on', p < A.helloOut); hello.classList.toggle('gone', p >= A.helloOut);
    // the wish types as you arrive at it, once; scroll past it quickly and it is simply there
    if (p >= A.wishOut) skipped = true;
    wishReach = clamp((p - A.wishIn) / (A.wishOut - 0.1 / RUN - A.wishIn));
    if (p >= A.wishIn && !typed) { typed = true; typeWish(); }
    wishEl.classList.toggle('on', p >= A.wishIn && p < A.wishOut); wishEl.classList.toggle('gone', p >= A.wishOut);
    // the orb is on screen from the first screen until her last line; her name as soon as she is listening
    const talking = p >= A.mira && p < A.miraOut, span = (A.miraEnd - A.mira) / N;
    mira.classList.toggle('on', p < A.miraOut); mira.classList.toggle('gone', p >= A.miraOut);
    mira.classList.toggle('named', p >= A.wishIn); mira.classList.toggle('talking', talking);
    if (p < A.miraOut) placeOrb(p);
    if (p < A.helloOut) placeCue();
    // the orb only draws while Mira is on screen; it starts the moment you scroll back to her
    const orbWanted = p < A.miraOut;
    if (orb && orbWanted !== orbOn) { orbOn = orbWanted; clearTimeout(orbRest); if (orbWanted) orb.resume(); else orbRest = setTimeout(() => orb.pause(), 380); }
    if (talking) { const i = Math.min(N - 1, Math.floor((p - A.mira) / span)); show(i); if (orb) orb.setState(i === 0 || i === N - 1 ? 'speaking' : 'thinking'); }
    sec.classList.toggle('working', talking && shown >= 1); document.body.classList.toggle('working', talking && shown >= 1);
    sec.classList.toggle('finished', talking && shown === N - 1);
    if (orb) orb.setEnergy(!talking ? 0.12 : shown === N - 1 ? 0.55 : 0.15 + 0.4 * (shown / N));
    // Yes, that's possible now: the last screen of the intro. It fades away as "From a description to a finished application." comes up, never rides up with it
    turn.classList.toggle('on', p >= A.turn && p < A.turnOut); turn.classList.toggle('gone', p >= A.turnOut);
    turnWords.forEach((el, i) => el.classList.toggle('on', p >= A.turn + (A.turnEnd - A.turn) * i / turnWords.length));
  }
  const onScroll = () => { if (!tick) { tick = true; requestAnimationFrame(paint); } };
  if (reduce) { document.querySelector('.setup')?.style.setProperty('margin-top', '0'); sec.style.height = 'auto'; const st = sec.querySelector('.intro-stage'); st.style.height = 'auto'; st.style.minHeight = '100svh'; mira.style.display = 'none'; wishEl.style.display = 'none'; return; }
  addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onScroll); paint();
  document.fonts?.ready?.then(() => onScroll());   // the doors settle once the fonts arrive; place the guide again
}


/* header and sky · the section you are in is lit in the header, and the sky moves its light to match. One measure per frame. */
function tabs() {
  const bar = document.querySelector('.tabs'); if (!bar) return;
  const links = [...bar.querySelectorAll('a')], dot = bar.querySelector('.tab-dot');
  const secs = links.map(a => { const h = a.getAttribute('href'); return h.startsWith('#') ? document.querySelector(h) : null; });   // on the other pages the links point home
  const intro = document.getElementById('intro');
  let tick = false;
  const paint = () => {
    tick = false; const line = innerHeight * 0.4; let on = -1;
    secs.forEach((sec, i) => { if (!sec) return; const r = sec.getBoundingClientRect(); if (r.top <= line && r.bottom > line) on = i; });
    links.forEach((a, i) => { a.classList.toggle('on', i === on); if (i === on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    if (on >= 0 && dot) {
      if (!bar.classList.contains('has-on')) { dot.style.transition = 'none'; dot.getBoundingClientRect(); }
      dot.style.setProperty('--x', (links[on].offsetLeft + links[on].offsetWidth / 2) + 'px');
      if (dot.style.transition) { dot.getBoundingClientRect(); dot.style.transition = ''; }
    }
    bar.classList.toggle('has-on', on >= 0);
    const inIntro = intro && intro.getBoundingClientRect().bottom > line;
    const zone = on >= 0 ? secs[on].id : inIntro ? 'intro' : 'end';
    if (document.body.dataset.zone !== zone) document.body.dataset.zone = zone;
  };
  addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(paint); } }, { passive: true });
  addEventListener('resize', paint); paint();
}

/* the waiting list · name, email and the plan; the plan buttons above choose the plan on the way down */
function waitlist() {
  const form = document.getElementById('waitlist-form'); if (!form) return;
  document.querySelectorAll('[data-plan]').forEach(a => a.addEventListener('click', () => {
    const r = form.querySelector(`input[name="intent"][value="${a.dataset.plan}"]`); if (r) r.checked = true;
    setTimeout(() => { const n = form.querySelector('input[name="name"]'); if (n) n.focus({ preventScroll: true }); }, 900);
  }));
  const note = form.querySelector('.form-note');
  /* when the form was first looked at · the server compares it with its own clock,
     so a submission that lands in under three seconds is a script, not a person */
  let opened = 0;
  const markOpen = () => { if (!opened) opened = Date.now(); };
  form.querySelectorAll('input, select, button').forEach(el => el.addEventListener('focus', markOpen, { once: true }));
  ['touchstart', 'pointerdown', 'keydown'].forEach(ev => form.addEventListener(ev, markOpen, { once: true, passive: true }));

  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    markOpen();
    const stamp = form.querySelector('input[name="_t"]');
    if (stamp) stamp.value = opened || Date.now();
    const data = Object.fromEntries(new FormData(form).entries());
    if (!String(data.name || '').trim() || !String(data.email || '').trim()) { note.textContent = 'Your name and email, please.'; note.className = 'form-note err'; return; }
    note.textContent = 'Sending…'; note.className = 'form-note';
    try {
      const r = await fetch(form.dataset.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!r.ok) throw new Error(r.status);
      const plan = data.intent === 'enterprise' ? 'Enterprise' : 'Standard';
      form.reset(); opened = 0; note.textContent = `You are on the list for ${plan}. The next email comes when your access is ready.`; note.className = 'form-note ok';
    } catch (e) { note.textContent = 'That did not go through. Write to support@boasis.ae.'; note.className = 'form-note err'; }
  });
}

/* the dialogs · Book a demo and Join early access.
   The buttons that open them keep real hrefs: with no script they still go somewhere
   honest (the contact page, the waiting list); with a script they become the dialog.
   The fields are the site's own, and the rules are the site's own: a stamp of when the
   visitor arrived, a honeypot no human can see, and a fault that lands under its field.
   The demo dialog is two steps, one send: the fields first, the calendar second. The
   calendar loads when its step is reached, not when the page is, so nobody who only
   reads the page pays for a Google round trip. */
/* the same rules as lib/validate.js on the server, so what the dialog accepts is exactly
   what the API accepts: no second, looser truth the visitor can learn by trial and error. */
const DM_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const dmValidEmail = v => { const e = String(v == null ? '' : v).trim().toLowerCase(); return !!e && e.length <= 254 && DM_EMAIL_RE.test(e) && !/\.{2,}/.test(e); };
const dmDigits = v => String(v == null ? '' : v).replace(/\D/g, '');
/* the NANP has no trunk prefix to drop; everywhere else a number dialed at home starts with 0 */
const DM_NO_TRUNK = new Set(['+1']);
const dmFullPhone = (code, number) => {
  let d = dmDigits(number); if (!d) return '';
  if (!DM_NO_TRUNK.has(code)) d = d.replace(/^0+(?=\d)/, '');
  return code + ' ' + d;
};
/* every dialog field, by name: what it means to be empty or wrong, said under the field */
const DM_RULE = {
  name: v => (String(v || '').trim().length >= 2 ? '' : 'Name is required.'),
  email: v => { const e = String(v || '').trim(); return !e ? 'Email is required.' : (dmValidEmail(e) ? '' : 'Please enter a valid email address.'); },
  phone: v => { const d = dmDigits(v); return !d ? 'Phone number is required.' : (d.length >= 7 && d.length <= 15 ? '' : 'Please enter a valid phone number.'); },
  who: v => (v ? '' : 'Please choose who you are.'),
  entity: v => (String(v || '').trim() ? '' : 'Please add the name of your company or authority.'),
  have: v => (v ? '' : 'Please answer: do you have a company?'),
  count: v => (v ? '' : 'Please choose how many.'),
  authority: v => (String(v || '').trim() ? '' : 'Please write the name of the authority.'),
  plans: v => (String(v || '').trim() ? '' : 'Describe it in a sentence — it helps us answer properly.'),
};
function modals() {
  const dialogs = [...document.querySelectorAll('.modal')]; if (!dialogs.length) return;

  /* the code pickers: one control, one list, one search box, shared with the contact page
     (js/countries.js) so the three phone fields can never drift apart. The dialog only says
     where they are, and keeps the reset a close needs: a shut dialog opens fresh, on the UAE,
     with the search cleared. */
  const ccReset = new Map();
  dialogs.forEach(d => d.querySelectorAll('[data-cc]').forEach(cc => {
    const picker = window.BoasisCountryPicker && window.BoasisCountryPicker.init(cc);
    if (picker) ccReset.set(cc, picker.reset);
  }));

  const resets = new Map();
  let lastFocus = null;
  const openDialog = (d, trigger) => {
    lastFocus = trigger || document.activeElement;
    d.hidden = false;
    document.body.classList.add('modal-open');
    if (lenis) lenis.stop();
    const first = d.querySelector('.modal-form input[name="name"]');
    if (first) setTimeout(() => first.focus({ preventScroll: true }), 60);
  };
  const closeDialog = d => {
    const reset = resets.get(d); if (reset) reset();   // a closed dialog opens fresh next time
    d.hidden = true;
    document.body.classList.remove('modal-open');
    if (lenis) lenis.start();
    if (lastFocus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
  };

  /* delegated, so an opener that is added later (the journey builds its own "Book a demo")
     or a whole card that is (the two doors) works too. A click that lands on a real link
     which is not itself an opener (the doors' "Set up" / "Manage" titles) goes to the link.
     A middle click still does what a middle click does, and reading a passage with a
     selection in hand never drags the page into a dialog. */
  document.addEventListener('click', ev => {
    if (ev.button !== 0 || !ev.target || typeof ev.target.closest !== 'function') return;
    const link = ev.target.closest('a[href]');
    if (link && !link.hasAttribute('data-open')) return;
    if (window.getSelection && window.getSelection().toString()) return;
    const a = ev.target.closest('[data-open]');
    if (!a) return;
    const d = document.getElementById('modal-' + a.dataset.open);
    if (!d) return;
    ev.preventDefault();
    openDialog(d, a);
  });
  dialogs.forEach(d => d.querySelectorAll('[data-modal-close]').forEach(el => el.addEventListener('click', () => closeDialog(d))));
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { const open = dialogs.find(d => !d.hidden); if (open) closeDialog(open); }
  });

  dialogs.forEach(d => {
    const form = d.querySelector('.modal-form'); if (!form) return;
    const note = form.querySelector('.form-note');
    const stamp = form.querySelector('input[name="_t"]');
    const codeSel = form.querySelector('input[name="country_code"]');
    const fields = {};
    form.querySelectorAll('input[name], select[name]').forEach(el => {
      if (el.name === 'hp' || el.name === '_t' || el.name === 'country_code') return;
      fields[el.name] = el;
    });
    const say = (n, msg) => {
      const p = d.querySelector(`[data-err="${n}"]`);
      if (p) { p.textContent = msg || ''; p.hidden = !msg; }
      const f = fields[n]; if (f) { const pill = f.closest('.mf-pill'); if (pill) pill.classList.toggle('bad', !!msg); }
    };
    /* a field can be off the form entirely: the entity field exists only once the visitor
       has said who they are; in the list dialog the company fields exist only when they
       have a company, and the sentence only when they don't */
    const fieldOff = n => {
      if (n === 'entity') return !!fields.who && !fields.who.value;
      if (n === 'count' || n === 'authority') return !fields.have || fields.have.value !== 'yes';
      if (n === 'plans') return !fields.have || fields.have.value !== 'no';
      return false;
    };

    /* when they started: the server compares this with its own clock. The listeners are
       armed one session at a time, so a dialog that is closed and reopened stamps its
       second visit honestly instead of reusing a spent token. */
    let opened = 0;
    const markOpen = () => { if (!opened) opened = Date.now(); };
    const arm = () => {
      opened = 0;
      form.addEventListener('focusin', markOpen, { once: true });
      ['touchstart', 'pointerdown', 'keydown'].forEach(ev => form.addEventListener(ev, markOpen, { once: true, passive: true }));
    };
    arm();

    /* while they write: the email and the phone answer at once, and a field that has
       righted itself goes quiet. An empty field waits for the send, when "required" is
       the honest thing to say. */
    if (fields.email) fields.email.addEventListener('input', () => {
      const e = fields.email.value.trim();
      say('email', e && !dmValidEmail(e) ? 'Please enter a valid email address.' : '');
    });
    if (fields.phone) fields.phone.addEventListener('input', () => {
      const raw = fields.phone.value, clean = dmDigits(raw);
      if (clean !== raw) fields.phone.value = clean;   // the box holds the number, the code lives in the picker
      say('phone', clean && (clean.length < 7 || clean.length > 15) ? 'Please enter a valid phone number.' : '');
    });
    if (fields.name) fields.name.addEventListener('input', () => { if (!DM_RULE.name(fields.name.value)) say('name', ''); });
    if (fields.entity) fields.entity.addEventListener('input', () => { if (!DM_RULE.entity(fields.entity.value)) say('entity', ''); });
    if (fields.authority) fields.authority.addEventListener('input', () => { if (!DM_RULE.authority(fields.authority.value)) say('authority', ''); });
    if (fields.plans) fields.plans.addEventListener('input', () => { if (!DM_RULE.plans(fields.plans.value)) say('plans', ''); });

    /* the demo dialog: the entity field appears once the visitor has said who they are,
       and it says the right thing for the answer */
    if (fields.who) {
      const entWrap = d.querySelector('.mf-ent');
      const entLabel = entWrap.querySelector('.sr');
      fields.who.addEventListener('change', () => {
        const on = !!fields.who.value;
        entWrap.hidden = !on;
        if (on) {
          fields.entity.required = true;
          const gov = fields.who.value === 'gov';
          fields.entity.placeholder = gov ? 'Name of the authority' : 'Name of your company';
          if (entLabel) entLabel.textContent = gov ? 'Name of the authority' : 'Name of your company';
        } else {
          fields.entity.required = false;
          say('entity', '');
        }
      });
    }

    /* the list dialog: "yes" counts the companies and names the one; "no" trades both
       fields for a single sentence about the company being thought of */
    if (fields.have) {
      const show = (sel, on) => { const w = d.querySelector(sel); if (w) w.hidden = !on; };
      fields.have.addEventListener('change', () => {
        const v = fields.have.value;
        show('.mf-count', v === 'yes');
        show('.mf-auth', v === 'yes');
        show('.mf-plans', v === 'no');
      });
    }

    /* what step one captures, for the send that comes at the end of the dialog */
    let payload = null;

    const validate = data => {
      let firstBad = null;
      for (const n of Object.keys(fields)) {
        if (fieldOff(n)) { say(n, ''); continue; }
        const msg = DM_RULE[n] ? DM_RULE[n](data[n] || '') : '';
        say(n, msg);
        if (msg && !firstBad) firstBad = n;
      }
      return firstBad;
    };

    /* the line that answers lives in the step that is showing: the form's while step one
       is up, the calendar's while step two is */
    const liveNote = () => {
      const cal = d.querySelector('.modal-cal');
      return (cal && !cal.hidden) ? cal.querySelector('.form-note') : note;
    };

    const finish = async () => {
      if (!payload) return;
      /* the box is a step like the others: pressing the button without it says so on the
         spot, instead of saying "Sending" and quietly posting a form the server will refuse.
         Step one is where the box lives, so the visitor is put back in front of it. */
      const altcha = form.querySelector('input[name="altcha"]');
      if (altcha && !altcha.value) {
        const cal = d.querySelector('.modal-cal');
        if (cal && !cal.hidden) { cal.hidden = true; form.hidden = false; }
        const wn = liveNote();
        wn.textContent = 'Please click the "I am not a robot" box first.';
        wn.className = 'form-note err';
        const start = form.querySelector('[data-captcha-start]');
        if (start) start.focus();
        return;
      }
      const an = liveNote();
      an.textContent = 'Sending';
      an.className = 'form-note';
      try {
        const r = await fetch(form.dataset.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.ok === false) {
          const names = { name: 'your name', email: 'your email address', phone: 'your phone number', who: 'who you are', entity: 'the name field', have: 'that answer', count: 'that answer', authority: 'the authority', plans: 'that sentence', captcha: 'the verification box' };
          const e = (j.errors || []).filter(x => names[x]);
          e.forEach(x => say(x, 'Please check ' + names[x] + '.'));
          const cal = d.querySelector('.modal-cal');
          if (e.length && cal) { cal.hidden = true; form.hidden = false; }   // a fault means back to step one
          const wn = liveNote();                                            // the line goes where the visitor is looking
          const tooMany = (j.errors || []).includes('too-many');
          wn.textContent = tooMany
            ? 'That is a few too many in a row. Please wait a minute, then press the button again. Nothing you typed is lost.'
            : (e.length ? 'Please check the fields marked above.' : 'Please try again, or write to support@boasis.ae.');
          wn.className = 'form-note err';
          /* a spent or failed puzzle must be solved again, so the box goes back to its start */
          if ((j.errors || []).includes('captcha') && window.BoasisCaptcha) window.BoasisCaptcha.reset(form);
          return;
        }
        form.hidden = true;
        const cal = d.querySelector('.modal-cal'); if (cal) cal.hidden = true;
        const done = d.querySelector('.modal-done');
        done.hidden = false;
        done.querySelector('button').focus();
      } catch (e) {
        const wn = liveNote();
        wn.textContent = 'That did not send. Please try again, or write to support@boasis.ae.';
        wn.className = 'form-note err';
      }
    };

    form.addEventListener('submit', ev => {
      ev.preventDefault();
      markOpen();
      if (stamp) stamp.value = opened || Date.now();
      const data = Object.fromEntries(new FormData(form).entries());
      const firstBad = validate(data);
      if (firstBad) { fields[firstBad].focus(); note.textContent = ''; note.className = 'form-note'; return; }

      /* the number the owner reads: the code on the left, the number on the right, one string */
      data.phone = dmFullPhone(codeSel ? codeSel.value : '+971', data.phone) || data.phone;
      delete data.country_code;
      payload = data;

      const cal = d.querySelector('.modal-cal');
      if (cal) {
        /* step two: the calendar. The send waits for it. */
        form.hidden = true;
        cal.hidden = false;
        const frame = cal.querySelector('iframe[data-src]');
        if (frame && !frame.src) frame.src = frame.dataset.src;
        cal.querySelector('[data-final]').focus();
      } else {
        finish();
      }
    });

    const finalBtn = d.querySelector('[data-final]');
    if (finalBtn) finalBtn.addEventListener('click', finish);

    /* what a close tears down: the steps back to the first, the fields empty, the faults
       gone, and the timing token spent so the next visit can spend it again */
    resets.set(d, () => {
      form.hidden = false;
      const cal = d.querySelector('.modal-cal'); if (cal) cal.hidden = true;
      const done = d.querySelector('.modal-done'); if (done) done.hidden = true;
      form.querySelectorAll('input, select').forEach(el => {
        if (el.name === 'country_code') { const cc = el.closest('[data-cc]'); if (cc && ccReset.get(cc)) ccReset.get(cc)(); return; }
        if (el.name === 'hp' || el.name === '_t') { el.value = ''; return; }
        if (el.tagName === 'SELECT') el.selectedIndex = 0;
        else el.value = '';
      });
      const ent = d.querySelector('.mf-ent'); if (ent) ent.hidden = true;
      d.querySelectorAll('.mf-err').forEach(p => { p.textContent = ''; p.hidden = true; });
      d.querySelectorAll('.mf-pill.bad').forEach(p => p.classList.remove('bad'));
      d.querySelectorAll('.form-note').forEach(n => { n.textContent = ''; n.className = 'form-note'; });
      payload = null;
      if (window.BoasisCaptcha) window.BoasisCaptcha.reset(form);
      arm();
    });
  });
}

/* news · newest first · from js/news.js */
function news() {
  const g = document.getElementById('news-grid'); if (!g) return;
  const items = (window.BOASIS_NEWS || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!items.length) { g.innerHTML = '<p class="news-empty">Nothing yet.</p>'; return; }
  const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const M = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const day = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); return m ? `${+m[3]} ${M[+m[2] - 1]} ${m[1]}` : (d || ''); };
  g.innerHTML = items.map(n => `<a class="news-item reveal" href="${esc(n.url) || '#news'}"${n.url ? ' target="_blank" rel="noopener"' : ''}><p class="date">${esc(day(n.date))}</p><h3>${esc(n.title)}</h3><p>${esc(n.summary)}</p></a>`).join('');
}

/* Set up · one line of light runs from SPARK across the zones, lighting each one it reaches */
function setupScroll() {
  const zones = document.getElementById('zones'); if (!zones) return;
  const tiles = [...zones.querySelectorAll('.zone')];
  const clamp = v => Math.max(0, Math.min(1, v));
  if (reduce) { zones.style.setProperty('--z', 1); tiles.forEach(t => t.classList.add('lit')); return; }
  let tick = false;
  const paint = () => {
    tick = false; const vh = innerHeight, r = zones.getBoundingClientRect(), z = clamp((vh * 0.85 - r.top) / (vh * 0.45));
    zones.style.setProperty('--z', z.toFixed(3));
    tiles.forEach((t, i) => t.classList.toggle('lit', i === 0 || z >= i / (tiles.length - 1) - 0.02));
  };
  addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(paint); } }, { passive: true });
  addEventListener('resize', paint); paint();
}

/* reveals · the dial draws when its device arrives */
function reveals() {
  const els = document.querySelectorAll('.reveal');
  if (reduce || !('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .15 });
  // the delay counts within each group (the three steps, the four cards, the two plans), so they arrive left to right
  els.forEach(el => { const sib = [...el.parentElement.children].filter(c => c.classList.contains('reveal')); el.style.transitionDelay = Math.min(3, sib.indexOf(el)) * 90 + 'ms'; io.observe(el); });
}

/* Manage · five problems as tabs. Click (or arrow keys, or "Next"): the white pill slides to it, the panel's words
   come up, its portal screen settles, and a ring of light finds the part of the screen that solves the problem. */
function solve() {
  const list = document.querySelector('.solve-tabs'); if (!list) return;
  const tabs = [...list.querySelectorAll('[role="tab"]')], pill = list.querySelector('.solve-pill');
  const stage = document.querySelector('.solve-stage');
  const LIGHT = [['78%', '38%'], ['74%', '46%'], ['70%', '52%'], ['76%', '34%'], ['72%', '44%']];
  let litT = 0, openT = 0;
  const place = t => { if (!pill) return; pill.style.setProperty('--px', t.offsetLeft + 'px'); pill.style.setProperty('--pw', t.offsetWidth + 'px'); };
  const pick = (t, focus) => {
    const n = tabs.indexOf(t);
    tabs.forEach(b => {
      const on = b === t, panel = document.getElementById(b.getAttribute('aria-controls'));
      b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1;
      panel.hidden = !on; panel.classList.toggle('on', on); panel.classList.remove('lit', 'open');
    });
    place(t);
    if (stage && LIGHT[n]) { stage.style.setProperty('--lx', LIGHT[n][0]); stage.style.setProperty('--ly', LIGHT[n][1]); }
    const panel = document.getElementById(t.getAttribute('aria-controls'));
    clearTimeout(litT); clearTimeout(openT); litT = setTimeout(() => panel.classList.add('lit'), reduce ? 0 : 650);
    // on a phone the tabs scroll sideways: bring the picked one to the middle of the row (the row only, never the page)
    if (list.scrollWidth > list.clientWidth) list.scrollTo({ left: t.offsetLeft - (list.clientWidth - t.offsetWidth) / 2, behavior: reduce ? 'auto' : 'smooth' });
    if (focus) t.focus({ preventScroll: true });
  };
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => pick(b));
    b.addEventListener('keydown', e => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return;
      e.preventDefault(); pick(tabs[(i + d + tabs.length) % tabs.length], true);
    });
  });
  document.querySelectorAll('.sheet.pop').forEach(sh => {
    const panel = sh.closest('.solve-panel');
    sh.querySelector('.spot-mark')?.addEventListener('click', () => { clearTimeout(openT); panel.classList.add('lit', 'open'); });
    sh.querySelector('.pop-open')?.addEventListener('click', () => { clearTimeout(openT); panel.classList.remove('open'); });
  });
  document.querySelectorAll('.solve-next[data-next]').forEach(btn => btn.addEventListener('click', () => { const t = document.getElementById(btn.dataset.next); if (t) pick(t, true); }));
  // the first panel lights up when the section is first seen, not on page load
  const first = tabs.find(t => t.getAttribute('aria-selected') === 'true') || tabs[0];
  place(first); requestAnimationFrame(() => list.classList.add('ready'));
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { pick(first); io.disconnect(); } }), { threshold: .35 });
    io.observe(stage);
  } else { document.getElementById(first.getAttribute('aria-controls')).classList.add('lit'); }
  addEventListener('resize', () => { const t = tabs.find(b => b.getAttribute('aria-selected') === 'true'); if (t) place(t); });
  document.fonts?.ready?.then(() => place(tabs.find(b => b.getAttribute('aria-selected') === 'true') || first));
}

const y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();
/* Set up · the journey: six steps pinned one screen, the step changes with the scroll; the bar lights the step you are on */
function journey() {
  // click only: nothing is pinned and nothing moves with the scroll, so nobody has to go through it. Arrow keys move between steps; each step offers the next one.
  const sec = document.getElementById('journey'); if (!sec) return;
  const steps = [...sec.querySelectorAll('.j-step')], shots = [...sec.querySelectorAll('.journey-screen img')], bar = [...sec.querySelectorAll('.journey-bar li')];
  const btns = bar.map(b => b.querySelector('button')), n = steps.length;
  const pick = (i, focus) => {
    steps.forEach((s, k) => s.classList.toggle('on', k === i));
    shots.forEach((s, k) => { s.classList.toggle('on', k === i); if (k === i) s.loading = 'eager'; });
    bar.forEach((b, k) => { b.classList.toggle('on', k === i); b.classList.toggle('done', k < i); });
    btns.forEach((b, k) => { if (k === i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
    if (focus) btns[i].focus();
  };
  btns.forEach((b, k) => {
    b.addEventListener('click', () => pick(k));
    b.addEventListener('keydown', e => { const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (d) { e.preventDefault(); pick((k + d + n) % n, true); } });
  });
  steps.forEach((s, k) => {
    if (k === n - 1) return;
    /* the first step is the pitch, not the tour: it sends the visitor to the demo instead of
       walking them to the next screen. The rest keep walking. */
    if (k === 0) {
      /* it opens the dialog like the other demo buttons; without a script it still goes
         to the contact page, where the same thing can be said */
      const demo = document.createElement('a');
      demo.className = 'j-next'; demo.href = '/contact.html'; demo.dataset.open = 'demo'; demo.textContent = 'Book a demo';
      s.appendChild(demo);
      return;
    }
    const next = document.createElement('button'); next.type = 'button'; next.className = 'j-next';
    next.textContent = 'Next: ' + btns[k + 1].textContent;
    next.addEventListener('click', () => pick(k + 1));
    s.appendChild(next);
  });
  // the other screens load quietly once the section is near, so a click never waits for an image
  if ('IntersectionObserver' in window) new IntersectionObserver((es, io) => { if (es[0].isIntersecting) { shots.forEach(s => s.loading = 'eager'); io.disconnect(); } }, { rootMargin: '600px' }).observe(sec);
}

/* Set up · talk to Mira: the orb returns; your question is typed as you say it, then she answers word by word and her light moves with her voice.
   It plays by itself once you reach it; a fast scroll pulls it along so it always finishes before the screen leaves. */
function talk() {
  const sec = document.getElementById('talk'); if (!sec) return;
  const orbBox = sec.querySelector('.talk-orb'), host = document.getElementById('talk-orb');
  const h = sec.querySelector('.talk-h'), line = sec.querySelector('.talk-line');
  const you = sec.querySelector('.talk-row.you'), mira = sec.querySelector('.talk-row.her');
  if (reduce) { sec.classList.add('still'); return; }
  const orb = (window.YaraOrb && host) ? YaraOrb.create({ host, size: 420, src: '/assets/orb/orb.mp4', color: [90, 170, 255] }) : null;
  if (orb) { orb.setState('idle'); orb.setEnergy(0.14); }
  // the question letter by letter, the answer word by word; both laid out first so nothing moves as they appear
  const split = (el, unit) => { const text = el.textContent; el.textContent = ''; const out = [];
    (unit === 'c' ? [...text] : text.split(/(\s+)/)).forEach(t => { if (unit === 'w' && /^\s+$/.test(t)) { el.appendChild(document.createTextNode(t)); return; }
      const sp = document.createElement('span'); sp.className = unit; sp.textContent = t; el.appendChild(sp); out.push(sp); }); return out; };
  const qChars = split(you.querySelector('.said'), 'c'), aWords = split(mira.querySelector('.said'), 'w');
  const clamp = v => Math.min(1, Math.max(0, v)), easeOut = t => 1 - Math.pow(1 - t, 3);
  const Q = 0.20, A = 0.44;                           // where the question and the answer begin, as parts of the pinned run
  let qStart = 0, aStart = 0, qShown = 0, aShown = 0, raf = 0, p = 0, calm = 0, done = false;
  const say = () => {                                  // one frame of speech: time decides, the scroll can only push it forward
    raf = 0; if (done) return; const now = performance.now();
    if (qStart) {
      const n = Math.max(Math.floor((now - qStart) / 42), Math.ceil(qChars.length * clamp((p - Q) / 0.16)));
      while (qShown < Math.min(n, qChars.length)) qChars[qShown++].classList.add('on');
      you.classList.toggle('speaking', qShown < qChars.length);
      if (qShown >= qChars.length && !aStart && p >= A) aStart = now + 250;
    }
    if (aStart && now >= aStart) {
      mira.classList.add('on');
      const n = Math.max(Math.floor((now - aStart) / 190) + 1, Math.ceil(aWords.length * clamp((p - A) / 0.2)));
      while (aShown < Math.min(n, aWords.length)) {
        aWords[aShown++].classList.add('on');
        const v = 0.55 + Math.random() * 0.45;         // each word lifts her light a little, like a voice
        orbBox.style.setProperty('--tv', v.toFixed(2));
        if (orb) { orb.setState('speaking'); orb.setEnergy(0.5 + v * 0.4); }
        clearTimeout(calm); calm = setTimeout(() => { orbBox.style.setProperty('--tv', '0.25'); if (orb) orb.setEnergy(0.3); }, 170);
      }
      if (aShown >= aWords.length) { done = true; clearTimeout(calm); calm = setTimeout(() => { orbBox.style.setProperty('--tv', '0'); if (orb) { orb.setState('idle'); orb.setEnergy(0.16); } }, 700); return; }
    }
    if ((qStart && qShown < qChars.length) || aStart) raf = requestAnimationFrame(say);   // waiting for the scroll to reach her answer needs no frames: the scroll wakes it
  };
  const wake = () => { if (!raf) raf = requestAnimationFrame(say); };
  let tick = false;
  const paint = () => {
    tick = false;
    const run = sec.offsetHeight - innerHeight; p = run <= 0 ? 0 : clamp(-sec.getBoundingClientRect().top / run);
    const t = easeOut(clamp((p + 0.02) / 0.16));
    orbBox.style.setProperty('--to', t.toFixed(3)); orbBox.style.setProperty('--ts', (0.62 + 0.38 * t).toFixed(3));
    h.classList.toggle('in', p >= 0.05); line.classList.toggle('in', p >= 0.1);
    if (p >= Q && !qStart) { qStart = performance.now(); you.classList.add('on'); }
    if (qStart) wake();
  };
  addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(paint); } }, { passive: true });
  addEventListener('resize', paint); paint();
}

smooth(); news(); reveals(); tabs(); waitlist(); modals(); intro(); setupScroll(); solve(); journey(); talk();
