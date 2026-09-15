/* BOASIS · the country codes, and the picker that carries them · 15 September 2026
   Three phone fields ask the same question: the two dialogs on the home page and the
   contact form. They used to answer it with two different controls — the dialogs had a
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

  return { init };
})();
