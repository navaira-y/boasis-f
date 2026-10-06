/* get-lead · one file, to paste into the Supabase dashboard
 *
 * GENERATED, do not edit this copy. scripts/make-supabase-single.js writes it from
 * demo/supabase/functions/get-lead/index.js (the door, unchanged) with _shared/spark-core.js and _shared/spark-supabase.js
 * inlined above it, because a function pasted in the browser has no folder beside it to import
 * from. The folder version and this one are the same code; a test recomposes it and fails if the
 * two ever disagree, so neither can be quietly edited into a second opinion about a person's row.
 *
 * Run it: Supabase dashboard → your project → Edge Functions → get-lead → paste → Save, and
 * "Deploy" if it asks. Then the secrets below, on Project Settings → Edge Functions → Secrets, or
 * in the function's own page, and nothing is set in the code.
 *
 * Secrets this one reads (3): SPARK_SUPABASE_URL, SPARK_SERVICE_ROLE_KEY, ALLOW_ORIGIN
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
 * The table is `public.spark_leads`, created by demo/supabase/spark.sql. One row per person, `pass`
 * as the key, and `data` holding the whole record exactly as the file version of this demo holds it,
 * so the same JSON is what the advisor reads whichever back end is in use. The flat columns beside it
 * are copies of the fields worth sorting and counting the morning after, and they are written from
 * that same object rather than from anything the caller sends.
 */

const TABLE = "spark_leads";

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

async function writeLead(sb, lead, emailHash) {
  const row = rowOf(lead);
  if (emailHash) row.email_hash = emailHash;
  const res = await sb.from(TABLE).upsert(row, { onConflict: "pass" });
  if (res.error) throw res.error;
}

async function readLead(sb, pass) {
  const { data } = await sb.from(TABLE).select("data").eq("pass", pass).maybeSingle();
  return data ? data.data : null;
}

/* the same address, a second scan: the newest row for that hash, and the caller decides whether the
   pass in it still works. Not a unique index, because a pass is allowed to expire and the same
   person to be given a fresh one the next day. */
async function readByEmailHash(sb, hash) {
  const { data } = await sb.from(TABLE)
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

/* ── get-lead, from get-lead/index.js, as written there ── */

/* get lead · so the journey can be picked up where it stopped
 *
 * The Brain reads here, once, with the pass from its own address bar. The answer is the row as it
 * stands: the form answers, the steps reached, and everything typed and said so far. That is what
 * makes a reload continue rather than restart, and it is the same body the site's own
 * GET /api/spark-lead answers, so the Brain's code does not care which back end is in use.
 *
 * It reads and writes nothing else, and it refuses a string that is not a pass before the database
 * is touched. The row it returns belongs to whoever holds the pass, which is the trust the whole
 * demo runs on: see the note in lib/spark.js for why, and what to do if that ever reads wrong.
 *
 * Secrets: SPARK_SUPABASE_URL, SPARK_SERVICE_ROLE_KEY, ALLOW_ORIGIN.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
  if (req.method !== "GET") return json({ ok: false, error: "method" }, 405);

  const pass = new URL(req.url).searchParams.get("pass") || "";
  if (!isPass(pass)) return json({ ok: false, error: "pass" }, 400);

  const checked = checkPass(pass, await readLead(client(), pass), Date.now());
  if (!checked.ok) return json({ ok: false, error: checked.error }, checked.error === "pass" ? 400 : 404);

  return json({ ok: true, lead: checked.lead });
});
