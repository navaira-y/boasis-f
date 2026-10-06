/* save step · the Brain telling us how far the person got
 *
 * The Brain UI calls this after each step with the pass it was handed and the part of the journey
 * that just happened: what the person typed, what Mira said back, and how the step ended. The pass
 * is the whole credential, so no account and no token, and an unknown, expired or malformed pass
 * writes nothing at all.
 *
 * The merge is additive and the row is rewritten whole, so a person who walks away at step two
 * leaves a smaller record rather than a broken one, and a lost request costs one step instead of
 * the visit.
 *
 * Secrets: SPARK_SUPABASE_URL, SPARK_SERVICE_ROLE_KEY, ALLOW_ORIGIN. No salt and no Brain address, on
 * purpose: this door only ever updates a row that already exists, and it is told nothing about
 * where to send anyone.
 */
// deno-lint-ignore-file no-explicit-any
import { applyStep, checkPass, isPass } from "../_shared/spark-core.js";
import { client, cors, readLead, writeLead } from "../_shared/spark-supabase.js";

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

  /* the pass becomes a row key, so its shape is settled before a single character of it is used:
     PASS plus eight characters from an alphabet with no I, O, 0 or 1, no slash, no dot */
  const pass = String(body?.pass || "");
  if (!isPass(pass)) return json({ ok: false, error: "pass" }, 400);

  const sb = client();
  const checked = checkPass(pass, await readLead(sb, pass), Date.now());
  if (!checked.ok) return json({ ok: false, error: checked.error }, checked.error === "pass" ? 400 : 404);

  const next = applyStep(checked.lead, String(body?.step || ""), body?.data || {}, Date.now());
  if (!next) return json({ ok: false, error: "step" }, 400);

  try {
    await writeLead(sb, next);
  } catch {
    return json({ ok: false, error: "storage" }, 500);
  }

  return json({ ok: true, version: next.version, steps_reached: next.brain.steps_reached });
});
