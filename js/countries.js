/* BOASIS · the country codes, and the picker that carries them · 15 September 2026
   Three phone fields ask the same question: the demo dialog, the /early-access page and
   the contact form. They used to answer it with two different controls — the dialogs had a
   picker with no search (sixty countries is a scroll, and a scroll is not a search), and
   the contact page had a native <select> that could not say what a code belonged to. The
   owner asked for the search, and for the contact picker to be the same as the others, so
   the data and the behaviour live here, once, and all three call it.

   The closed control says the short form and the code (AE +971); the open panel says the
   full name and the code, and opens with a search box. The form posts the dial code from
   the hidden input beside the button, exactly as it always has. */
window.BoasisCountryPicker = (function () {
  'use strict';

  /* [ISO, name, dial code], in the order the contact page has always listed them. The
     picker shows an alphabetical copy: the order here is data, not presentation. */
  const COUNTRIES = [
    ['AE', 'United Arab Emirates', '+971'], ['SA', 'Saudi Arabia', '+966'], ['QA', 'Qatar', '+974'], ['BH', 'Bahrain', '+973'], ['KW', 'Kuwait', '+965'], ['OM', 'Oman', '+968'], ['EG', 'Egypt', '+20'], ['JO', 'Jordan', '+962'], ['LB', 'Lebanon', '+961'], ['IQ', 'Iraq', '+964'], ['IL', 'Israel', '+972'], ['PS', 'Palestine', '+970'], ['SY', 'Syria', '+963'], ['IR', 'Iran', '+98'], ['UZ', 'Uzbekistan', '+998'], ['AZ', 'Azerbaijan', '+994'], ['MA', 'Morocco', '+212'], ['TN', 'Tunisia', '+216'], ['DZ', 'Algeria', '+213'], ['GB', 'United Kingdom', '+44'], ['DE', 'Germany', '+49'], ['FR', 'France', '+33'], ['IT', 'Italy', '+39'], ['ES', 'Spain', '+34'], ['NL', 'Netherlands', '+31'], ['BE', 'Belgium', '+32'], ['GR', 'Greece', '+30'], ['CH', 'Switzerland', '+41'], ['AT', 'Austria', '+43'], ['DK', 'Denmark', '+45'], ['SE', 'Sweden', '+46'], ['NO', 'Norway', '+47'], ['PL', 'Poland', '+48'], ['PT', 'Portugal', '+351'], ['RU', 'Russia', '+7'], ['US', 'United States', '+1'], ['MX', 'Mexico', '+52'], ['AR', 'Argentina', '+54'], ['BR', 'Brazil', '+55'], ['CL', 'Chile', '+56'], ['CO', 'Colombia', '+57'], ['IN', 'India', '+91'], ['PK', 'Pakistan', '+92'], ['TW', 'Taiwan', '+886'], ['JP', 'Japan', '+81'], ['KR', 'South Korea', '+82'], ['CN', 'China', '+86'], ['SG', 'Singapore', '+65'], ['MY', 'Malaysia', '+60'], ['TH', 'Thailand', '+66'], ['PH', 'Philippines', '+63'], ['ID', 'Indonesia', '+62'], ['LK', 'Sri Lanka', '+94'], ['AU', 'Australia', '+61'], ['NZ', 'New Zealand', '+64'], ['ZA', 'South Africa', '+27'], ['NG', 'Nigeria', '+234'], ['KE', 'Kenya', '+254'], ['GH', 'Ghana', '+233'],
  ];

  /* What people type that is not in the name: "uae" is nowhere in "United Arab Emirates",
     and "uk" is nowhere in "United Kingdom". The ISO code and the dial code are matched
     already, so these are the country's other names, nothing more. */
  const ALIASES = { AE: 'uae emirates', GB: 'uk britain england', SA: 'ksa', US: 'usa america' };

  /* How long a number is, in digits after the code, once any local trunk zero is dropped. Two
     digits per country: the shortest and the longest thing that can legitimately be dialed into it,
     because a country with short area codes and long mobiles needs a range and not a number (a
     German landline can be six digits, an Italian mobile ten). Keyed by ISO, since that is how the
     list above is written, and read by dial code below, because the dial code is all a form posts.
     Nothing in here is a wall: it is what a page says while a person is still typing, and the door
     behind it keeps the loose seven to fifteen so a real lead is never lost to this table being a
     digit off. Source: the ITU national numbering plan, rounded outward where a plan is loose. */
  const LENGTHS = {
    AE: [8, 9], SA: [9, 9], QA: [8, 8], BH: [8, 8], KW: [8, 8], OM: [8, 8], EG: [9, 10],
    JO: [8, 9], LB: [7, 8], IQ: [9, 10], IL: [8, 9], PS: [8, 9], SY: [8, 9], IR: [10, 10],
    UZ: [9, 9], AZ: [9, 9], MA: [9, 9], TN: [8, 8], DZ: [9, 9],
    GB: [9, 10], DE: [6, 11], FR: [9, 9], IT: [6, 11], ES: [9, 9], NL: [9, 9], BE: [8, 9],
    GR: [10, 10], CH: [9, 9], AT: [7, 12], DK: [8, 8], SE: [7, 9], NO: [8, 8], PL: [9, 9],
    PT: [9, 9], RU: [10, 11],
    US: [10, 10], MX: [10, 10], AR: [10, 11], BR: [10, 11], CL: [8, 9], CO: [10, 10],
    IN: [10, 10], PK: [9, 10], TW: [8, 9], JP: [9, 10], KR: [9, 11], CN: [10, 12],
    SG: [8, 8], MY: [9, 10], TH: [9, 9], PH: [9, 10], ID: [9, 12], LK: [9, 9],
    AU: [9, 9], NZ: [8, 10], ZA: [9, 9], NG: [10, 11], KE: [9, 10], GH: [9, 10],
  };

  /* One alphabet for matching, so 'Türkiye' and 'turkiye' are the same word and a stray
     capital never hides a country. */
  const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const digits = s => String(s == null ? '' : s).replace(/\D/g, '');

  /* Alphabetical is the only order the picker ever shows — including when a search is
     cleared, which must land back on the whole list, not on the order the data happens to
     be written in. */
  const ALPHABETICAL = COUNTRIES.slice().sort((a, b) => a[1].localeCompare(b[1]));

  /* The rows a query lets through: the name contains it, the ISO starts it, the dial code
     contains its digits, or it is one of the other names. An empty query lets all through. */
  function match(query) {
    const q = norm(query);
    if (!q) return ALPHABETICAL;
    const d = digits(q);
    return ALPHABETICAL.filter(p => norm(p[1]).includes(q)
      || norm(p[0]).startsWith(q)
      || (!!d && p[2].includes(d))
      || String(ALIASES[p[0]] || '').split(' ').some(w => w && w.startsWith(q)));
  }

  /* The same table, indexed by the thing a form holds. A dial code shared by two countries (+7,
     +1) takes the wider of the two, which is the safe direction for a guess. */
  const BY_CODE = {};
  for (const [iso, , dial] of COUNTRIES) {
    const w = LENGTHS[iso];
    if (!w) continue;
    const had = BY_CODE[dial];
    BY_CODE[dial] = had ? [Math.min(had[0], w[0]), Math.max(had[1], w[1])] : w;
  }
  const LOOSE = [7, 15];                    // the floor every door on this site already enforces

  /* the digits worth counting: the code is in its own control, and the leading zero a number
     starts with at home is a trunk prefix, not part of the number, except in North America where
     there is no trunk prefix to drop */
  function significant(code, d) { return code === '+1' ? d : d.replace(/^0+(?=\d)/, ''); }

  /* the range that applies to a code the form is holding, and whether this number is inside it */
  function lengthOf(code) { return BY_CODE[code] || LOOSE; }
  function ok(code, raw) {
    const d = digits(raw);
    const w = lengthOf(code);
    const n = significant(code, d).length;
    return { empty: !d, valid: n >= w[0] && n <= w[1], min: w[0], max: w[1], got: n };
  }

  let n = 0;

  /* one picker: cc is the [data-cc] element, the only part of the markup this needs —
     button, panel, search box, list, hidden input, and the empty state. */
  function init(cc) {
    const btn = cc.querySelector('.cc-btn');
    const cur = cc.querySelector('.cc-cur');
    const codeEl = cc.querySelector('.cc-code');
    const input = cc.querySelector('input[name="country_code"]');
    const pop = cc.querySelector('.cc-pop');
    const find = cc.querySelector('.cc-search');
    const list = cc.querySelector('.cc-list');
    const none = cc.querySelector('.cc-none');
    if (!btn || !cur || !codeEl || !input || !pop || !list) return null;

    /* the button says which panel it opens; the ids are built here, so the same markup can
       be repeated three times without three ways of getting them wrong */
    pop.id = 'cc-pop-' + (++n);
    list.id = pop.id + '-list';
    btn.setAttribute('aria-controls', pop.id);
    if (find) { find.setAttribute('aria-controls', list.id); find.setAttribute('aria-autocomplete', 'list'); }

    const items = ALPHABETICAL;
    const DEFAULT = input.value || '+971';   // what the markup says, and what a reset returns to
    let shown = items;                       // the rows the search is letting through

    const row = p => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      li.tabIndex = -1;
      li.dataset.code = p[2];
      const name = document.createElement('span'); name.textContent = p[1];
      const code = document.createElement('span'); code.className = 'cc-li-code'; code.textContent = p[2];
      li.append(name, code);
      return li;
    };

    const mark = () => [...list.children].forEach(li => li.setAttribute('aria-selected', String(li.dataset.code === input.value)));

    /* the rows on screen, and the one line the panel says when the search found nothing */
    const draw = () => {
      list.textContent = '';
      shown.forEach(p => list.appendChild(row(p)));
      if (none) none.hidden = shown.length > 0;
      mark();
      list.scrollTop = 0;
    };

    const setCode = code => {
      const it = items.find(p => p[2] === code);
      if (!it) return false;
      input.value = it[2];
      cur.textContent = it[0];
      codeEl.textContent = it[2];
      mark();
      /* the page holding this picker may be judging a phone number against the country it just
         stopped being, so a change is said out loud rather than left as a label nobody listens to.
         An event on the wrapper, bubbling: a page that does not care pays nothing, and a page that
         does never has to reach inside this file. */
      cc.dispatchEvent(new CustomEvent('codechange', { bubbles: true, detail: { code: input.value } }));
      return true;
    };

    /* focusSearch is the visitor about to type: a key opened the panel, or a mouse did on a
       screen that has one. On a touch screen the panel opens as a list, because a keyboard
       would cover the rows the visitor was about to scroll. */
    const open = focusSearch => {
      pop.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      if (find && focusSearch) find.focus();
    };
    /* A close forgets the search as well as the open panel: reopening a picker that still
       says "paki" and still shows one row is a picker that looks broken. */
    const close = toButton => {
      pop.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (find && find.value) { find.value = ''; shown = items; draw(); }
      if (toButton) btn.focus();
    };

    /* the arrow keys walk the rows: from nowhere, they land on the first (or the last) */
    const move = (from, dir) => {
      const lis = [...list.children];
      if (!lis.length) return;
      const i = lis.indexOf(from);
      const next = i === -1 ? (dir > 0 ? 0 : lis.length - 1) : Math.max(0, Math.min(lis.length - 1, i + dir));
      lis[next].focus();
      /* a DOM with no layout (a headless one) has nothing to scroll into view */
      if (lis[next].scrollIntoView) lis[next].scrollIntoView({ block: 'nearest' });
    };

    const pick = li => {
      if (!li) return;
      setCode(li.dataset.code);
      close(true);
    };

    btn.addEventListener('click', ev => {
      /* detail 0 is a key (Enter or Space on the button): a keyboard visitor means to type.
         With a mouse, the search is the fastest way through sixty countries too, so the box
         takes the focus as well — but not on a touch screen, where that would throw up a
         keyboard over the list the visitor was about to scroll. */
      const byKey = ev.detail === 0;
      const pointing = !window.matchMedia || window.matchMedia('(hover: hover)').matches;
      if (pop.hidden) open(byKey || pointing);
      else close(false);
    });
    btn.addEventListener('keydown', ev => {
      if (ev.key === 'Escape' && !pop.hidden) { ev.preventDefault(); ev.stopPropagation(); close(false); return; }
      if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
      ev.preventDefault();
      if (pop.hidden) open(true);
      else move(null, ev.key === 'ArrowDown' ? 1 : -1);
    });

    if (find) {
      find.addEventListener('input', () => { shown = match(find.value); draw(); });
      find.addEventListener('keydown', ev => {
        if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); move(null, ev.key === 'ArrowDown' ? 1 : -1); }
        /* Enter here takes the country the search found. It must never submit the form:
           the picker lives inside one, and a stray submit would post a half-filled form. */
        else if (ev.key === 'Enter') { ev.preventDefault(); pick(list.children[0]); }
        else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(true); }
      });
    }

    list.addEventListener('click', ev => { const li = ev.target.closest('li[role="option"]'); if (li) pick(li); });
    list.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') { const li = ev.target.closest('li[role="option"]'); if (li) { ev.preventDefault(); pick(li); } }
      else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(true); }
      else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); move(document.activeElement, ev.key === 'ArrowDown' ? 1 : -1); }
      else if (ev.key === 'Tab') close(false);
    });

    /* four ways out: the button again, a choice, a click anywhere else, the keyboard
       leaving the picker. None of them can leave the panel hanging over the form. */
    document.addEventListener('click', ev => { if (!pop.hidden && !cc.contains(ev.target)) close(false); });
    cc.addEventListener('focusout', () => setTimeout(() => { if (!pop.hidden && !cc.contains(document.activeElement)) close(false); }, 0));

    const reset = () => {
      if (find) find.value = '';
      shown = items;
      setCode(DEFAULT);
      draw();
      close(false);
    };

    setCode(DEFAULT);
    draw();
    return { reset, close, setCode, code: () => input.value };
  }

  return { init, lengthOf, ok, LENGTHS };
})();
