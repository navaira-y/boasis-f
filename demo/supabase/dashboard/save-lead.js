/* save-lead · one file, to paste into the Supabase dashboard
 *
 * GENERATED, do not edit this copy. scripts/make-supabase-single.js writes it from
 * demo/supabase/functions/save-lead/index.js, which is the whole function as written there. It needs
 * no folder beside it and imports nothing from one, so this file and that one are the same code and
 * a test recomposes it and fails if the two ever disagree.
 *
 * Run it: Supabase dashboard → your project → Edge Functions → save-lead → paste → Save, and
 * "Deploy" if it asks. Then the secrets below, on Project Settings → Edge Functions → Secrets, or
 * in the function's own page, and nothing is set in the code.
 *
 * Secrets this one reads (5): SPARK_SUPABASE_URL, SPARK_SERVICE_ROLE_KEY, LEADS_PUSH_KEY, SHEET_HOOK_URL, SHEET_HOOK_KEY
 *   SPARK_SUPABASE_URL and SPARK_SERVICE_ROLE_KEY are the pair the other functions already have, so
 *   on a project that has run the SPARK setup there is one new value here, LEADS_PUSH_KEY.
 *   Set it to a long random string, put the same string in LEADS_PUSH_KEY on boasis.ae, and the
 *   mirror writes. Leave it unset on either side and the site goes on storing its JSON files alone:
 *   this door answers 500 config, and a visitor never hears about it.
 *   The service key can read and write anywhere in the project, which is why the table
 *   has row level security enabled with no policies: the anon key that a browser holds gets nothing.
 *   This key stays in the function and is never in the page, never in the Brain, never in the repo.
 */
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ── inlined from _shared/sheet.js, as written there ── */

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
const STAND_TABLES = new Set(['sharjah_next_passes', 'sharjah_next_leads']);

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

function envOf(names) {
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
function fieldsFromLead(lead) {
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
function answersFromLead(lead) {
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
function fieldsFromRecord(record) {
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
function payloadFor({ email, fields, answers }) {
  const key = snip(email || fields?.email || '', 254).toLowerCase();
  const body = { key, fields: fields || {} };
  if (Array.isArray(answers) && answers.length) body.answers = answers;
  return body;
}

/* the call itself, and everything that makes it safe to fire from a door a visitor is waiting on:
   one try, a short clock, an answer nobody reads, and a result for the log rather than a throw */
async function pushSheet(body, o = {}) {
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
async function pushLeadToSheet(lead, o = {}) {
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

async function pushRecordToSheet(record, o = {}) {
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

/* save-lead · the site's form sign-ups, kept in a table as well as a file
 *
 * Two tables answer this one door: site_leads for the website's own forms, sharjah_next_leads for
 * the Sharjah Next stand. The kind picks it, from the list below, and nothing else.
 *
 * boasis.ae posts here after it has already written its own copy, so this is the one that a deploy
 * cannot lose and that the dashboard can hand you as a CSV. Five kinds come through: the early
 * access form, the two dialogs on the home page, the contact form, and the Sharjah Next stand page. The whole record arrives as
 * JSON and is stored as JSON, with the few columns beside it that you actually sort and filter on,
 * written from that same object rather than from anything the caller claims.
 *
 * It is not a public inbox. Every call has to carry the shared key, in a header or in the body, and
 * a call without it gets 401 and writes nothing. The key is a secret on this side and an environment
 * variable on the site, and it never appears in a page, in the Brain, or in the repo. With the
 * secret missing here the door refuses everything, because an open write endpoint on a table of
 * names, emails and phone numbers is a spam queue within the hour.
 *
 * Append only, on purpose: this door inserts, never updates, so the last word on a person stays
 * the site's own file and the table remains the history.
 *
 * One way it reads: `action: 'watch'` answers what the Sharjah Next mail watch needs to know before it mails
 * anybody, which is whether the Brain has finished with this visitor's row and whether the sheet says yes to
 * the payment.
 * It is given `want`, a list of `{ ref, pass }` pairs, and it reads the pass table by the pass, because that
 * is the key and the Brain updates that one row rather than adding another.
 * No kind and no record are wanted on that path, nothing is inserted, and the answer is three words per
 * reference. The same shared key guards it, because a read of who has paid is not a thing to leave open.
 *
 * Secrets: SPARK_SUPABASE_URL, SPARK_SERVICE_ROLE_KEY, LEADS_PUSH_KEY, SHEET_HOOK_URL, SHEET_HOOK_KEY.
 * No salt, no Brain address, no
 * origin list, since a browser is never supposed to reach this door at all.
 */

/* ── the read the mail watch asks for ──────────────────────────────────────────
   boasis.ae is the only thing that calls this way, with the same key it pushes with, and it asks one
   question per reference: has the conversation been written down, and has the money been ticked off. The
   first answer is in this project, the second is read out of the sheet through the same door that writes
   into it, because a yes typed at the counter exists nowhere else in the world. Nothing is written on this
   path, so the door that reads can never be the door that writes by accident. */
/* the visit is answered by their own applications table, `sharjah_next_applications`: one row per
   application, keyed by the same reference the stand holds, where `submitted_at` is written exactly once when
   the final submit goes through and `status` moves to `submitted` at that same moment. Nothing earlier in the
   conversation touches either column. That table is theirs and this function only ever reads it. */
const APPS = "sharjah_next_applications";
const APPS_KEYS = ["reference", "ref", "lead_ref", "sharjah_ref", "application_ref"];
const APPS_DONE_STATUS = ["submitted", "paid"];
const WATCH_REFS = 40;          // references per question, which is a minute of a stand at the event's pace
const SCAN = 300;               // rows looked through when the column we guessed is not the column they made
const cut = (v, n) => String(v === null || v === undefined ? '' : v).slice(0, n);
const obj = v => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {});

async function askSheet(body, timeoutMs) {
  const url = String(Deno.env.get('SHEET_HOOK_URL') || '').replace(/\/+$/, '');
  const key = String(Deno.env.get('SHEET_HOOK_KEY') || '');
  if (!url || !key) return { ok: false, why: 'off' };
  /* longer than a write's timeout on purpose: a spreadsheet is slow by definition, and a read that gives up
     early tells the watch to wait, which is the right answer only by luck */
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs || 9000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: key, ...body }),
      signal: ctl.signal,
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) return { ok: false, why: 'http ' + res.status };
    let said = null;
    try { said = JSON.parse(text); } catch { said = null }
    if (!said) return { ok: false, why: 'not json' };
    if (!said.ok) return { ok: false, why: 'refused: ' + cut(said.why || 'no reason', 40) };
    return { ok: true, said };
  } catch (e) {
    return { ok: false, why: (e && e.name) === 'AbortError' ? 'timeout' : cut(e && e.message, 60) };
  } finally {
    clearTimeout(timer);
  }
}

/* A finished application is not a step and not a flag on a pass. A person can reach the package step, see
   their offer, and walk away, and the pass row would still read as though the conversation ended well, which
   is why this used to be a step name and is now this row: `submitted_at` written once, or `status` at
   `submitted` or `paid`, both of which happen only at the final submit. The letter this triggers reads "your
   application is in", so it waits for the row that says exactly that and for nothing else. */
function submitted(row) {
  const at = row && row.submitted_at;
  if (at !== null && at !== undefined && String(at).trim() !== "") return true;
  return APPS_DONE_STATUS.indexOf(String((row && row.status) || "").trim().toLowerCase()) >= 0;
}

/* One read per pass of the watch, by reference, because that is the key they promised. The column name is
   guessed from the list above rather than assumed, and the answer is returned as soon as one of them exists,
   so an empty answer is an empty answer and not a failure to look. */
async function applicationsDone(sb, refs) {
  const done = new Set();
  if (!refs.size) return done;
  for (const col of APPS_KEYS) {
    let data = null, error = null;
    try {
      const said = await sb.from(APPS).select("*").in(col, [...refs]);
      data = said.data; error = said.error;
    } catch (e) { error = e; }
    if (error || !Array.isArray(data)) continue;
    for (const row of data) {
      const key = String(row[col] || "").trim().toUpperCase();
      if (key && refs.has(key) && submitted(row)) done.add(key);
    }
    return done;
  }
  /* none of those names answered, so the last honest look is at the recent rows, with the reference found
     inside them whatever the column is called. A key named unexpectedly should cost a deploy, not every
     visitor's letter. */
  try {
    const { data } = await sb.from(APPS).select("*").limit(SCAN);
    for (const row of (data || [])) {
      if (!submitted(row)) continue;
      for (const col of Object.keys(row)) {
        const key = String(row[col] || "").trim().toUpperCase();
        if (key && refs.has(key)) { done.add(key); break; }
      }
    }
  } catch (e) {
    console.log("watch could not read the applications table: " + cut(e && e.message, 60));
  }
  return done;
}

async function watchRows(sb, want) {
  const list = (Array.isArray(want) ? want : []).slice(0, WATCH_REFS)
    .map(w => ({ ref: cut(w && w.ref, 40).toUpperCase(), pass: cut(w && w.pass, 24) }))
    .filter(w => w.ref);
  const by = new Map(), byPass = new Map();
  for (const w of list) {
    const v = { ref: w.ref, pass: w.pass, brain: false, paid: '', known: false };
    by.set(w.ref, v);
    if (w.pass) byPass.set(w.pass, v);
  }
  if (!by.size) return { ok: true, rows: [] };

  /* the visit, in one read of their applications table */
  let done = new Set();
  try {
    done = await applicationsDone(sb, new Set(by.keys()));
  } catch (e) {
    console.log('watch could not read the applications: ' + cut(e && e.message, 60));
  }
  for (const [ref] of by) { if (done.has(ref)) by.get(ref).brain = true; }

  /* the sheet either answers or it does not. When it answers, every reference asked about is settled: a row
     that is not in the sheet is not paid, and that is the truth rather than a gap. When it does not answer,
     `known` stays false and the watch asks again in five minutes rather than mailing a stranger about money
     on the strength of a read that failed */
  const sheet = await askSheet({ action: 'status', refs: [...by.keys()] });
  if (sheet.ok) {
    for (const [, v] of by) v.known = true;
    const rows = Array.isArray(sheet.said.rows) ? sheet.said.rows : [];
    for (const r of rows) {
      const key = cut(obj(r).ref, 40).toUpperCase();
      if (by.has(key)) by.get(key).paid = cut(obj(r).paid, 12).trim().toLowerCase() === 'yes' ? 'yes' : 'no';
    }
  } else {
    console.log('watch could not read the sheet: ' + sheet.why);
  }
  return { ok: true, rows: [...by.values()], sheet: sheet.ok ? 'read' : sheet.why, visit: 'read' };
}

const TABLE = "site_leads";
const STAND = "sharjah_next_leads";        // the Sharjah Next stand keeps its own list, see below
const KINDS = ["early_access", "waitlist", "demo", "contact", "sharjah_next"];
const MAX_STR = 500;
const MAX_BODY = 16 * 1024;                 // one sign-up is a few hundred bytes; a megabyte is a caller mistake

function secret(...names) {
  for (const n of names) {
    const v = Deno.env.get(n);
    if (v) return v;
  }
  return "";
}

function client() {
  const url = secret("SPARK_SUPABASE_URL", "SUPABASE_URL");
  const key = secret("SPARK_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("set SPARK_SUPABASE_URL and SPARK_SERVICE_ROLE_KEY as Edge Function secrets");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/* compared by hand, so a wrong key costs the same time as a nearly right one */
function matches(got, want) {
  const a = String(got || ""), b = String(want || "");
  if (a.length !== b.length || !b) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const clip = (v) => {
  if (v === null || v === undefined) return null;
  const s = typeof v === "string" ? v : String(v);
  return s.length > MAX_STR ? s.slice(0, MAX_STR) : s;
};

/* the columns worth having on their own: what you filter the morning after. Everything else the
   form asked stays inside `data`, exactly as the site wrote it. */
function flat(record) {
  return {
    full_name: clip(record.name || record.full_name),
    email: clip(record.email ? String(record.email).toLowerCase() : ""),
    phone: clip(record.phone),
  };
}

/* Two tables, one door, and the kind is the only thing that decides which. The website's four forms
   go on together in site_leads; the stand's sign-ups go on their own in sharjah_next_leads, because
   the event lasts two days, its follow up is somebody else's calendar, and the two lists are
   exported and cleaned up on different days. Nothing about that is the caller's choice beyond the
   kind it is already sending: a free-form table name in the body would be a way to write anywhere. */
function rowFor(kind, record, at) {
  const who = flat(record);
  if (kind !== "sharjah_next") {
    return { kind, ...who, company: clip(record.authority || record.organisation || record.who), at, data: record };
  }
  return {
    ...who,
    ref: clip(record.ref),
    country_code: clip(record.country_code),
    consent: record.consent === true || record.consent === "on" || record.consent === "true",
    source: clip(record.source),
    at,
    data: record,
  };
}

Deno.serve(async (req) => {
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  const want = secret("LEADS_PUSH_KEY");
  if (!want) return json({ ok: false, error: "config" }, 500);

  let body = null;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return json({ ok: false, error: "big" }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ ok: false, error: "json" }, 400);
  }

  if (!matches(req.headers.get("x-boasis-key") || body?.key, want)) {
    return json({ ok: false, error: "auth" }, 401);
  }

  /* the watch's question, answered before any of the write path is looked at: no kind, no record, no row */
  if (String(body?.action || "") === "watch") {
    let sb2;
    try {
      sb2 = client();
    } catch {
      return json({ ok: false, error: "config" }, 500);
    }
    return json(await watchRows(sb2, body?.want));
  }

  const kind = String(body?.kind || "");
  if (!KINDS.includes(kind)) return json({ ok: false, error: "kind" }, 400);
  const record = body?.record && typeof body.record === "object" ? body.record : null;
  if (!record) return json({ ok: false, error: "record" }, 400);

  const stamp = Date.parse(String(body?.at || record.at || ""));
  const at = Number.isFinite(stamp) ? new Date(stamp).toISOString() : new Date().toISOString();
  const table = kind === "sharjah_next" ? STAND : TABLE;
  const row = rowFor(kind, record, at);

  let sb;
  try {
    sb = client();
  } catch {
    return json({ ok: false, error: "config" }, 500);
  }
  const { data, error } = await sb.from(table).insert(row).select("id").single();
  if (error) return json({ ok: false, error: "db" }, 500);

  /* the form half of the sheet row, so a name is on the stand's screen before anybody has spoken to
     Mira, and so a page with no pass still gets a row; the steps fill the rest in when they happen */
  await pushRecordToSheet(record, { table });

  return json({ ok: true, id: data?.id ?? null, kind, table, at: row.at });
});
