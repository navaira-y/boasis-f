/* save step · the Brain telling us how far the person got
 *
 * The Brain UI calls this after each step (plan, task 2) with the pass it was handed and the
 * part of the journey that just happened. The pass is the whole credential: no account, no
 * token, nothing else is trusted, and an unknown or expired pass writes nothing at all.
 *
 * A step never overwrites the file: applyStep merges additively and bumps a version, so a
 * half-finished journey is a smaller file rather than a broken one.
 */
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { applyStep, checkPass, isPass } from "../_shared/spark-core.js";

const BUCKET = () => Deno.env.get("BUCKET") || "leads";
const CORS = () => ({
  "Access-Control-Allow-Origin": Deno.env.get("ALLOW_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS() });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS(), "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "json" }, 400);
  }

  /* The pass arrives from a browser and becomes an object name, so its shape is settled
     before a single byte of it is concatenated: PASS plus eight characters from an alphabet
     with no slashes, no dots, nothing that can walk out of leads/. */
  const pass = String(body?.pass || "");
  if (!isPass(pass)) return json({ ok: false, error: "pass" }, 400);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const path = "leads/" + pass + ".json";
  const { data } = await sb.storage.from(BUCKET()).download(path).catch(() => ({ data: null }));
  let lead: any = null;
  if (data) {
    try {
      lead = JSON.parse(await (data as Blob).text());
    } catch {
      lead = null;
    }
  }

  const checked = checkPass(pass, lead, Date.now());
  if (!checked.ok) return json({ ok: false, error: checked.error }, checked.error === "pass" ? 400 : 404);

  const next = applyStep(checked.lead, String(body?.step || ""), body?.data || {}, Date.now());
  if (!next) return json({ ok: false, error: "step" }, 400);

  const res = await sb.storage
    .from(BUCKET())
    .upload(path, new Blob([JSON.stringify(next, null, 2)], { type: "application/json" }), {
      upsert: true,
      contentType: "application/json",
    });
  if (res.error) return json({ ok: false, error: "storage" }, 500);

  return json({ ok: true, version: next.version, steps_reached: next.brain.steps_reached });
});
