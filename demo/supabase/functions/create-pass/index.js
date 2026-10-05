/* create pass · the only door into the demo
 *
 * The form at boasis.ae/try-mira posts here. A pass is minted, one row is created for that person,
 * and the answer hands back the pass and where to take them. Nothing in here trusts the caller
 * with more than the fields the form has, and nothing lets the caller name a column, a row, or a
 * table: the object the core builds is what goes in, and `pass` is the key.
 *
 * Run as a Supabase edge function, either from this folder with the CLI or as the one generated
 * file in demo/supabase/dashboard/create-pass.js, pasted in the browser. Both are this file.
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EMAIL_SALT, ALLOW_ORIGIN, BRAIN_URL.
 * The service key can write anywhere in the project, so it lives here and nowhere else: not in
 * the page, not in the Brain, not in the repo.
 */
// deno-lint-ignore-file no-explicit-any
import { buildLead, isPass, makePass, normaliseEmail, readForm } from "../_shared/spark-core.js";
import { client, cors, emailHashOf, readByEmailHash, readLead, writeLead } from "../_shared/spark-supabase.js";

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

  /* a person who reloads, or scans the QR twice, is handed their own row back rather than opening
     a second stranger with their name on it */
  const seen = await readByEmailHash(sb, hash);
  if (seen && seen.pass && isPass(seen.pass)) {
    const existing = await readLead(sb, seen.pass);
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
    if (!(await readLead(sb, candidate))) {
      pass = candidate;
      break;
    }
  }
  if (!pass) return json({ ok: false, error: "busy" }, 503);

  const lead = buildLead({ pass, contact: form.contact, source: body?.source, now });
  try {
    await writeLead(sb, lead, hash);
  } catch {
    return json({ ok: false, error: "storage" }, 500);
  }

  return json({ ok: true, pass, brain_url: Deno.env.get("BRAIN_URL") || "" });
});
