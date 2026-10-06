/* SPARK demo · the entrance page at boasis.ae/try-mira
 *
 * One job: turn four fields into a pass, then open the Brain inside this page with it. The
 * person never wonders where they went.
 *
 * Nothing here saves the journey either. window.SPARK.endpoint mints the pass and starts the
 * record; every step inside the Brain updates that same record, including what the person typed
 * and what Mira said back. If a person walks away at step two, the record holds step two. Two
 * back ends answer the same contract: /api/spark-pass on this server, which keeps one file per
 * person under data/leads/, or the three Supabase functions in demo/supabase, which keep one row
 * per person in the table spark_leads. The page does not know and does not care which is in use,
 * and switching is one line in this file.
 *
 * There is no email check and no waiting on purpose: the plan is that the visitor is inside
 * Mira within seconds. The gates that stay are the honeypot, the consent box, the pass
 * itself, and the request limit on the entrance (plan, task 5).
 */
(function () {
  'use strict';

  /* ── the two addresses, written here and nowhere else ───────────────────────
     endpoint  what turns the four fields into a pass and starts the person's file. It points at
               the Supabase function create-pass, which is what is deployed for boasis-spark. The
               site's own door, /api/spark-pass, answers the same way with the same rules and the
               same record shape, so moving back to it is this one line. server.js is given the
               same project host for connect-src, and a test fails if the two hosts ever differ.
     brainUrl  where the Brain lives, and what the page then frames. SPARK_BRAIN_URL on the
               server answers the same question for the pass response, and wins when it is set.
     They live in this file and not in an inline script, because every page on this site is
     served under a policy that forbids inline script, and the demo should not be the reason
     to loosen it for the others. server.js gives /try-mira its own copy of that header with
     the function host added to it. An empty endpoint is a page that is not connected, and it
     says so out loud when pressed rather than posting at something guessed. */
  var CFG = window.SPARK = {
    endpoint: 'https://grsbhupjihwvidxbkymu.supabase.co/functions/v1/create-pass',
    brainUrl: 'https://brain.boasis.ae',
    source: 'ai-everything-2026'
  };
  var form = document.getElementById('eventForm');
  var btn = form && form.querySelector('.cta');
  var note = form && form.querySelector('[data-note]');
  var F = form ? form.elements : {};
  var opened = Date.now();

  /* ── the orb, the site's own, sized the way the design sizes it ──────────────
     Same call the design file makes, with the video taken from /assets instead of pasted in
     as text. YaraOrb draws one still frame when a visitor asks for less motion, so nothing
     here has to decide that. If the video is not there the still image the markup ships
     stays on screen, and the page never waits on this: it is decoration over a form. */
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

  /* ── the country code: the site's own picker, the site's own list ────────────
     js/countries.js is the one file the home page dialogs, /early-access and /contact all
     call, and it carries the sixty codes, the search and the keyboard. Nothing is copied into
     this script: the markup is the site's markup, and the hidden input named country_code is
     what the form posts, exactly as it did with a select. */
  (function picker() {
    var cc = document.querySelector('[data-cc]');
    if (cc && window.BoasisCountryPicker) window.BoasisCountryPicker.init(cc);
  })();

  function say(k, msg) {
    var p = form.querySelector('[data-err="' + k + '"]');
    if (p) p.textContent = msg || '';
  }
  function tell(msg) { if (note) note.textContent = msg || ''; }

  function valid() {
    var ok = true;
    ['full_name', 'email', 'phone', 'consent'].forEach(function (k) { say(k, ''); });
    if ((F.full_name.value || '').trim().length < 2) { say('full_name', 'Please enter your name.'); ok = false; }
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
    if (main) main.classList.add('opened');   // the four points step aside, the frame gets the width
    if (frame) { try { frame.contentWindow.focus(); } catch (e) { /* framed, and not ours to focus */ } }
    /* no window.location on purpose: the person stays on the page they were handed, and the
       stand's screen keeps the header, so walking back is not needed. The link underneath is
       for the cases a frame cannot win, like a browser that refuses framing. */
    remember(pass, brain);
  }

  /* One thing is stored per browser: the pass. It lives in localStorage rather than in the tab,
     because the thing that actually happens at a stand is a phone that is closed, locked, put in a
     pocket, and opened again an hour later. That person must land on Mira, not on the form: a
     second submission of the same four fields would only ask the door for another pass, and the
     door is allowed to answer with a second row for the same name.

     Not the address, deliberately. An IP at a conference is one address for the whole hall, so
     keying a person to it would hand the next stranger's phone the conversation they just had.
     The pass is kept for the day the pass itself is worth, then it is dropped. */
  var LS = 'boasis.spark.v1';
  var DAY = 24 * 60 * 60 * 1000;
  var PASS_RE = /^PASS[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;
  function remember(pass, brain) {
    try { localStorage.setItem(LS, JSON.stringify({ pass: pass, brain: brain, at: Date.now() })); }
    catch (e) { /* private mode: the page still works, the form is just there when they come back */ }
  }
  function forget() { try { localStorage.removeItem(LS); } catch (e) {} }
  function remembered() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { return null; }
    if (!s || !PASS_RE.test(String(s.pass || '')) || Date.now() - Number(s.at || 0) > DAY) { forget(); return null; }
    return s;
  }

  /* where the same door reads the row back. The site's own answer and the Supabase one are the
     same shape on purpose, so this line does not care which is deployed. */
  function leadUrl(pass) {
    var base = String(CFG.endpoint || '');
    if (!base) return '/api/spark-lead?pass=' + encodeURIComponent(pass);
    if (!/create-pass/.test(base)) return '';
    return base.replace(/create-pass[^/]*$/, 'get-lead') + '?pass=' + encodeURIComponent(pass);
  }

  /* the receipt, fired and forgotten: the mail is a courtesy to the person, the journey in front
     of them is the thing, so nothing here waits for it or reports it. Same origin, and the door
     sends at most one mail per pass however often the page is opened. */
  function receipt(pass) {
    if (!pass) return;
    try {
      fetch('/api/spark-thanks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pass: pass }),        // the pass only: the address is read from the row
      }).catch(function () {});
    } catch (e) { /* no mail is better than a stuck button */ }
  }

  /* came back by accident, or re-scanned the QR, or closed the phone: their pass is still theirs,
     so open the box they were in and never show them the form again. */
  (function returning() {
    var s = remembered();
    if (!s) return;
    go(s.pass, s.brain || CFG.brainUrl || '');
    var u = leadUrl(s.pass);
    if (!u) return;
    fetch(u).then(function (r) { return r.json().catch(function () { return null; }); }).then(function (j) {
      /* the door says unknown or expired for a pass it does not have: that visit is over, so the
         form is the honest screen. Anything else, including no answer at all, keeps them in Mira. */
      if (j && j.ok === false) {
        forget();
        document.getElementById('doneView').classList.remove('on');
        document.getElementById('formView').style.display = '';
        var main = document.querySelector('.main');
        if (main) main.classList.remove('opened');
        tell('Your visit at the stand has closed. Fill the four fields once more and Mira opens again.');
      }
    }).catch(function () {});
  })();

  /* a stand is a shared device sometimes, so the way out of somebody else's session is one tap
     and it is written where the person is already looking for a way out */
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
      tell('The demo is not open on this page yet. Please tell someone at the SPARK stand.');
      return;
    }
    if (busy) return;
    busy = true;
    if (btn) btn.disabled = true;

    var data = Object.fromEntries(new FormData(form).entries());
    data.source = CFG.source || 'ai-everything-2026';
    data._t = opened ? Date.now() - opened : 0;        // the function decides if that is a person

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
      /* a pass with nowhere to take it is a promise we cannot keep: say so rather than
         send them to a blank screen */
      tell('Your pass is ready but Mira is not open yet. Please tell someone at the SPARK stand.');
      return;
    }
    go(pass, brain);
    if (!j.reused) receipt(pass);      // once per person, and the door reads the address itself
  }, { passive: false });
})();
