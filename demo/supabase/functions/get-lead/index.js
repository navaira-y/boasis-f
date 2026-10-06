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
// deno-lint-ignore-file no-explicit-any
import { checkPass, isPass } from "../_shared/spark-core.js";
import { client, cors, readLead } from "../_shared/spark-supabase.js";

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
