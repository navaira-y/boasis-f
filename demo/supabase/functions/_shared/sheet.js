/* the sheet hook · one row per person in the stand's Google sheet, with one cell per field
 *
 * The Brain writes its whole visit into the row's `data` column as one object, which is right for a
 * database and useless in a spreadsheet: an export gives you one cell with the entire visit in it.
 * So this file opens that object and hands the sheet named values instead, one per column, and a
 * second tab of plain question and answer lines. Nothing here changes what the Brain writes or how,
 * and nothing here needs a new column: the row already holds everything.
 *
 * Who sends what. `create-pass` sends the form half the moment a pass is minted, `save-step` sends
 * the whole thing after every step the person finishes, and `save-lead` sends the form half for a
 * page that never reaches Mira, and every one of them asks leave of the same list below, so a lead
 * from the website never appears in a sheet about an event. Three senders, one row, because the sheet
 * keys on the address and only ever fills in what a sender actually carries: it never clears a cell it
 * has nothing about. A
 * dropped write therefore repairs itself on the next step, which is why there is no retry queue and
 * no replay script here: four chances per visit is more than enough and a queue is a thing to feed.
 *
 * Failure is silent on purpose, in the visitor's direction. A sheet that is slow, full, or deleted
 * must not be able to cost a lead or freeze a step, so every call is one try, three and a half
 * seconds, and a log line. The row in Supabase is the record, the sheet is the view.
 */

function hostOf(u) {
  const m = /^[a-z]+:\/{2}([^/?#]+)/i.exec(String(u || ''));
  return m ? m[1] : 'bad address ' + snip(u, 40);
}

/* what happened, said out loud, whether anybody asked or not. Silence here cost an evening: a hook
   that only logs when a caller hands it a logger is a hook that never logs, because the callers are small
   and busy, and the person debugging at 11pm opens the function's Logs tab and finds `booted`,
   `shutdown`, and no word at all about the sheet. console.log inside an Edge Function lands in that tab. */
function say(o, line) {
  if (o && typeof o.log === 'function') { o.log(line); return }
  try { console.log(line) } catch { /* a runtime without a console has nowhere to put it anyway */ }
}

const CLIP = 900;                 // one cell of prose, which is a long answer and a short lead
const SHORT = 220;                // one item inside a list that goes in a cell
const MAX_ANSWERS = 40;           // one visit at a stand is four or five, this is the runaway guard
const TIMEOUT_MS = 3500;

/* Only the stand's own rows. These three functions serve the website and the event at once, and the
   boss's sheet is a list of the people who walked up to a desk at Sharjah Next, so a lead from boasis.ae has
   no business in it: neither the visitor's, nor ours. Which entrance a row came from is not a field a
   lead carries, it is the table it was written to, so the caller who knows that hands it over and this
   is the one place the rule lives. A missing name means nobody said which door, and the quiet answer
   to that is the safe one: no cell is touched for a stranger. */
export const STAND_TABLES = new Set(['sharjah_next_passes', 'sharjah_next_leads']);

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const snip = (v, n = CLIP) => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : String(v);
  return s.length > n ? s.slice(0, n) : s;
};
/* lists are what a sheet wants least, so a list becomes one readable line rather than JSON: a
   person reading the cell should not need to know what a bracket is */
const list = v => Array.isArray(v) ? v.map(x => snip(isObj(x) ? (x.name || x.title || x.label || JSON.stringify(x)) : x, SHORT)).filter(Boolean).join(', ') : snip(v, SHORT);
const yes = v => v === true || v === 'true' || v === 'on' ? 'yes' : v === false || v === 'false' || v === 'off' ? 'no' : '';

export function envOf(names) {
  /* Deno's environment is an object you ask, not a box you index: `Deno.env.SHEET_HOOK_URL` is
     undefined in the cloud and `process.env.SHEET_HOOK_URL` is a value in the tests, which is the most
     expensive kind of bug there is, the one that only appears where the secrets actually live. So: ask
     with get when there is a get, and only reach for the box when there is no other way. */
  const deno = typeof Deno !== 'undefined' && Deno.env && typeof Deno.env.get === 'function' ? Deno.env : null;
  const box = typeof process !== 'undefined' && process.env ? process.env : null;
  for (const n of names) {
    const v = deno ? deno.get(n) : (box ? box[n] : '');
    if (v) return String(v).trim();
  }
  return '';
}

/* ── the words the sheet is built from ───────────────────────────────────────────
   These names are the contract between here and the script in the sheet, and they are the only
   thing either side knows about the other. Which of them become columns, in what order, and what
   the header says is the sheet's business alone, so adding a column to what the boss reads is a
   line in that file and never a redeploy of a function.
*/
export function fieldsFromLead(lead) {
  const l = isObj(lead) ? lead : {};
  const c = isObj(l.contact) ? l.contact : {};
  const b = isObj(l.brain) ? l.brain : {};
  const p = isObj(b.package) ? b.package : {};
  const steps = Array.isArray(b.steps_reached) ? b.steps_reached : [];
  const f = {
    ref: snip(l.ref || '', 40),
    at: snip(l.created_at || '', 40),
    updated: snip(l.updated_at || '', 40),
    full_name: snip(c.full_name, 120),
    email: snip(c.email, 254),
    phone: snip(c.phone, 40),
    country_code: snip(c.country_code, 8),
    residence: snip(c.residence, 20),
    consent: yes(c.consent),
    source: snip(l.source, 60),
    last_step: snip(b.last_step, 20),
    steps_done: steps.length,
    steps_reached: list(steps),
    turns: Number.isFinite(Number(b.log?.length)) || Number.isFinite(Number(b.mira?.length))
      ? Number(b.log?.length || 0) + Number(b.mira?.length || 0) : '',
    described: snip(b.description, CLIP),
    activities_shown: Array.isArray(b.activities?.shown) ? b.activities.shown.length : '',
    activities_picked: list(b.activities?.picked),
    activities_confirmed: b.activities && b.activities.confirmed === true ? 'yes' : '',
    package: snip(p.name || p.pack || (p.confirmed === true ? 'chosen' : ''), 120),
    package_confirmed: p.confirmed === true ? 'yes' : '',
    price_aed: Number.isFinite(Number(p.price_aed)) ? Number(p.price_aed) : '',
    visas: list(p.visas),
    shareholders: list(p.shareholders),
    premises: snip(p.premises, 120),
    frozen: b.frozen === true ? 'yes' : '',
  };
  /* an empty string means "this sender does not know", which the sheet reads as "leave the cell
     alone", so a half finished visit never erases a finished one and a late form write never
     erases the steps */
  return f;
}

/* the questions the person asked Mira and the answers they got back, oldest first, in the shape the second
   tab wants: `at` is what the Brain stamped it with, `q` and `a` are the two cells */
export function answersFromLead(lead) {
  const b = (isObj(lead) && isObj(lead.brain)) ? lead.brain : {};
  const out = [];
  for (const m of (Array.isArray(b.mira) ? b.mira : [])) {
    if (!isObj(m)) continue;
    out.push({ at: snip(m.at, 40), q: snip(m.question, CLIP), a: snip(m.answer, CLIP) });
  }
  /* the log is what the Brain kept before there was a mira list, and some flows still write only
     that one: same two cells, taken from the pair it holds */
  if (!out.length) {
    for (const m of (Array.isArray(b.log) ? b.log : [])) {
      if (!isObj(m)) continue;
      out.push({ at: snip(m.at, 40), q: snip(m.in, CLIP), a: snip(m.out, CLIP) });
    }
  }
  return out.slice(0, MAX_ANSWERS);
}

/* the form half, from the record the site mirrors: no pass, no steps, everything a stand wants to
   see before anybody has spoken to Mira */
export function fieldsFromRecord(record) {
  const r = isObj(record) ? record : {};
  const f = {
    ref: snip(r.ref || '', 40),
    at: snip(r.at || '', 40),
    full_name: snip(r.full_name || r.name, 120),
    email: snip(r.email, 254),
    phone: snip(r.phone, 40),
    country_code: snip(r.country_code, 8),
    residence: snip(r.residence, 20),
    consent: yes(r.consent),
    source: snip(r.source, 60),
  };
  return f;
}

/* one object per push: who it is about, the named values, and the Q and A lines. `key` is what the
   script finds the row by, and it is the address, because that is the one field every sender here
   carries and the only one a person at a stand is certain about. */
/* Two things are deliberately absent from every payload: the pass, which is a key into that persons
   conversation and has no business sitting in a file on a laptop, and the email hash, which is
   nothing but a second way to match the same person. The sheet gets names, numbers, and words. */
export function payloadFor({ email, fields, answers }) {
  const key = snip(email || fields?.email || '', 254).toLowerCase();
  const body = { key, fields: fields || {} };
  if (Array.isArray(answers) && answers.length) body.answers = answers;
  return body;
}

/* the call itself, and everything that makes it safe to fire from a door a visitor is waiting on:
   one try, a short clock, an answer nobody reads, and a result for the log rather than a throw */
export async function pushSheet(body, o = {}) {
  const url = o.url || envOf(['SHEET_HOOK_URL']);
  const key = o.key || envOf(['SHEET_HOOK_KEY']);
  if (!url || !key) return { ok: false, why: 'off' };
  const fetchImpl = o.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') return { ok: false, why: 'off' };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), o.timeout || TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      /* the secret travels in the body: a web app published from a sheet sees query strings in
         Googles own access logs, and it cannot be asked to read a custom header, so the body is
         the one place it is neither logged by us nor readable by a browser that stumbles on the
         address */
      body: JSON.stringify({ secret: key, ...body }),
      signal: ctl.signal,
    });
    if (!res.ok) return { ok: false, why: 'http ' + res.status + ' to ' + hostOf(url) };
    /* An Apps Script web app answers 200 for everything, including the time it refused us and the
       time Google intercepted it to ask for permission nobody granted. So "200" is not an answer, the
       body is: read it, and if it is not the JSON our own file writes, say so, because a log line that
       flatters us while the sheet stays empty is the one thing a stand cannot afford to read. */
    let text = '';
    try { text = typeof res.text === 'function' ? await res.text() : ''; } catch { text = '' }
    if (!text) return { ok: true };
    let said = null;
    try { said = JSON.parse(text); } catch { said = null }
    if (!said) return { ok: false, why: 'not json, page says: ' + snip(text.replace(/<[^>]*>/g, ' '), 70) + ' to ' + hostOf(url) };
    if (said.ok) return { ok: true };
    return { ok: false, why: 'refused: ' + snip(said.why || 'no reason', 40) + ' to ' + hostOf(url) };
  } catch (e) {
    return { ok: false, why: (e && e.name === 'AbortError') ? 'timeout' : snip(e && e.message, 80) };
  } finally {
    clearTimeout(timer);
  }
}

/* the one call each door makes, so nothing in those files has to know what a payload is */
export async function pushLeadToSheet(lead, o = {}) {
  if (!STAND_TABLES.has(String(o.table || ''))) {
    say(o, 'sheet skipped: not the stand');
    return { ok: true, skipped: 'not the stand' };
  }
  const r = await pushSheet(payloadFor({
    email: lead && lead.contact ? lead.contact.email : '',
    fields: fieldsFromLead(lead),
    answers: answersFromLead(lead),
  }), o);
  say(o, 'sheet ' + (r.ok ? 'written to ' + o.table : 'skipped: ' + r.why));
  return r;
}

export async function pushRecordToSheet(record, o = {}) {
  if (!STAND_TABLES.has(String(o.table || ''))) {
    say(o, 'sheet skipped: not the stand');
    return { ok: true, skipped: 'not the stand' };
  }
  const r = await pushSheet(payloadFor({
    email: record && record.email ? record.email : '',
    fields: fieldsFromRecord(record),
  }), o);
  say(o, 'sheet ' + (r.ok ? 'written to ' + o.table : 'skipped: ' + r.why));
  return r;
}
