/* BOASIS · the captcha box, and the work behind it.
   ---------------------------------------------------------------------------
   One box, one click. The visitor is not asked to read anything or pick squares:
   the browser is handed the puzzle the server signed (see lib/captcha.js) and
   searches for the number that finishes it. On a laptop that is a tenth of a
   second. On a spam script posting thousands of times it is hours of CPU, which
   is the entire point.

   Nothing here talks to anyone but this site, and nothing about the visitor is
   collected. The answer lands in a hidden field named `altcha` inside the form,
   so every form on the site posts it without knowing this file exists.

   The solving loop yields to the page between batches: a locked-up tab reads as
   a broken site, and the visitor would blame the form, not the puzzle. */
(function () {
  'use strict';

  const CHALLENGE_URL = '/api/captcha';
  const BATCH = 400;                     // hashes between two yields to the browser
  const TIME_LIMIT_MS = 20000;           // give up rather than spin forever

  const hex = buffer =>
    Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  async function sha256hex(text) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return hex(digest);
  }

  /* The search itself. Written as a plain function so the test suite can run the very same
     code in Node and prove the browser's half of the protocol, rather than trusting it. */
  async function solve({ challenge, salt, maxNumber }) {
    const end = Number(maxNumber) || 0;
    for (let start = 0; start <= end; start += BATCH) {
      const stop = Math.min(start + BATCH, end + 1);
      for (let n = start; n < stop; n++) {
        if (await sha256hex(salt + n) === challenge) return n;
      }
      await new Promise(r => setTimeout(r, 0));
    }
    return null;
  }

  const payloadOf = answer => btoa(JSON.stringify(answer));
  /* the honest test: can this browser hash at all? subtle only exists in a secure context,
     so a site served over plain http is the one case this turns away, and it says so. */
  const supported = () => !!(typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function');

  function box(el) {
    const form = el.closest('form');
    const button = el.querySelector('[data-captcha-start]');
    const field = form && form.querySelector('input[name="altcha"]');
    const note = el.querySelector('[data-captcha-note]');
    if (!button || !field) return null;

    const say = (text, state) => {
      if (note) note.textContent = text;
      el.classList.toggle('is-done', state === 'done');
      el.classList.toggle('is-busy', state === 'busy');
      el.classList.toggle('is-bad', state === 'bad');
    };
    const label = button.querySelector('.captcha-label');

    async function run() {
      if (button.disabled) return;
      button.disabled = true;
      if (label) label.textContent = 'Checking your browser…';
      say('One moment. Your browser is doing a small calculation.', 'busy');
      try {
        const r = await fetch(CHALLENGE_URL, { headers: { accept: 'application/json' } });
        if (!r.ok) throw new Error('challenge');
        const c = await r.json();
        const number = await Promise.race([
          solve(c),
          new Promise((_, no) => setTimeout(() => no(new Error('timeout')), TIME_LIMIT_MS)),
        ]);
        if (number === null) throw new Error('unsolved');
        field.value = payloadOf({ ...c, number });
        if (label) label.textContent = 'Verified';
        say('Thank you. You can send the form now.', 'done');
      } catch (e) {
        field.value = '';
        if (label) label.textContent = 'I am not a robot';
        button.disabled = false;
        say('That did not finish. Please try again, or write to support@boasis.ae.', 'bad');
      }
    }

    button.addEventListener('click', run);

    /* A form that is cleared or sent gets a fresh box: a used puzzle is spent server-side
       and must not be posted twice. */
    function reset() {
      field.value = '';
      button.disabled = false;
      if (label) label.textContent = 'I am not a robot';
      say('One click. No pictures to read.', '');
    }
    reset();
    return { reset, el };
  }

  const boxes = [];
  function init() {
    document.querySelectorAll('[data-captcha]').forEach(el => {
      const b = box(el);
      if (b) boxes.push(b);
      if (!supported()) {
        el.classList.add('is-bad');
        const n = el.querySelector('[data-captcha-note]');
        if (n) n.textContent = 'Verification needs a secure, modern browser. Write to support@boasis.ae and we will answer.';
        const btn = el.querySelector('[data-captcha-start]');
        if (btn) btn.disabled = true;
      }
    });
  }

  /* Called by the page scripts after a submission lands, or when a form is cleared. */
  function reset(form) {
    const b = boxes.find(x => form && x.el.closest('form') === form);
    if (b) b.reset();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
    window.BoasisCaptcha = { reset, solve, payloadOf, supported };
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { solve, payloadOf, sha256hex };
  }
})();
