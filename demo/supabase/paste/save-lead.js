// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function hostOf(u) {
  const m = /^[a-z]+:\/{2}([^/?#]+)/i.exec(String(u || ''));
  return m ? m[1] : 'bad address ' + snip(u, 40);
}

function say(o, line) {
  if (o && typeof o.log === 'function') { o.log(line); return }
  try { console.log(line) } catch {  }
}

const CLIP = 900;
const SHORT = 220;
const MAX_ANSWERS = 40;
const TIMEOUT_MS = 3500;

const STAND_TABLES = new Set(['sharjah_next_passes', 'sharjah_next_leads']);

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const snip = (v, n = CLIP) => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : String(v);
  return s.length > n ? s.slice(0, n) : s;
};

const list = v => Array.isArray(v) ? v.map(x => snip(isObj(x) ? (x.name || x.title || x.label || JSON.stringify(x)) : x, SHORT)).filter(Boolean).join(', ') : snip(v, SHORT);
const yes = v => v === true || v === 'true' || v === 'on' ? 'yes' : v === false || v === 'false' || v === 'off' ? 'no' : '';

function envOf(names) {

  const deno = typeof Deno !== 'undefined' && Deno.env && typeof Deno.env.get === 'function' ? Deno.env : null;
  const box = typeof process !== 'undefined' && process.env ? process.env : null;
  for (const n of names) {
    const v = deno ? deno.get(n) : (box ? box[n] : '');
    if (v) return String(v).trim();
  }
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
    if (!res.ok) return { ok: false, why: 'http ' + res.status + ' to ' + hostOf(url) };

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

const APPS = "sharjah_next_applications";
const APPS_KEYS = ["reference", "ref", "lead_ref", "sharjah_ref", "application_ref"];
const APPS_DONE_STATUS = ["submitted", "paid"];
const WATCH_REFS = 40;
const SCAN = 300;
const cut = (v, n) => String(v === null || v === undefined ? '' : v).slice(0, n);
const obj = v => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {});

async function askSheet(body, timeoutMs) {
  const url = String(Deno.env.get('SHEET_HOOK_URL') || '').replace(/\/+$/, '');
  const key = String(Deno.env.get('SHEET_HOOK_KEY') || '');
  if (!url || !key) return { ok: false, why: 'off' };

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

function submitted(row) {
  const at = row && row.submitted_at;
  if (at !== null && at !== undefined && String(at).trim() !== "") return true;
  return APPS_DONE_STATUS.indexOf(String((row && row.status) || "").trim().toLowerCase()) >= 0;
}

const appAt = row => {
  const at = row && row.submitted_at;
  return at === null || at === undefined ? "" : String(at).trim().slice(0, 40);
};

async function applicationsDone(sb, refs) {
  const done = new Map();
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
      if (key && refs.has(key) && submitted(row)) done.set(key, appAt(row));
    }
    return done;
  }

  try {
    const { data } = await sb.from(APPS).select("*").limit(SCAN);
    for (const row of (data || [])) {
      if (!submitted(row)) continue;
      for (const col of Object.keys(row)) {
        const key = String(row[col] || "").trim().toUpperCase();
        if (key && refs.has(key)) { done.set(key, appAt(row)); break; }
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
    const v = { ref: w.ref, pass: w.pass, brain: false, paid: '', known: false, subAt: '' };
    by.set(w.ref, v);
    if (w.pass) byPass.set(w.pass, v);
  }
  if (!by.size) return { ok: true, rows: [] };

  let done = new Set();
  try {
    done = await applicationsDone(sb, new Set(by.keys()));
  } catch (e) {
    console.log('watch could not read the applications: ' + cut(e && e.message, 60));
  }
  for (const [ref, at] of done) { const v = by.get(ref); if (v) { v.brain = true; v.subAt = at; } }

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
const STAND = "sharjah_next_leads";
const KINDS = ["early_access", "waitlist", "demo", "contact", "sharjah_next"];
const MAX_STR = 500;
const MAX_BODY = 16 * 1024;

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

function flat(record) {
  return {
    full_name: clip(record.name || record.full_name),
    email: clip(record.email ? String(record.email).toLowerCase() : ""),
    phone: clip(record.phone),
  };
}

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
  let data = null, error = null;
  if (table === STAND && row.ref) {

    const said = await sb.from(table).update(row).eq("ref", row.ref).select("id");
    data = said.data; error = said.error;
    if (error || !(data || []).length) {

      const fresh = await sb.from(table).insert(row).select("id").single();
      data = fresh.data; error = fresh.error;
    }
    if (data && Array.isArray(data)) data = data[0] || null;
  } else {
    const fresh = await sb.from(table).insert(row).select("id").single();
    data = fresh.data; error = fresh.error;
  }
  if (error) return json({ ok: false, error: "db" }, 500);

  await pushRecordToSheet(record, { table });

  return json({ ok: true, id: data?.id ?? null, kind, table, at: row.at, ref: row.ref || null });
});
