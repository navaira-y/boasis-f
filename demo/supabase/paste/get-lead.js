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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
  if (req.method !== "GET") return json({ ok: false, error: "method" }, 405);

  const pass = new URL(req.url).searchParams.get("pass") || "";
  if (!isPass(pass)) return json({ ok: false, error: "pass" }, 400);

  const checked = checkPass(pass, (await readLeadAny(client(), pass)).lead, Date.now());
  if (!checked.ok) return json({ ok: false, error: checked.error }, checked.error === "pass" ? 400 : 404);

  return json({ ok: true, lead: checked.lead });
});
