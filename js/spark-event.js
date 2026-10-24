/* The Sharjah Next page · boasis.ae/spark-event
 *
 * The same job /try-mira.js does, for a different crowd: turn what the form asks into a pass, then
 * open the Brain inside this page with it, and remember the pass so a phone that is closed in a
 * pocket comes back to the conversation rather than to the form.
 *
 * Three things differ, and all three are on purpose.
 *   1. The form asks for a first name and a last name, so they are joined into the one field every
 *      door here reads, `full_name`. The record the Brain and the advisor see keeps its shape.
 *   2. `page` names where the person came from, and the create-pass function puts the row in
 *      public.spark_event_leads because of it. Nothing else about the row changes: same columns,
 *      same rules, one table per entrance so the two days can be counted and exported on their own.
 *   3. The localStorage key is this page's own. A person who tried Mira at AI Everything and is now
 *      at Sharjah Next is a different visit with a different row, and neither should be handed to
 *      the other by a shared key.
 *
 * There is no email check and no waiting, same as the other page: the visitor is inside Mira within
 * seconds. The gates that stay are the honeypot, the consent box, the pass itself, and the request
 * limit on the door.
 */
(function () {
  'use strict';

  /* ── the three addresses, written here and nowhere else ──────────────────────
     endpoint  what turns the fields into a pass and starts the record. The same create-pass the
               other page posts to, since the row it writes is chosen by `page` below rather than by
               a second function to deploy, to keep an eye on and to paste into a dashboard.
     brainUrl  where the Brain lives, and what the page frames. BRAIN_URL on the function and
               SPARK_BRAIN_URL on the server answer the same question and win when they are set.
     source    what lands in the row's `source` column: which offer the person came for.
     page      which table the row belongs to, read by create-pass through the map in
               demo/supabase/functions/_shared/spark-supabase.js. One string, three places.
     They live in this file and not in an inline script because every page here is served under a
     policy that forbids inline script; server.js gives /spark-event its own copy of that header with
     the function host added to connect-src. */
  var CFG = window.SPARK_EVENT = {
    endpoint: 'https://grsbhupjihwvidxbkymu.supabase.co/functions/v1/create-pass',
    brainUrl: 'https://brain.boasis.ae',
    source: 'sharjah-next-2026',
    page: 'spark-event'
  };
  var form = document.getElementById('eventForm');
  var btn = form && form.querySelector('.cta');
  var note = form && form.querySelector('[data-note]');
  var F = form ? form.elements : {};
  var opened = Date.now();

  /* ── the orb, the site's own, sized the way the design sizes it ──────────────
     Identical to the other page on purpose: same video from /assets, one still frame when the
     visitor asks for less motion, and the markup's own image stays if the video is not there.
     Decoration over a form never gets to be a reason to wait. */
  (function orb() {
    var host = document.getElementById('orb');
    var wrap = host && host.closest('.orbwrap');
    if (!host || !window.YaraOrb) return;
    try {
      var size = Math.round(Math.min(420, (wrap && wrap.clientWidth) || 420));
      window.YaraOrb.create({ host: host, size: size, src: '/assets/orb/orb.mp4', color: [90, 170, 255] });
      if (wrap) wrap.classList.add('live');
    } catch (e) { /* the fallback image is already on screen */ }
  })();

  /* the phone pill and its sixty codes: js/countries.js is the one file the home page dialogs,
     /early-access, /contact and /try-mira all call, and the hidden input named country_code is what
     the form posts. Nothing is copied into this script, so a code list is fixed once. */
  (function picker() {
    var cc = document.querySelector('[data-cc]');
    if (cc && window.BoasisCountryPicker) window.BoasisCountryPicker.init(cc);
  })();

  function say(k, msg) {
    var p = form.querySelector('[data-err="' + k + '"]');
    if (p) p.textContent = msg || '';
  }
  function tell(msg) { if (note) note.textContent = msg || ''; }

  /* the four fields, checked the way the door checks them, so a mistake is caught here in the
     language of the form rather than as an error code from a function. Two names are checked
     separately because that is how they were asked, and joined below because that is how they are
     kept: one `full_name` in the record, whatever the page looked like. */
  function valid() {
    var ok = true;
    ['first_name', 'last_name', 'email', 'phone', 'consent'].forEach(function (k) { say(k, ''); });
    if ((F.first_name.value || '').trim().length < 2) { say('first_name', 'Please enter your first name.'); ok = false; }
    if ((F.last_name.value || '').trim().length < 2) { say('last_name', 'Please enter your last name.'); ok = false; }
    if (!/^\S+@\S+\.\S+$/.test((F.email.value || '').trim())) { say('email', 'Please enter a valid email.'); ok = false; }
    var d = (F.phone.value || '').replace(/\D/g, '');
    if (d.length < 6 || d.length > 15) { say('phone', 'Please enter a valid number.'); ok = false; }
    if (!F.consent.checked) { say('consent', 'Please tick the box to continue.'); ok = false; }
    return ok;
  }

  var busy = false;
  function go(pass, brainUrl) {
    var url = brainUrl + (brainUrl.indexOf('?') < 0 ? '?' : '&')
      + 'pass=' + encodeURIComponent(pass) + '&embed=1';   // embed=1 says "you are inside a page, keep your own chrome out"
    var link = document.getElementById('miraLink');
    if (link) link.href = url;
    var frame = document.getElementById('brainFrame');
    if (frame && frame.getAttribute('src') !== url) frame.setAttribute('src', url);
    document.getElementById('formView').style.display = 'none';
    document.getElementById('doneView').classList.add('on');
    var main = document.querySelector('.main');
    if (main) main.classList.add('opened');   // the offers and the four points step aside, the frame gets the width
    if (frame) { try { frame.contentWindow.focus(); } catch (e) { /* framed, and not ours to focus */ } }
    /* no window.location on purpose: the person stays on the page they were handed, and the stand's
       screen keeps its header. The link underneath is for the cases a frame cannot win. */
    remember(pass, brainUrl);      // what this page was opened with, so a resume needs no new answer
  }

  /* One thing is stored per browser: the pass, for as long as a pass is worth anything. Its own key,
     as the note above says, and never the address: an IP at a conference is one address for the whole
     hall, and keying a person to it would hand the next stranger's phone the conversation they just
     had. */
  var LS = 'boasis.spark-event.v1';
  var DAY = 24 * 60 * 60 * 1000;
  var PASS_RE = /^PASS[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;
  function remember(pass, brainUrl) {
    try { localStorage.setItem(LS, JSON.stringify({ pass: pass, brain: brainUrl, at: Date.now() })); }
    catch (e) { /* private mode: the page still works, the form is just there when they come back */ }
  }
  function forget() { try { localStorage.removeItem(LS); } catch (e) {} }
  function remembered() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { return null; }
    if (!s || !PASS_RE.test(String(s.pass || '')) || Date.now() - Number(s.at || 0) > DAY) { forget(); return null; }
    return s;
  }

  /* where the same door reads the row back. Both entrances' rows are searched by the pass alone, so
     this line is the same address it is on the other page and it does not know or care which table
     the row is in. */
  function leadUrl(pass) {
    var base = String(CFG.endpoint || '');
    if (!base) return '/api/spark-lead?pass=' + encodeURIComponent(pass);
    if (!/create-pass/.test(base)) return '';
    return base.replace(/create-pass[^/]*$/, 'get-lead') + '?pass=' + encodeURIComponent(pass);
  }

  /* the receipt, fired and forgotten: the mail is a courtesy, the journey in front of them is the
     thing. Same origin, one mail per pass however often the page is opened, and the address is read
     from the row rather than taken from the browser, which is why this needs no confirmation. */
  function receipt(pass) {
    if (!pass) return;
    try {
      fetch('/api/spark-thanks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pass: pass }),
      }).catch(function () {});
    } catch (e) { /* no mail is better than a stuck button */ }
  }

  /* came back, or re-scanned the QR, or closed the phone: their pass is still theirs, so open the box
     they were in and never show them the form again. */
  (function returning() {
    var s = remembered();
    if (!s) return;
    go(s.pass, s.brain || CFG.brainUrl || '');
    var u = leadUrl(s.pass);
    if (!u) return;
    fetch(u).then(function (r) { return r.json().catch(function () { return null; }); }).then(function (j) {
      /* the door says unknown or expired for a pass it does not have: that visit is over, so the form
         is the honest screen. Anything else, including no answer at all, keeps them in Mira. */
      if (j && j.ok === false) {
        forget();
        document.getElementById('doneView').classList.remove('on');
        document.getElementById('formView').style.display = '';
        var main = document.querySelector('.main');
        if (main) main.classList.remove('opened');
        tell('Your visit has closed. Fill the details once more and Mira opens again.');
      }
    }).catch(function () {});
  })();

  /* a stand is a shared device sometimes, so the way out of somebody else's session is one tap, and
     it is written where the person is already looking for a way out */
  (function againLink() {
    var fine = document.querySelector('#doneView .fine');
    if (!fine) return;
    var a = document.createElement('a');
    a.href = '#';
    a.textContent = 'Not you? Start a new one';
    a.addEventListener('click', function (ev) { ev.preventDefault(); forget(); window.location.reload(); });
    fine.appendChild(document.createTextNode(' '));
    fine.appendChild(a);
  })();

  if (!form) return;

  form.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    tell('');
    if (F.hp && (F.hp.value || '').trim()) return;   // a bot filled the field no person can see
    if (!valid()) return;
    if (!CFG.endpoint) {
      tell('The demo is not open on this page yet. Please tell someone at the stand.');
      return;
    }
    if (busy) return;
    busy = true;
    if (btn) btn.disabled = true;

    var data = Object.fromEntries(new FormData(form).entries());
    data.full_name = ((F.first_name.value || '') + ' ' + (F.last_name.value || '')).replace(/\s+/g, ' ').trim();
    data.source = CFG.source || 'sharjah-next-2026';
    data.page = CFG.page || 'spark-event';            // which table the row goes into
    data._t = opened ? Date.now() - opened : 0;       // the function decides if that is a person

    var j = null;
    try {
      var r = await fetch(CFG.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      j = await r.json().catch(function () { return null; });
    } catch (e) { j = null; }

    busy = false;
    if (btn) btn.disabled = false;

    var pass = j && j.ok !== false ? String(j.pass || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) : '';
    if (!pass) {
      tell(j && j.error === 'limited'
        ? 'The stand is busy for a moment. Try once more in a few seconds.'
        : 'That could not be opened just now. Try once more, or tell someone at the stand and they will open Mira for you.');
      return;
    }
    var brain = String((j && j.brain_url) || CFG.brainUrl || '');
    if (!brain) {
      /* a pass with nowhere to take it is a promise we cannot keep: say so rather than send them to
         a blank screen */
      tell('Your pass is ready but Mira is not open yet. Please tell someone at the stand.');
      return;
    }
    go(pass, brain);
    /* fired whether the pass is fresh or the one they already had: the door keeps one marker per
       pass, so a person who clears their browser is not left without the note and a person who taps
       twice is not mailed twice. */
    receipt(pass);
  }, { passive: false });
})();
