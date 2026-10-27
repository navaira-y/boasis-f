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
 * anybody, which is whether the Brain wrote this visitor's row and whether the sheet says yes to the payment.
 * It is given `want`, a list of `{ ref, pass }` pairs, and it reads the pass table by the pass, because that
 * is the key and the Brain updates that one row rather than adding another.
 * No kind and no record are wanted on that path, nothing is inserted, and the answer is three words per
 * reference. The same shared key guards it, because a read of who has paid is not a thing to leave open.
 *
 * Secrets: SPARK_SUPABASE_URL, SPARK_SERVICE_ROLE_KEY, LEADS_PUSH_KEY, SHEET_HOOK_URL, SHEET_HOOK_KEY.
 * No salt, no Brain address, no
 * origin list, since a browser is never supposed to reach this door at all.
 */
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { pushRecordToSheet } from "../_shared/sheet.js";

/* ── the read the mail watch asks for ──────────────────────────────────────────
   boasis.ae is the only thing that calls this way, with the same key it pushes with, and it asks one
   question per reference: has the conversation been written down, and has the money been ticked off. The
   first answer is in this project, the second is read out of the sheet through the same door that writes
   into it, because a yes typed at the counter exists nowhere else in the world. Nothing is written on this
   path, so the door that reads can never be the door that writes by accident. */
const PASSES = "sharjah_next_passes";
const WATCH_REFS = 40;          // references per question, which is a minute of a stand at the event's pace
const SCAN = 300;               // pass rows looked through, newest first
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

/* the Brain has taken part the moment it has written anything at all about this visitor: one step saved, one
   turn counted, one last step named. Whether the congrats should wait for the very last step rather than the
   first is one line here if the event team ever wants it, and not a hunt through the mails */
function brainDone(row) {
  const d = obj(row.data), b = obj(d.brain);
  if (Array.isArray(b.steps_reached) && b.steps_reached.length) return true;
  if (Array.isArray(row.steps_reached) && row.steps_reached.length) return true;
  if (String(b.last_step || row.last_step || '').trim()) return true;
  return Number(b.turns || row.turns || 0) > 0;
}

const refOf = row => {
  const d = obj(row.data);
  return cut(d.ref || obj(d.lead).ref || row.ref, 40).toUpperCase();
};

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

  /* the pass is the key of that table, and the Brain only ever updates the row create-pass left there, so
     one lookup by pass is the whole read of the visit. The stand knows the pass because it minted it. */
  if (byPass.size) {
    try {
      const { data } = await sb.from(PASSES).select('*').in('pass', [...byPass.keys()]);
      for (const row of (data || [])) {
        const v = byPass.get(String(row.pass));
        if (v && brainDone(row)) v.brain = true;
      }
    } catch (e) {
      console.log('watch could not read the passes by pass: ' + cut(e && e.message, 60));
    }
  }

  /* a lead with no pass, or a pass the table does not have, is still findable by the reference the site
     wrote into that row when it asked for one. Recent rows, newest first, which is all a stand of two days
     ever holds. */
  const loose = [...by.values()].filter(v => !v.brain);
  if (loose.length) {
    const wanted = new Set(loose.map(v => v.ref));
    try {
      const { data } = await sb.from(PASSES).select('*').order('updated_at', { ascending: false }).limit(SCAN);
      for (const row of (data || [])) {
        const key = refOf(row);
        if (key && wanted.has(key)) {
          const v = by.get(key);
          if (v && brainDone(row)) v.brain = true;
        }
      }
    } catch (e) {
      console.log('watch could not read the passes by ref: ' + cut(e && e.message, 60));
    }
  }

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
  return { ok: true, rows: [...by.values()], sheet: sheet.ok ? 'read' : sheet.why };
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
