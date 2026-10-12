/* save-lead · the site's form sign-ups, kept in a table as well as a file
 *
 * boasis.ae posts here after it has already written its own copy, so this is the one that a deploy
 * cannot lose and that the dashboard can hand you as a CSV. Four kinds come through: the early
 * access form, the two dialogs on the home page, and the contact form. The whole record arrives as
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
 * Secrets: SPARK_SUPABASE_URL, SPARK_SERVICE_ROLE_KEY, LEADS_PUSH_KEY. No salt, no Brain address, no
 * origin list, since a browser is never supposed to reach this door at all.
 */
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TABLE = "site_leads";
const KINDS = ["early_access", "waitlist", "demo", "contact"];
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
    company: clip(record.authority || record.organisation || record.who),
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

  const kind = String(body?.kind || "");
  if (!KINDS.includes(kind)) return json({ ok: false, error: "kind" }, 400);
  const record = body?.record && typeof body.record === "object" ? body.record : null;
  if (!record) return json({ ok: false, error: "record" }, 400);

  const stamp = Date.parse(String(body?.at || record.at || ""));
  const row = { kind, ...flat(record), at: Number.isFinite(stamp) ? new Date(stamp).toISOString() : new Date().toISOString(), data: record };

  let sb;
  try {
    sb = client();
  } catch {
    return json({ ok: false, error: "config" }, 500);
  }
  const { data, error } = await sb.from(TABLE).insert(row).select("id").single();
  if (error) return json({ ok: false, error: "db" }, 500);

  return json({ ok: true, id: data?.id ?? null, kind, at: row.at });
});
