/* SPARK demo · the rules, with no server in them
 *
 * One JSON file per person, `leads/<pass>.json`, in a private bucket or in `data/leads/` on
 * boasis.ae itself: the form creates it, every step inside the Brain updates it, and a person
 * who walks away halfway leaves everything up to that point behind. Either way it is the same
 * file with the same shape, and it is meant to be read on its own: the name, the number, the
 * words they typed, and what the page said back, in one place. That is the plan's shape, and this file holds
 * every decision in it that is worth getting wrong or right: what counts as a person, what a
 * pass looks like, what a lead file contains, how a step merges, and when a pass expires.
 *
 * It is deliberately pure and synchronous. The Deno functions in the folders next door do
 * nothing but move bytes to and from Storage and call these, so the whole thing can be
 * tested in plain Node, which is what the night before an event allows.
 */

export const STEPS = ['describe', 'mira', 'activities', 'package'];
export const MAX_AGE_HOURS = 24;          // the plan asks 24h, listed as still to confirm
export const TOO_FAST_MS = 1200;          // nobody types four fields faster than this

/* No look-alike pairs: a pass read off a screen at a loud stand has to survive being typed. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makePass(random = Math.random) {
  let out = 'PASS';
  for (let i = 0; i < 8; i += 1) out += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return out;
}

export function isPass(pass) {
  return typeof pass === 'string' && /^PASS[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/.test(pass);
}

/* The same rule the site's own forms use: a leading zero typed for a local call is not part
   of the number, except where it is (+1, where it is a country code's own digit). */
const NO_TRUNK = new Set(['+1']);

export function phoneOf(code, raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  const c = /^\+\d{1,4}$/.test(String(code || '')) ? String(code) : '';
  if (!c) return d;
  return c + ' ' + (NO_TRUNK.has(c) ? d : d.replace(/^0+(?=\d)/, ''));
}

export function normaliseEmail(v) {
  return String(v || '').trim().toLowerCase();
}

/* ── the form ──────────────────────────────────────────────────────────────────
 * Returns the contact part, or a reason. The reasons are short codes: the page turns them
 * into sentences, the logs keep them exact.
 */
export function readForm(body) {
  const b = body && typeof body === 'object' ? body : {};
  if (String(b.hp || '').trim()) return { ok: false, error: 'bot' };
  if (Number(b._t) > 0 && Number(b._t) < TOO_FAST_MS) return { ok: false, error: 'too-fast' };

  const name = String(b.full_name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const email = normaliseEmail(b.email).slice(0, 254);
  const digits = String(b.phone || '').replace(/\D/g, '');
  const code = /^\+\d{1,4}$/.test(String(b.country_code || '')) ? String(b.country_code) : '';
  const phone = phoneOf(b.country_code, b.phone);

  if (name.length < 2) return { ok: false, error: 'full_name' };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, error: 'email' };
  if (digits.length < 6 || digits.length > 15) return { ok: false, error: 'phone' };
  if (b.consent !== true && b.consent !== 'true' && b.consent !== 'on') return { ok: false, error: 'consent' };

  const residence = b.residence === 'uae' || b.residence === 'abroad' ? b.residence : '';
  return {
    ok: true,
    contact: {
      full_name: name,
      email,
      phone,
      country_code: code,
      residence,
      consent: true,
    },
  };
}

export function buildLead({ pass, contact, source, now }) {
  const at = new Date(now).toISOString();
  return {
    pass,
    version: 1,
    created_at: at,
    updated_at: at,
    expires_at: new Date(now + MAX_AGE_HOURS * 3600 * 1000).toISOString(),
    source: String(source || 'ai-everything-2026').slice(0, 40),
    contact,
    brain: { steps_reached: [], description: '', mira: [], activities: {}, package: {}, log: [], output: {} },
  };
}

/* ── a step from the Brain ─────────────────────────────────────────────────────
 * Additive on purpose. The Brain UI writes after each step and nothing else writes at the
 * same moment for the same person, so a merge that never deletes is enough to guarantee the
 * one thing the plan asks: whatever has happened so far is in the file.
 */
export function applyStep(lead, step, data, now) {
  if (!lead || typeof lead !== 'object') return null;
  if (!STEPS.includes(step)) return null;
  const out = JSON.parse(JSON.stringify(lead));
  const at = new Date(now).toISOString();
  const b = out.brain || (out.brain = { steps_reached: [], description: '', mira: [], activities: {}, package: {}, log: [], output: {} });
  if (!Array.isArray(b.log)) b.log = [];
  if (!b.output || typeof b.output !== 'object') b.output = {};
  const d = data && typeof data === 'object' ? data : {};

  if (step === 'describe') {
    b.description = String(d.description || d.text || '').slice(0, 4000);
  } else if (step === 'mira') {
    const turn = {
      at,
      question: String(d.question || '').slice(0, 2000),
      answer: String(d.answer || '').slice(0, 4000),
    };
    b.mira = [...(b.mira || []), turn].slice(-40);      // a stand conversation, not an archive
  } else if (step === 'activities') {
    b.activities = {
      shown: Array.isArray(d.shown) ? d.shown.map(x => String(x).slice(0, 80)).slice(0, 40) : (b.activities || {}).shown || [],
      picked: Array.isArray(d.picked) ? d.picked.map(x => String(x).slice(0, 80)).slice(0, 40) : (b.activities || {}).picked || [],
      confirmed: d.confirmed === true ? true : !!((b.activities || {}).confirmed),
    };
  } else if (step === 'package') {
    b.package = {
      shareholders: Array.isArray(d.shareholders) ? d.shareholders.map(x => String(x).slice(0, 120)).slice(0, 20) : (b.package || {}).shareholders || [],
      visas: Array.isArray(d.visas) ? d.visas.map(x => String(x).slice(0, 120)).slice(0, 20) : (b.package || {}).visas || [],
      premises: String(d.premises || (b.package || {}).premises || '').slice(0, 200),
      price_aed: Number.isFinite(Number(d.price_aed)) ? Number(d.price_aed) : (b.package || {}).price_aed ?? null,
      confirmed: d.confirmed === true ? true : !!((b.package || {}).confirmed),
    };
  }

  /* what the person put in and what the page gave back, kept as it happened, next to the tidy
     fields above. The four branches keep the parts an advisor reads; this keeps the exchange,
     so one file is the whole visit rather than half of it. The caps are the size of a stand
     conversation, and they are what stops one file growing without limit. */
  if (Array.isArray(d.log)) {
    const added = d.log.slice(-20).map(e => {
      const x = e && typeof e === 'object' ? e : {};
      return { at: String(x.at || at).slice(0, 40), in: String(x.in || '').slice(0, 1200), out: String(x.out || '').slice(0, 6000) };
    }).filter(e => e.in || e.out);
    b.log = [...b.log, ...added].slice(-60);
  }
  if (d.output !== undefined) b.output[step] = String(d.output).slice(0, 6000);

  if (!b.steps_reached.includes(step)) b.steps_reached.push(step);
  b.last_step = step;
  out.updated_at = at;
  out.version = (out.version || 0) + 1;
  return out;
}

export function isExpired(lead, now) {
  if (!lead || !lead.expires_at) return true;
  return Date.parse(lead.expires_at) <= Number(now);
}

/* The pass is the whole credential, so the file an unknown or expired pass points at is
   never created, read or overwritten on its behalf. */
export function checkPass(pass, lead, now) {
  if (!isPass(pass)) return { ok: false, error: 'pass' };
  if (!lead) return { ok: false, error: 'unknown' };
  if (isExpired(lead, now)) return { ok: false, error: 'expired' };
  return { ok: true, lead };
}
