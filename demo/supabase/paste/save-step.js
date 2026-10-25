// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STEPS = ['describe', 'mira', 'activities', 'package'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_MIN = 7;
const PHONE_MAX = 15;
const MAX_AGE_HOURS = 24;
const TOO_FAST_MS = 1200;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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

function applyStep(lead, step, data, now) {
  if (!lead || typeof lead !== 'object') return null;
  if (!STEPS.includes(step)) return null;
  const out = JSON.parse(JSON.stringify(lead));
  const at = new Date(now).toISOString();
  const b = out.brain || (out.brain = { steps_reached: [], description: '', mira: [], activities: {}, package: {}, log: [], output: {} });
  if (!Array.isArray(b.log)) b.log = [];
  if (!b.output || typeof b.output !== 'object') b.output = {};
  const d = data && typeof data === 'object' ? data : {};

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
    b.mira = [...(b.mira || []), turn].slice(-40);
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

function checkPass(pass, lead, now) {
  if (!isPass(pass)) return { ok: false, error: 'pass' };
  if (!lead) return { ok: false, error: 'unknown' };
  if (isExpired(lead, now)) return { ok: false, error: 'expired' };
  return { ok: true, lead };
}

const TABLE = "spark_leads";

const TABLES = {
  "": TABLE,
  "sharjah-next": "sharjah_next_passes",
};

function tableFor(page) {
  const key = String(page || "").trim().toLowerCase();
  return TABLES[key] || TABLE;
}

function allTables() {
  return [...new Set(Object.values(TABLES))];
}

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

async function readLeadAny(sb, pass) {
  for (const table of allTables()) {
    const lead = await readLead(sb, pass, table);
    if (lead) return { lead, table };
  }
  return { lead: null, table: null };
}

async function passTaken(sb, pass) {
  for (const table of allTables()) {
    if (await readLead(sb, pass, table)) return true;
  }
  return false;
}

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

const CLIP = 900;
const SHORT = 220;
const MAX_ANSWERS = 40;
const TIMEOUT_MS = 3500;

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const snip = (v, n = CLIP) => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : String(v);
  return s.length > n ? s.slice(0, n) : s;
};

const list = v => Array.isArray(v) ? v.map(x => snip(isObj(x) ? (x.name || x.title || x.label || JSON.stringify(x)) : x, SHORT)).filter(Boolean).join(', ') : snip(v, SHORT);
const yes = v => v === true || v === 'true' || v === 'on' ? 'yes' : v === false || v === 'false' || v === 'off' ? 'no' : '';

function envOf(names) {
  const env = typeof Deno !== 'undefined' ? Deno.env : (typeof process !== 'undefined' ? process.env : {});
  for (const n of names) { const v = env[n]; if (v) return String(v).trim(); }
  return '';
}

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

  return f;
}

function answersFromLead(lead) {
  const b = (isObj(lead) && isObj(lead.brain)) ? lead.brain : {};
  const out = [];
  for (const m of (Array.isArray(b.mira) ? b.mira : [])) {
    if (!isObj(m)) continue;
    out.push({ at: snip(m.at, 40), q: snip(m.question, CLIP), a: snip(m.answer, CLIP) });
  }

  if (!out.length) {
    for (const m of (Array.isArray(b.log) ? b.log : [])) {
      if (!isObj(m)) continue;
      out.push({ at: snip(m.at, 40), q: snip(m.in, CLIP), a: snip(m.out, CLIP) });
    }
  }
  return out.slice(0, MAX_ANSWERS);
}

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

function payloadFor({ email, fields, answers }) {
  const key = snip(email || fields?.email || '', 254).toLowerCase();
  const body = { key, fields: fields || {} };
  if (Array.isArray(answers) && answers.length) body.answers = answers;
  return body;
}

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

      body: JSON.stringify({ secret: key, ...body }),
      signal: ctl.signal,
    });
    if (!res.ok) return { ok: false, why: 'http ' + res.status };
    return { ok: true };
  } catch (e) {
    return { ok: false, why: (e && e.name === 'AbortError') ? 'timeout' : snip(e && e.message, 80) };
  } finally {
    clearTimeout(timer);
  }
}

async function pushLeadToSheet(lead, o = {}) {
  const r = await pushSheet(payloadFor({
    email: lead && lead.contact ? lead.contact.email : '',
    fields: fieldsFromLead(lead),
    answers: answersFromLead(lead),
  }), o);
  if (o.log) o.log('sheet ' + (r.ok ? 'written' : 'skipped: ' + r.why));
  return r;
}

async function pushRecordToSheet(record, o = {}) {
  const r = await pushSheet(payloadFor({
    email: record && record.email ? record.email : '',
    fields: fieldsFromRecord(record),
  }), o);
  if (o.log) o.log('sheet ' + (r.ok ? 'written' : 'skipped: ' + r.why));
  return r;
}

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

  const pass = String(body?.pass || "");
  if (!isPass(pass)) return json({ ok: false, error: "pass" }, 400);

  const sb = client();
  const found = await readLeadAny(sb, pass);
  const checked = checkPass(pass, found.lead, Date.now());
  if (!checked.ok) return json({ ok: false, error: checked.error }, checked.error === "pass" ? 400 : 404);

  const next = applyStep(checked.lead, String(body?.step || ""), body?.data || {}, Date.now());
  if (!next) return json({ ok: false, error: "step" }, 400);

  try {

    await writeLead(sb, next, null, found.table || "spark_leads");
  } catch {
    return json({ ok: false, error: "storage" }, 500);
  }

  await pushLeadToSheet(next);

  return json({
    ok: true,
    version: next.version,
    steps_reached: next.brain.steps_reached,
    frozen: next.brain.frozen === true,
  });
});
