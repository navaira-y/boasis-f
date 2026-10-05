/* SPARK demo · the entrance page at boasis.ae/try-mira
 *
 * One job: turn four fields into a pass, then send the person to the Brain with it.
 * Nothing here saves the journey. The pass is created by the Supabase function named in
 * window.SPARK.endpoint, which writes leads/<pass>.json with the contact part; every step
 * inside the Brain updates that same file (plan, task 2 and 4). If a person walks away at
 * step two, the file holds step two.
 *
 * There is no email check and no waiting on purpose: the plan is that the visitor is inside
 * Mira within seconds. The gates that stay are the honeypot, the consent box, the pass
 * itself, and the request limit on the entrance (plan, task 5).
 */
(function () {
  'use strict';

  /* ── the two addresses, written here and nowhere else ───────────────────────
     endpoint  the Supabase function that mints the pass and starts the lead file
     brainUrl  where the Brain lives. The client still owes this link; until it is pasted,
               a pass is handed out and the page says Mira is not open yet, rather than
               sending a person to a blank address.
     They live in this file and not in an inline script, because every page on this site is
     served under a policy that forbids inline script, and the demo should not be the reason
     to loosen it for the others. server.js gives /try-mira its own copy of that header with
     the function host added to it. An empty endpoint is a page that is not connected, and it
     says so out loud when pressed rather than posting at something guessed. */
  var CFG = window.SPARK = {
    endpoint: '',
    brainUrl: '',
    source: 'ai-everything-2026'
  };
  var form = document.getElementById('eventForm');
  var btn = form && form.querySelector('.cta');
  var note = form && form.querySelector('[data-note]');
  var F = form ? form.elements : {};
  var opened = Date.now();

  /* ── the orb, the same one the home page carries ─────────────────────────────
     If the video is not there, or the visitor asked for less motion, the still image the
     markup ships stays put. The page never waits on this: it is decoration over a form. */
  (function orb() {
    var host = document.getElementById('orb');
    var wrap = host && host.closest('.orbwrap');
    if (!host || !window.YaraOrb) return;
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    try {
      window.YaraOrb.create({ host: host, size: 340, src: '/assets/orb/orb.mp4', color: [90, 170, 255] });
      if (wrap) wrap.classList.add('live');
    } catch (e) { /* the fallback image is already on screen */ }
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
    var url = brainUrl + (brainUrl.indexOf('?') < 0 ? '?' : '&') + 'pass=' + encodeURIComponent(pass);
    var link = document.getElementById('miraLink');
    if (link) link.href = url;
    document.getElementById('formView').style.display = 'none';
    document.getElementById('doneView').classList.add('on');
    try { sessionStorage.setItem('spark.pass', JSON.stringify({ pass: pass, url: url })); } catch (e) { /* private mode: the page still works */ }
    setTimeout(function () { window.location.href = url; }, 600);   // seconds, not a ceremony
  }

  /* came back by accident, or re-scanned the QR: the pass they were given is still theirs */
  (function returning() {
    var raw = null;
    try { raw = sessionStorage.getItem('spark.pass'); } catch (e) { return; }
    if (!raw) return;
    try {
      var s = JSON.parse(raw);
      if (s && s.pass && s.url) go(s.pass, s.url.replace(/[?&]pass=[^&]*/, '').replace(/[?&]$/, ''));
    } catch (e) { /* a stale entry is no reason to stop the form */ }
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
  }, { passive: false });
})();

/* ── how it works: you stand at the mark and the road moves ahead of you ───────
 *
 * The points are not beside the road, they are on it: every sentence is placed at a point of
 * the drawn path, and the whole road slides upward as the page is scrolled, so a point rises
 * to the mark, is read there, and is left behind above it. Nothing comes back down. The thin
 * strip at the left is the same route in miniature, with a light on it, so the part still
 * ahead of you is visible the whole time.
 *
 * The maths is three small pure functions, plan / where / xOnRoad, kept apart from the browser
 * calls so they can be tested without a page. Everything after them is measurement and
 * setting styles. If any of it cannot be measured, or the section is absent, or motion is
 * asked down to nothing, the four points stay the plain list the markup already is.
 */
(function howItWorks () {
  var sec = document.querySelector('[data-how]');
  if (!sec) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var steps = Array.prototype.slice.call(sec.querySelectorAll('.how-step'));
  var stage = sec.querySelector('[data-stage]');
  var track = sec.querySelector('[data-track]');
  var mark = sec.querySelector('[data-mark]');
  var here = sec.querySelector('[data-here]');
  var dots = sec.querySelector('[data-dots]');
  var road = sec.querySelector('.road');
  if (!steps.length || !stage || !track) return;
  sec.classList.add('live');                        // the css waits for this word to move anything

  var ANCHOR = 0.5;        // the mark sits in the middle of the screen, as the owner asked
  var K = 2.2;             // how much road there is, as a share of the stage
  var GATE = 0.26;         // how close a point must be to the mark to be the one you read
  var VIEW_H = 2600, VIEW_W = 420;   // the viewBox of the drawn road

  /* where each point sits on the road, and what fraction of the road that is. The last point
     reaches the mark exactly as the section lets go, and the road carries on past it. */
  function plan (n, stageH, anchorShare, kShare) {
    var trackH = stageH * kShare;
    var slide = trackH - stageH;
    var anchor = stageH * anchorShare;
    var out = [];
    for (var i = 0; i < n; i++) {
      var y = anchor + slide * ((i + 1) / n);
      out.push({ y: y, f: y / trackH });
    }
    return { trackH: trackH, slide: slide, anchor: anchor, points: out };
  }

  /* a point is the one you are reading while it is at the mark; before that it is on its way,
     after that it is behind you. It never returns. */
  function where (screenY, anchor, gate) {
    if (screenY > anchor + gate) return 'ahead';
    if (screenY < anchor - gate) return 'passed';
    return 'now';
  }

  /* the road is a curve, so the horizontal place of a point comes from the path itself. It is
     sampled once into a table and read back by interpolation: no per-frame path walking. */
  var table = null;
  function sample () {
    if (!road || typeof road.getTotalLength !== 'function' || typeof road.getPointAtLength !== 'function') return null;
    var L = road.getTotalLength(), pts = [], N = 240;
    for (var i = 0; i <= N; i++) {
      var p = road.getPointAtLength(L * i / N);
      pts.push({ y: p.y, x: p.x });
    }
    return pts;
  }
  function xOnRoad (pts, yCss, trackH, width) {
    if (!pts || !trackH) return width / 2;
    var want = yCss / trackH * VIEW_H;
    for (var i = 1; i < pts.length; i++) {
      if (pts[i].y >= want) {
        var a = pts[i - 1], b = pts[i];
        var t = (want - a.y) / ((b.y - a.y) || 1);
        return (a.x + (b.x - a.x) * t) / VIEW_W * width;
      }
    }
    return pts[pts.length - 1].x / VIEW_W * width;
  }

  /* the same route, in miniature, so the road ahead of the mark is always on screen */
  var marks = [];
  if (dots) {
    for (var d = 0; d < steps.length; d++) {
      var li = document.createElement('li');
      li.style.top = ((d + 1) / steps.length * 100).toFixed(2) + '%';
      dots.appendChild(li);
      marks.push(li);
    }
  }

  var w = 0, h = 0, pl = null;
  function measure () {
    w = stage.clientWidth; h = stage.clientHeight;
    if (!h) return false;
    pl = plan(steps.length, h, ANCHOR, K);
    track.style.height = Math.round(pl.trackH) + 'px';
    table = sample();
    for (var i = 0; i < steps.length; i++) {
      steps[i].style.top = Math.round(pl.points[i].y) + 'px';
      steps[i].style.left = Math.round(xOnRoad(table, pl.points[i].y, pl.trackH, w)) + 'px';
    }
    if (mark) mark.style.top = Math.round(pl.anchor) + 'px';
    return true;
  }

  var raf = 0;
  function draw () {
    raf = 0;
    if (!pl && !measure()) return;
    var box = sec.getBoundingClientRect();
    var span = sec.offsetHeight - (window.innerHeight || 0);
    // nothing to scroll is not a road to stand at the start of: show the whole thing
    var p = span > 0 ? Math.min(1, Math.max(0, -box.top / span)) : 1;
    track.style.transform = 'translate3d(0,' + (-pl.slide * p).toFixed(1) + 'px,0)';
    for (var i = 0; i < steps.length; i++) {
      var y = pl.points[i].y - pl.slide * p;
      var state = where(y, pl.anchor, pl.anchor * GATE);
      var cl = steps[i].classList;
      cl.toggle('now', state === 'now');
      cl.toggle('ahead', state === 'ahead');
      cl.toggle('passed', state === 'passed');
      if (marks[i]) marks[i].classList.toggle('on', state !== 'ahead');
    }
    if (mark) {
      var x = xOnRoad(table, pl.anchor + pl.slide * p, pl.trackH, w);
      mark.style.left = Math.round(x) + 'px';
    }
    if (here) here.style.top = (p * 100).toFixed(2) + '%';
  }
  function onScroll () { if (!raf && window.requestAnimationFrame) raf = requestAnimationFrame(draw); else if (!raf) draw(); }
  function onResize () { if (measure()) draw(); }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);
  if (measure()) draw();

  /* the three pure rules, where a test can reach them without a page */
  window.SPARK_ROAD = { plan: plan, where: where, xOnRoad: xOnRoad };
})();
