/* YaraOrb — the Boasis orb, as designed in Boasis/boasis-yara-spark, in plain JS.
 *
 * Layers (bottom → top), all inside one hard circular boundary:
 *   1. haze     — a soft ring of light, drawn on a canvas
 *   2. tendrils — her light, drawn on a second canvas; the softness is a CSS blur (GPU),
 *                 added onto the haze with plus-lighter, the same way the strokes add up
 *   3. ring     — the water ring, cut out of the video with a radial mask
 * One static thin line sits outside. Nothing draws outside the orb.
 *
 * It only works while it can be seen: off screen, faded out, or in a hidden tab the
 * frame loop and the video stop, and pick up again where they left off.
 * With reduced motion it draws one still frame.
 *
 * No voice here. `energy` stands in for loudness: idle breathing, a little
 * more when she is "thinking", more again when "listening".
 */
window.YaraOrb = (function () {
  var ENERGY = { idle: 0.12, thinking: 0.32, listening: 0.5, speaking: 0.45 };

  function create(opts) {
    var host = opts.host, size = opts.size || 284, color = opts.color || [90, 170, 255];
    var S = 284, s = size / S;
    var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    host.innerHTML = '';
    host.style.cssText += 'position:relative;width:' + size + 'px;height:' + size + 'px;display:grid;place-items:center;';
    var line = document.createElement('div');
    line.style.cssText = 'position:absolute;border-radius:50%;width:' + Math.round(292 * s) + 'px;height:' + Math.round(292 * s) + 'px;border:1px solid rgba(120,180,255,.4)';
    var bound = document.createElement('div');
    bound.style.cssText = 'position:absolute;border-radius:50%;width:' + size + 'px;height:' + size + 'px;overflow:hidden;display:grid;place-items:center;isolation:isolate';

    // the backing store: the haze keeps the screen's sharpness (max 2x); the tendrils are blurred, so 1x is plenty
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    // the blur used to be applied in canvas pixels (7 at 1x, 3.5 css px at 2x): keep exactly that look per screen
    var blur = +(7 / dpr).toFixed(2);
    var cv = document.createElement('canvas');
    cv.style.cssText = 'position:absolute;border-radius:50%;width:' + size + 'px;height:' + size + 'px';
    var tv = document.createElement('canvas');
    tv.style.cssText = 'position:absolute;border-radius:50%;width:' + size + 'px;height:' + size + 'px;' +
      'filter:blur(' + (blur * s).toFixed(2) + 'px);mix-blend-mode:plus-lighter';
    var mask = 'radial-gradient(circle closest-side, rgba(0,0,0,0) 37%, #000 41%, #000 65%, rgba(0,0,0,.35) 71%, rgba(0,0,0,0) 78%)';
    var video = document.createElement('video');
    video.muted = true; video.loop = true; video.playsInline = true; video.autoplay = false; video.preload = 'auto';
    video.src = opts.src || 'assets/orb.mp4';
    video.style.cssText = 'position:relative;width:' + size + 'px;height:' + size + 'px;border-radius:50%;object-fit:cover;mix-blend-mode:screen;' +
      'filter:contrast(1.18) brightness(1.06) saturate(1.1);-webkit-mask-image:' + mask + ';mask-image:' + mask;
    bound.appendChild(cv); bound.appendChild(tv); bound.appendChild(video);
    host.appendChild(line); host.appendChild(bound);

    cv.width = S * dpr; cv.height = S * dpr;
    var ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
    tv.width = S; tv.height = S;
    var tx = tv.getContext('2d');
    var C = S / 2, R_OUT = C * 0.64;
    var cr = color[0], cg = color[1], cb = color[2];
    var T = 120, t = 0;
    function seed(i) { var j = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return j - Math.floor(j); }
    var tend = [];
    for (var i = 0; i < T; i++) tend.push({
      th: (i / T) * Math.PI * 2 + (seed(i) - 0.5) * 0.1, len: 0.45 + seed(i + 7) * 0.55, w: 7 + seed(i + 13) * 12,
      drift: (seed(i + 21) - 0.5) * 0.12, flick: 0.25 + seed(i + 31) * 0.5 });
    var state = 'idle', energy = ENERGY.idle, target = ENERGY.idle;
    var rgb = cr + ',' + cg + ',' + cb, hot = (cr + 20) + ',' + (cg + 20) + ',255';

    function render() {
      ctx.clearRect(0, 0, S, S);
      var haze = ctx.createRadialGradient(C, C, R_OUT - 4, C, C, R_OUT + 36);
      haze.addColorStop(0, 'rgba(' + rgb + ',' + (0.18 + energy * 0.25).toFixed(3) + ')');
      haze.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.fillStyle = haze; ctx.beginPath(); ctx.arc(C, C, R_OUT + 36, 0, Math.PI * 2);
      ctx.arc(C, C, R_OUT - 4, 0, Math.PI * 2, true); ctx.fill('evenodd');

      tx.clearRect(0, 0, S, S);
      tx.globalCompositeOperation = 'lighter'; tx.lineCap = 'round';
      for (var k = 0; k < T; k++) {
        var d = tend[k];
        var th = d.th + t * 0.035 + Math.sin(t * d.drift * 2 + d.th * 3) * 0.09;
        var breathe = 0.7 + 0.3 * Math.sin(t * d.flick + d.th * 5);
        var reach = d.len * breathe * (16 + 18 * energy);
        var alpha = (0.12 + 0.16 * energy) * (0.6 + 0.4 * d.len);
        var r0 = R_OUT - 6, r1 = R_OUT + reach;
        var x0 = C + Math.cos(th) * r0, y0 = C + Math.sin(th) * r0, x1 = C + Math.cos(th) * r1, y1 = C + Math.sin(th) * r1;
        var lg = tx.createLinearGradient(x0, y0, x1, y1);
        lg.addColorStop(0, 'rgba(' + hot + ',' + alpha.toFixed(3) + ')');
        lg.addColorStop(0.5, 'rgba(' + rgb + ',' + (alpha * 0.5).toFixed(3) + ')');
        lg.addColorStop(1, 'rgba(' + rgb + ',0)');
        tx.strokeStyle = lg; tx.lineWidth = d.w * 0.8;
        tx.beginPath(); tx.moveTo(x0, y0); tx.lineTo(x1, y1); tx.stroke();
      }
      tx.globalCompositeOperation = 'source-over';
    }

    /* the loop: runs only while wanted; time and energy move by real elapsed time (capped), so
       a 120Hz screen breathes at the same speed and a resume carries on without a jump */
    var raf = 0, last = 0, lastCheck = 0, poll = 0, dead = false;
    var inView = true, faded = false, held = false;
    function frame(now) {
      raf = requestAnimationFrame(frame);
      var dt = last ? Math.min(Math.max((now - last) / 1000, 0), 1 / 30) : 1 / 60;
      last = now;
      t += dt;
      energy += (target - energy) * (1 - Math.pow(0.96, dt * 60));
      render();
      // faded out by the page (opacity 0 / visibility hidden) while still in view: stop, and look again later
      if (now - lastCheck > 500) { lastCheck = now; if (hiddenByStyle()) { faded = true; update(); } }
    }
    function hiddenByStyle() {
      return !!host.checkVisibility && !host.checkVisibility({ opacityProperty: true, visibilityProperty: true });
    }
    function lookAgain() {
      poll = 0;
      if (dead || !faded) return;
      if (!inView || document.hidden || held) return;   // update() re-polls once those clear
      if (hiddenByStyle()) { poll = setTimeout(lookAgain, 400); return; }
      faded = false; update();
    }
    function update() {
      if (dead) return;
      var want = !reduce && inView && !document.hidden && !held && !faded;
      if (want && !raf) {
        last = 0; lastCheck = performance.now();
        raf = requestAnimationFrame(frame);
        var p = video.play(); if (p && p.catch) p.catch(function () {});
      } else if (!want && raf) {
        cancelAnimationFrame(raf); raf = 0;
        video.pause();
      }
      if (faded && !poll && inView && !document.hidden && !held) poll = setTimeout(lookAgain, 400);
    }

    render();
    var io = null;
    if (!reduce && window.IntersectionObserver) {
      io = new IntersectionObserver(function (entries) {
        inView = entries[entries.length - 1].isIntersecting;
        if (inView && faded) { faded = false; }   // back on screen: check again from scratch
        update();
      }, { rootMargin: '100px' });
      io.observe(host);
    }
    function onVis() { update(); }
    document.addEventListener('visibilitychange', onVis);
    update();

    function still() { if (reduce && !dead) { energy = target; render(); } }
    return {
      setState: function (name) {
        var next = ENERGY[name] != null ? ENERGY[name] : ENERGY.idle;
        state = name; if (next !== target) { target = next; still(); }
      },
      getState: function () { return state; },
      setEnergy: function (v) {
        var next = Math.max(0, Math.min(1, v));
        if (next !== target) { target = next; still(); }
      },
      pause: function () { held = true; update(); },
      resume: function () { held = false; faded = false; clearTimeout(poll); poll = 0; update(); },   // the page says it is shown: start now, don't wait for the next look
      destroy: function () {
        dead = true;
        if (raf) cancelAnimationFrame(raf); raf = 0;
        clearTimeout(poll); if (io) io.disconnect();
        document.removeEventListener('visibilitychange', onVis);
        video.pause(); host.innerHTML = '';
      }
    };
  }
  return { create: create };
})();
