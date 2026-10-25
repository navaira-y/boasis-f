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
// deno-lint-ignore-file no-explicit-any
import { buildLead, isPass, makePass, normaliseEmail, readForm } from "../_shared/spark-core.js";
import { client, cors, emailHashOf, passTaken, readByEmailHash, readLead, tableFor, writeLead } from "../_shared/spark-supabase.js";
import { pushLeadToSheet } from "../_shared/sheet.js";

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
