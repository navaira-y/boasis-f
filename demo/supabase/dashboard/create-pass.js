/* create-pass · one file, to paste into the Supabase dashboard
 *
 * GENERATED, do not edit this copy. scripts/make-supabase-single.js writes it from
 * demo/supabase/functions/create-pass/index.js (the door, unchanged) with _shared/spark-core.js, _shared/spark-supabase.js, _shared/sheet.js
 * inlined above it, because a function pasted in the browser has no folder beside it to import
 * from. The folder version and this one are the same code; a test recomposes it and fails if the
 * two ever disagree, so neither can be quietly edited into a second opinion about a person's row.
 *
 * Run it: Supabase dashboard → your project → Edge Functions → create-pass → paste → Save, and
 * "Deploy" if it asks. Then the secrets below, on Project Settings → Edge Functions → Secrets, or
 * in the function's own page, and nothing is set in the code.
 *
 * Secrets this one reads (7): SPARK_SUPABASE_URL, SPARK_SERVICE_ROLE_KEY, EMAIL_SALT, ALLOW_ORIGIN, BRAIN_URL, SHEET_HOOK_URL, SHEET_HOOK_KEY
 *   Supabase will not let a secret be named SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY, because the
 *   platform supplies those two to every function itself and reads them first if you set nothing.
 *   Set the SPARK_ names below and it works whichever way the project is configured.
 *   The service key can read and write anywhere in the project, which is why the table
 *   has row level security enabled with no policies: the anon key that a browser holds gets nothing.
 *   This key stays in the function and is never in the page, never in the Brain, never in the repo.
 *   EMAIL_SALT only has to be long, random and remembered: lose it and a person who scans the QR
 *   twice gets a fresh row instead of their own, and nothing else changes.
 */
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ── the rules, inlined from _shared/spark-core.js, as written there ── */

/* SPARK demo · the rules, with no server in them
 *
 * One record per person, kept as it is written: a row in the Supabase table `spark_leads`, whose
 * `data` column is this object, or the file `data/leads/PASSxxxxxxxx.json` on boasis.ae itself.
 * The form creates it, every step inside the Brain updates it, and a person who walks away halfway
 * leaves everything up to that point behind. Either way it is the same object with the same shape,
 * meant to be read on its own: the name, the number, the words they typed, and what the page said
 * back, in one place. That is the plan's shape, and this file holds
 * every decision in it that is worth getting wrong or right: what counts as a person, what a
 * pass looks like, what a lead record contains, how a step merges, and when a pass expires.
 *
 * It is deliberately pure and synchronous. The Deno functions in the folders next door do nothing
 * but move bytes to and from the database, and lib/spark.js does the same with a folder, so the
 * whole thing can be tested in plain Node, which is what the night before an event allows.
 */

const STEPS = ['describe', 'mira', 'activities', 'package'];

/* What counts as an address and as a number, once. The pages check the same thing as they type. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_MIN = 7;                   // the shortest real national number on our list
const PHONE_MAX = 15;                  // the ITU ceiling, so a pasted wall of digits is out
const MAX_AGE_HOURS = 24;          // the plan asks 24h, listed as still to confirm
const TOO_FAST_MS = 1200;          // nobody types four fields faster than this

/* No look-alike pairs: a pass read off a screen at a loud stand has to survive being typed. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/* The letters come from the platform's own random source when there is one, which there is in
   Deno on Supabase and in Node 19 and up, and 256 over 32 divides exactly so no letter is
   favoured. Math.random is only the fallback for a caller that hands in its own generator. */
function pick() {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (c && typeof c.getRandomValues === 'function') return () => c.getRandomValues(new Uint8Array(1))[0] / 256;
  return Math.random;
}

function makePass(random = pick()) {
  let out = 'PASS';
  for (let i = 0; i < 8; i += 1) out += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return out;
}

function isPass(pass) {
  return typeof pass === 'string' && /^PASS[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/.test(pass);
}

/* The same rule the site's own forms use: a leading zero typed for a local call is not part
   of the number, except where it is (+1, where it is a country code's own digit). */
const NO_TRUNK = new Set(['+1']);

function phoneOf(code, raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  const c = /^\+\d{1,4}$/.test(String(code || '')) ? String(code) : '';
  if (!c) return d;
  return c + ' ' + (NO_TRUNK.has(c) ? d : d.replace(/^0+(?=\d)/, ''));
}

function normaliseEmail(v) {
  return String(v || '').trim().toLowerCase();
}

/* ── the form ──────────────────────────────────────────────────────────────────
 * Returns the contact part, or a reason. The reasons are short codes: the page turns them
 * into sentences, the logs keep them exact.
 */
function readForm(body) {
  const b = body && typeof body === 'object' ? body : {};
  if (String(b.hp || '').trim()) return { ok: false, error: 'bot' };
  if (Number(b._t) > 0 && Number(b._t) < TOO_FAST_MS) return { ok: false, error: 'too-fast' };

  const name = String(b.full_name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const email = normaliseEmail(b.email).slice(0, 254);
  const digits = String(b.phone || '').replace(/\D/g, '');
  const code = /^\+\d{1,4}$/.test(String(b.country_code || '')) ? String(b.country_code) : '';
  const phone = phoneOf(b.country_code, b.phone);

  if (name.length < 2) return { ok: false, error: 'full_name' };
  /* the two checks the site's own forms already run, in lib/validate.js and js/contact.js: an
     address with a real domain after the at, and a number of seven to fifteen digits after the
     code. A looser rule here than on the page is a rule a visitor learns by trial and error, and
     a phone of four digits is a lead nobody at a desk can call back. */
  if (!EMAIL_RE.test(email) || /\.{2,}/.test(email)) return { ok: false, error: 'email' };
  if (digits.length < PHONE_MIN || digits.length > PHONE_MAX) return { ok: false, error: 'phone' };
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

/* The object every back end stores. `pass` is also its name: a row key in Supabase, a file name
   on the site, and the only thing the visitor's address bar carries. */
function buildLead({ pass, contact, source, now }) {
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
function applyStep(lead, step, data, now) {
  if (!lead || typeof lead !== 'object') return null;
  if (!STEPS.includes(step)) return null;
  const out = JSON.parse(JSON.stringify(lead));
  const at = new Date(now).toISOString();
  const b = out.brain || (out.brain = { steps_reached: [], description: '', mira: [], activities: {}, package: {}, log: [], output: {} });
  if (!Array.isArray(b.log)) b.log = [];
  if (!b.output || typeof b.output !== 'object') b.output = {};
  const d = data && typeof data === 'object' ? data : {};

  /* Once all four steps are in, this row is the record an advisor reads the morning after, and a
     person who presses "start a new business" inside the framed Brain must not replace the company
     they were just asked about. So a finished row keeps what it holds and answers `frozen`, while
     Mira turns go on being appended, because a second round of questions is interest rather than
     damage, and the caps above are what stop that growing without limit. */
  if (step !== 'mira' && STEPS.every(s => (b.steps_reached || []).includes(s))) {
    b.frozen = true;
    return out;
  }

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

function isExpired(lead, now) {
  if (!lead || !lead.expires_at) return true;
  return Date.parse(lead.expires_at) <= Number(now);
}

/* The pass is the whole credential, so the file an unknown or expired pass points at is
   never created, read or overwritten on its behalf. */
function checkPass(pass, lead, now) {
  if (!isPass(pass)) return { ok: false, error: 'pass' };
  if (!lead) return { ok: false, error: 'unknown' };
  if (isExpired(lead, now)) return { ok: false, error: 'expired' };
  return { ok: true, lead };
}

/* ── the table, inlined from _shared/spark-supabase.js, as written there ── */

/* SPARK demo · the table, and nothing else
 *
 * The rules live in spark-core.js and know nothing about any server. This file is the thin part
 * that only the edge functions need: a client from the secrets, one table name, and the read and
 * write of a row. Keeping it apart means create-pass, save-step and get-lead do not each invent
 * their own column list, and the one file per person is written the same way from all three.
 *
 * There are two tables and they are the same shape: `public.spark_leads`, created by
 * demo/supabase/spark.sql, and `public.sharjah_next_leads`, created by demo/supabase/sharjah-next-passes.sql
 * for the page at boasis.ae/sharjah-next. A page names its own when it asks for a pass, and the row
 * is found by the pass alone afterwards, so nothing outside these three functions has to know which
 * crowd a person came from. One table per entrance, rather than one filter, because the two are
 * counted, exported and cleaned up on different days.
 *
 * The table is `public.spark_leads`, created by demo/supabase/spark.sql. One row per person, `pass`
 * as the key, and `data` holding the whole record exactly as the file version of this demo holds it,
 * so the same JSON is what the advisor reads whichever back end is in use. The flat columns beside it
 * are copies of the fields worth sorting and counting the morning after, and they are written from
 * that same object rather than from anything the caller sends.
 */

const TABLE = "spark_leads";

/* The entrance decides where a person's row lives. An empty name is the original page, so a call
   that says nothing behaves exactly as it did before this map existed, and an unknown name falls
   back to it rather than inventing a table out of a typo: the table a row goes into is never taken
   from anything a caller can type freely, it is chosen from these two keys. */
const TABLES = {
  "": TABLE,
  "sharjah-next": "sharjah_next_passes",
};

function tableFor(page) {
  const key = String(page || "").trim().toLowerCase();
  return TABLES[key] || TABLE;
}

/* every table a pass could be sitting in, in the order they are looked up */
function allTables() {
  return [...new Set(Object.values(TABLES))];
}

/* Supabase reserves its own prefix on the secrets screen and hands those two values to every
   function itself, so "SUPABASE_URL" cannot be typed in. Ours are read first, and if you did not
   set them the platform's own values are used, which is the usual case and needs nothing from
   anyone. Either way a missing value says which one it wanted, rather than a 500 and a stack
   about undefined. */
function secret(names) {
  for (const n of names) {
    const v = Deno.env.get(n);
    if (v) return v;
  }
  return "";
}

function client() {
  const url = secret(["SPARK_SUPABASE_URL", "SUPABASE_URL"]);
  const key = secret(["SPARK_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
  if (!url || !key) {
    throw new Error("set SPARK_SUPABASE_URL and SPARK_SERVICE_ROLE_KEY as Edge Function secrets (or let the platform supply SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/* the two doors the browser uses are on another origin, so they answer a preflight and name the
   hosts they will talk to. ALLOW_ORIGIN is a comma separated list, because the form is on
   boasis.ae and the Brain is on brain.boasis.ae, and both need the same two doors. */
function allowList() {
  return (Deno.env.get("ALLOW_ORIGIN") || "").split(",").map((s) => s.trim()).filter(Boolean);
}

function cors(req) {
  const wanted = req.headers.get("origin") || "";
  const list = allowList();
  const origin = list.includes(wanted) ? wanted : (list[0] || "*");
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Vary": "Origin",
  };
}

/* the lead object, plus the columns you will actually filter on. Everything in the row comes from
   the object the core built, so a caller cannot name a column: it sends four form fields or one
   step, and this is what ends up beside it. */
function rowOf(lead) {
  const c = lead.contact || {};
  const b = lead.brain || {};
  const p = b.package || {};
  const price = Number(p.price_aed);
  return {
    pass: lead.pass,
    full_name: c.full_name ?? null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    country_code: c.country_code ?? null,
    residence: c.residence ?? null,
    consent: c.consent === true,
    source: lead.source ?? null,
    last_step: b.last_step ?? null,
    steps_reached: b.steps_reached ?? [],
    turns: (b.log ?? []).length + (b.mira ?? []).length,
    price_aed: Number.isFinite(price) ? price : null,
    created_at: lead.created_at ?? null,
    updated_at: lead.updated_at ?? null,
    expires_at: lead.expires_at ?? null,
    data: lead,
  };
}

async function writeLead(sb, lead, emailHash, table = TABLE) {
  const row = rowOf(lead);
  if (emailHash) row.email_hash = emailHash;
  const res = await sb.from(table).upsert(row, { onConflict: "pass" });
  if (res.error) throw res.error;
}

async function readLead(sb, pass, table = TABLE) {
  const { data } = await sb.from(table).select("data").eq("pass", pass).maybeSingle();
  return data ? data.data : null;
}

/* the one lookup that does not know which entrance a pass came from, which is every lookup after
   the pass is minted: the Brain only has the pass, so the row is looked for in each table in turn
   and the one that holds it is the one written back to. Two reads in the worst case, on a table of
   a few hundred rows, at the pace of a stand: paid for, and cheaper than a pass that carries a
   table name in it where anyone could edit it. */
async function readLeadAny(sb, pass) {
  for (const table of allTables()) {
    const lead = await readLead(sb, pass, table);
    if (lead) return { lead, table };
  }
  return { lead: null, table: null };
}

/* is this pass already somebody's, anywhere? A mint that only asked its own table could hand the
   same letters to two people in two entrances, and the second one would be read into the first's
   row by the lookup above. */
async function passTaken(sb, pass) {
  for (const table of allTables()) {
    if (await readLead(sb, pass, table)) return true;
  }
  return false;
}

/* the same address, a second scan: the newest row for that hash, and the caller decides whether the
   pass in it still works. Not a unique index, because a pass is allowed to expire and the same
   person to be given a fresh one the next day. */
async function readByEmailHash(sb, hash, table = TABLE) {
  const { data } = await sb.from(table)
    .select("pass, expires_at")
    .eq("email_hash", hash)
    .order("updated_at", { ascending: false })
    .limit(1);
  return data && data[0] ? data[0] : null;
}

async function emailHashOf(email) {
  const salt = Deno.env.get("EMAIL_SALT") || "spark-demo";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + "|" + email));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ── the sheet hook, inlined from _shared/sheet.js, as written there ── */

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

/* ── create-pass, from create-pass/index.js, as written there ── */

/* create pass · the only door into the demo
 *
 * The form at boasis.ae/try-mira posts here, and so does the one at boasis.ae/sharjah-next, which
 * adds one field, `page: "sharjah-next"`, and lands its rows in the other table. A pass is minted, one row is created for that person,
 * and the answer hands back the pass and where to take them. Nothing in here trusts the caller
 * with more than the fields the form has, and nothing lets the caller name a column, a row, or a
 * table: the object the core builds is what goes in, and `pass` is the key.
 *
 * Run as a Supabase edge function, either from this folder with the CLI or as the one generated
 * file in demo/supabase/dashboard/create-pass.js, pasted in the browser. Both are this file.
 *
 * Secrets: SPARK_SUPABASE_URL, SPARK_SERVICE_ROLE_KEY, EMAIL_SALT, ALLOW_ORIGIN, BRAIN_URL,
 * SHEET_HOOK_URL and SHEET_HOOK_KEY (the last two are the stand's Google sheet, see
 * demo/sheet/Boasis stand sheet.gs; with either missing the sheet is simply not written to).
 * (The two SUPABASE_ names with no SPARK_ in front are read too, if you set neither.)
 * The service key can write anywhere in the project, so it lives here and nowhere else: not in
 * the page, not in the Brain, not in the repo.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  let body = null;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "json" }, 400);
  }

  /* the bot traps and the fields, judged by the same rules the site's own back end uses: the page
     is the least trusted part of the system, so a filled honeypot and a form submitted in 300ms
     are refused here as well as there */
  const form = readForm(body);
  if (!form.ok) return json({ ok: false, error: form.error }, 400);

  const sb = client();
  const now = Date.now();
  const hash = await emailHashOf(normaliseEmail(form.contact.email));
  /* which entrance this is, and so which table the row belongs to. The page names itself in a
     field of its own, and a call that names nothing is the original page at /try-mira. */
  const table = tableFor(body?.page);

  /* a person who reloads, or scans the QR twice, is handed their own row back rather than opening
     a second stranger with their name on it */
  const seen = await readByEmailHash(sb, hash, table);
  if (seen && seen.pass && isPass(seen.pass)) {
    const existing = await readLead(sb, seen.pass, table);
    if (existing && Date.parse(existing.expires_at || 0) > now) {
      return json({ ok: true, pass: seen.pass, brain_url: Deno.env.get("BRAIN_URL") || "", reused: true });
    }
  }

  /* five attempts at a name nobody else is holding. A collision here is already about as likely as
     a dropped phone landing on its camera, and a row that overwrites a stranger's is the one
     failure this demo is not allowed */
  let pass = "";
  for (let i = 0; i < 5; i += 1) {
    const candidate = makePass();
    if (!(await passTaken(sb, candidate))) {
      pass = candidate;
      break;
    }
  }
  if (!pass) return json({ ok: false, error: "busy" }, 503);

  const lead = buildLead({ pass, contact: form.contact, source: body?.source, now });
  /* the reference the site already showed that person, when the site has one. It goes inside the
     record rather than beside it, because the sheet quotes it and nothing here has to filter on it:
     a column would be a paste in the SQL editor before a word of this could work */
  const ref = String(body?.ref || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  if (ref) lead.ref = ref;
  try {
    await writeLead(sb, lead, hash, table);
  } catch {
    return json({ ok: false, error: "storage" }, 500);
  }

  /* and the row of cells in the stand's sheet, after the row is safe and never before it, in a call
     that cannot make this one fail: a sheet that is asleep costs the visitor nothing at all */
  await pushLeadToSheet(lead, { table });

  return json({ ok: true, pass, brain_url: Deno.env.get("BRAIN_URL") || "" });
});
