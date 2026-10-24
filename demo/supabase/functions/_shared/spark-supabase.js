/* SPARK demo · the table, and nothing else
 *
 * The rules live in spark-core.js and know nothing about any server. This file is the thin part
 * that only the edge functions need: a client from the secrets, one table name, and the read and
 * write of a row. Keeping it apart means create-pass, save-step and get-lead do not each invent
 * their own column list, and the one file per person is written the same way from all three.
 *
 * There are two tables and they are the same shape: `public.spark_leads`, created by
 * demo/supabase/spark.sql, and `public.spark_event_leads`, created by demo/supabase/spark-event.sql
 * for the page at boasis.ae/spark-event. A page names its own when it asks for a pass, and the row
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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const TABLE = "spark_leads";

/* The entrance decides where a person's row lives. An empty name is the original page, so a call
   that says nothing behaves exactly as it did before this map existed, and an unknown name falls
   back to it rather than inventing a table out of a typo: the table a row goes into is never taken
   from anything a caller can type freely, it is chosen from these two keys. */
export const TABLES = {
  "": TABLE,
  "spark-event": "spark_event_leads",
};

export function tableFor(page) {
  const key = String(page || "").trim().toLowerCase();
  return TABLES[key] || TABLE;
}

/* every table a pass could be sitting in, in the order they are looked up */
export function allTables() {
  return [...new Set(Object.values(TABLES))];
}

/* Supabase reserves its own prefix on the secrets screen and hands those two values to every
   function itself, so "SUPABASE_URL" cannot be typed in. Ours are read first, and if you did not
   set them the platform's own values are used, which is the usual case and needs nothing from
   anyone. Either way a missing value says which one it wanted, rather than a 500 and a stack
   about undefined. */
export function secret(names) {
  for (const n of names) {
    const v = Deno.env.get(n);
    if (v) return v;
  }
  return "";
}

export function client() {
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
export function allowList() {
  return (Deno.env.get("ALLOW_ORIGIN") || "").split(",").map((s) => s.trim()).filter(Boolean);
}

export function cors(req) {
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
export function rowOf(lead) {
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

export async function writeLead(sb, lead, emailHash, table = TABLE) {
  const row = rowOf(lead);
  if (emailHash) row.email_hash = emailHash;
  const res = await sb.from(table).upsert(row, { onConflict: "pass" });
  if (res.error) throw res.error;
}

export async function readLead(sb, pass, table = TABLE) {
  const { data } = await sb.from(table).select("data").eq("pass", pass).maybeSingle();
  return data ? data.data : null;
}

/* the one lookup that does not know which entrance a pass came from, which is every lookup after
   the pass is minted: the Brain only has the pass, so the row is looked for in each table in turn
   and the one that holds it is the one written back to. Two reads in the worst case, on a table of
   a few hundred rows, at the pace of a stand: paid for, and cheaper than a pass that carries a
   table name in it where anyone could edit it. */
export async function readLeadAny(sb, pass) {
  for (const table of allTables()) {
    const lead = await readLead(sb, pass, table);
    if (lead) return { lead, table };
  }
  return { lead: null, table: null };
}

/* is this pass already somebody's, anywhere? A mint that only asked its own table could hand the
   same letters to two people in two entrances, and the second one would be read into the first's
   row by the lookup above. */
export async function passTaken(sb, pass) {
  for (const table of allTables()) {
    if (await readLead(sb, pass, table)) return true;
  }
  return false;
}

/* the same address, a second scan: the newest row for that hash, and the caller decides whether the
   pass in it still works. Not a unique index, because a pass is allowed to expire and the same
   person to be given a fresh one the next day. */
export async function readByEmailHash(sb, hash, table = TABLE) {
  const { data } = await sb.from(table)
    .select("pass, expires_at")
    .eq("email_hash", hash)
    .order("updated_at", { ascending: false })
    .limit(1);
  return data && data[0] ? data[0] : null;
}

export async function emailHashOf(email) {
  const salt = Deno.env.get("EMAIL_SALT") || "spark-demo";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + "|" + email));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
