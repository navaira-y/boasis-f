/* SPARK · the two lines brain.boasis.ae needs
 *
 * What this is. One small module, no dependencies, no framework, no key. It does three things and
 * nothing else: it reads the pass that the SPARK page hands over, it tells you whether you are
 * inside that page, and it writes each step back so the stand has one row per person.
 *
 * Where it goes in your repo. Anywhere your app code can import it. `src/lib/spark-embed.js` is a
 * fine name. It is not served by boasis.ae, it is only in this repo so you can take it.
 *
 * The four edits, in order, and they are all of it.
 *
 *   1. Import it at your app entry and call `initSpark()` once, before you render.
 *        import { initSpark } from './lib/spark-embed.js';
 *        const spark = initSpark();
 *
 *   2. If `spark.embed` is true, hide your own chrome. The call below already sets
 *      `data-spark="embed"` on your `<html>`, so one rule in your stylesheet is enough:
 *        html[data-spark="embed"] .site-header,
 *        html[data-spark="embed"] .site-nav,
 *        html[data-spark="embed"] .site-footer { display: none !important; }
 *
 *   3. After each step, hand us what happened. Four calls, one per step:
 *        await spark.save('describe', { description });
 *        await spark.turn(question, answer, output);        // the 'mira' step
 *        await spark.save('activities', { shown, picked, confirmed: true });
 *        await spark.save('package', { shareholders, visas, premises, price_aed, confirmed: true });
 *      `spark.save` never throws. If the network is unhappy it answers `{ ok: false }` and your
 *      journey carries on, which is the behaviour you want in front of a visitor.
 *
 *   4. On load, when `spark.active` is true, ask where this person stopped:
 *        const lead = await spark.resume();
 *        // lead.brain.steps_reached is the steps already saved, lead.brain.description their text
 *        // lead.contact is { full_name, email, phone, country_code, residence }
 *      Send them to the first step that is not in that list instead of to step one.
 *
 * What is NOT here, on purpose. No login, no account, no cookie, no session, no database of yours,
 * no Supabase client, no API key. Do not add any of those for this. The pass is the whole
 * credential, and it must not be logged: keep it out of your request logs, your error reporter and
 * your analytics, because anyone holding it can read and write that one person's row for 24 hours.
 *
 * And one line in your server config, so our page is allowed to frame yours:
 *
 *   Content-Security-Policy: frame-ancestors https://boasis.ae
 *
 * on the framed route, with no `X-Frame-Options` header on that route. HOW-TO-ADD.md next to this
 * file shows the exact snippet for Next, nginx, Vite and Express.
 */

/* The project the demo talks to. It is a public address, not a secret, and it is the only line in
   this file you would ever change. If you would rather read it from your build, set
   `window.SPARK = { base: 'https://…' }` before this module runs, or edit the default. */
const BASE =
  (typeof window !== 'undefined' && window.SPARK && window.SPARK.base) ||
  'https://grsbhupjihwvidxbkymu.supabase.co';

/* `PASS` and eight characters, no look-alikes. Anything else is not ours and must be ignored. */
const PASS_RE = /^PASS[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

/* The four steps we accept, and how far each field is cut before it leaves you. The server cuts
   them again, so these are only so a long paste cannot make the request slow. */
const LIMITS = {
  describe: { description: 4000 },
  mira: { question: 2000, answer: 4000, output: 6000 },
  activities: { shown: 40, picked: 40, text: 80 },
  package: { list: 20, text: 200, premises: 200 },
};

const SESSION_KEY = 'spark.embed.v1';

function cut(v, n) {
  return typeof v === 'string' ? v.slice(0, n) : '';
}

function tidy(step, data) {
  const d = data && typeof data === 'object' ? data : {};
  const L = LIMITS[step] || {};
  if (step === 'describe') return { description: cut(d.description || d.text || '', L.description || 4000) };
  if (step === 'mira') {
    const out = { question: cut(d.question || '', L.question), answer: cut(d.answer || '', L.answer) };
    if (d.output !== undefined) out.output = cut(String(d.output), L.output);
    if (Array.isArray(d.log)) {
      out.log = d.log.slice(-20).map((e) => ({
        at: (e && e.at) || new Date().toISOString(),
        in: cut(String((e && e.in) || ''), 1200),
        out: cut(String((e && e.out) || ''), 6000),
      }));
    }
    return out;
  }
  if (step === 'activities') {
    const list = (v) => (Array.isArray(v) ? v.slice(0, L.shown).map((x) => String(x).slice(0, L.text)) : undefined);
    const out = {};
    const shown = list(d.shown);
    const picked = list(d.picked);
    if (shown) out.shown = shown;
    if (picked) out.picked = picked;
    out.confirmed = d.confirmed === true;
    return out;
  }
  if (step === 'package') {
    const list = (v) => (Array.isArray(v) ? v.slice(0, L.list).map((x) => String(x).slice(0, L.text)) : []);
    return {
      shareholders: list(d.shareholders),
      visas: list(d.visas),
      premises: cut(String(d.premises || ''), L.premises),
      price_aed: Number.isFinite(Number(d.price_aed)) ? Number(d.price_aed) : null,
      confirmed: d.confirmed === true,
    };
  }
  return d;
}

export function initSpark() {
  let pass = '';
  let embed = false;
  try {
    const q = new URLSearchParams(window.location.search);
    const fromUrl = (q.get('pass') || '').toUpperCase();
    if (PASS_RE.test(fromUrl)) pass = fromUrl;
    embed = q.get('embed') === '1';
    if (!pass) {
      const kept = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || 'null');
      if (kept && PASS_RE.test(String(kept.pass || '').toUpperCase())) pass = kept.pass.toUpperCase();
    } else {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ pass }));
    }
    if (embed) document.documentElement.setAttribute('data-spark', 'embed');
  } catch (e) {
    /* private mode, a blocked storage, no window: the app must behave exactly as it does today */
    pass = '';
  }

  const send = async (method, url, body) => {
    if (!pass) return { ok: false, error: 'no-pass' };
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
        keepalive: true,          // so a step still lands if they close the tab right after it
      });
      const json = await res.json().catch(() => ({}));
      return json && typeof json === 'object' ? json : { ok: false, error: 'response' };
    } catch (e) {
      return { ok: false, error: 'network' };
    }
  };

  return {
    get pass() { return pass; },
    get embed() { return embed; },
    get active() { return !!pass; },

    /* After a step. Answers { ok: true, version, steps_reached } on a good write, and something
       with ok:false otherwise. It never throws, so wrap nothing around it. */
    save(step, data) { return send('POST', BASE + '/functions/v1/save-step', { pass, step, data: tidy(step, data) }); },

    /* The Mira step, written the way the row keeps a stand conversation. */
    turn(question, answer, output) {
      return this.save('mira', {
        question,
        answer,
        output,
        log: [{ at: new Date().toISOString(), in: question, out: answer }],
      });
    },

    /* Where this person stopped. null means "start at the beginning", which is also the answer for
       a pass we do not know or one that expired. */
    async resume() {
      const r = await send('GET', BASE + '/functions/v1/get-lead?pass=' + encodeURIComponent(pass));
      return r && r.ok ? r.lead : null;
    },

    /* The steps already saved, so a reload can jump to the right one. */
    async reached() {
      const lead = await this.resume();
      return (lead && lead.brain && lead.brain.steps_reached) || [];
    },
  };
}
