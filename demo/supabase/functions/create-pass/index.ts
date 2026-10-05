/* create pass · the only door into the demo
 *
 * The form posts here. A pass is minted, the lead file is created, and the answer hands back
 * both the pass and where to take the visitor. Nothing in this function trusts the caller
 * with more than four fields, and nothing in it lets the caller name the file it writes.
 *
 * Deployed as a Supabase edge function (plan, task 4). Secrets the developer sets:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EMAIL_SALT, BUCKET (default "leads"),
 *   BRAIN_URL (https://brain.boasis.ae/demo, or whatever the entrance ends up being),
 *   ALLOW_ORIGIN (the demo entrance origin, for CORS).
 */
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildLead, isPass, makePass, normaliseEmail, readForm } from "../_shared/spark-core.js";

const BUCKET = () => Deno.env.get("BUCKET") || "leads";
const CORS = () => ({
  "Access-Control-Allow-Origin": Deno.env.get("ALLOW_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* The bucket holds one file per person and one file per address, so a second scan of the same
   QR gives the same pass instead of a second stranger's file. The address itself never
   appears in an object name. */
async function keyFor(email: string) {
  const salt = Deno.env.get("EMAIL_SALT") || "spark-demo";
  return "by-email/" + (await sha256(salt + "|" + email)) + ".json";
}

async function readJson(sb: any, path: string) {
  const { data } = await sb.storage.from(BUCKET()).download(path);
  if (!data) return null;
  try {
    return JSON.parse(await (data as Blob).text());
  } catch {
    return null;
  }
}

async function writeJson(sb: any, path: string, obj: unknown) {
  const res = await sb.storage
    .from(BUCKET())
    .upload(path, new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }), {
      upsert: true,
      contentType: "application/json",
    });
  if (res.error) throw res.error;
}

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

  const form = readForm(body);
  if (!form.ok) return json({ ok: false, error: form.error }, 400);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const now = Date.now();
  const emailKey = await keyFor(normaliseEmail(form.contact.email));
  const seen = await readJson(sb, emailKey);
  if (seen && seen.pass && isPass(seen.pass)) {      // an old object must still look like a pass
    const existing = await readJson(sb, "leads/" + seen.pass + ".json");
    if (existing && Date.parse(existing.expires_at || 0) > now) {
      return json({ ok: true, pass: seen.pass, brain_url: Deno.env.get("BRAIN_URL") || "", reused: true });
    }
  }

  /* five attempts at a name nobody else is holding; a stand of a few hundred people makes a
     collision about as likely as a dropped phone landing on the camera */
  let pass = "";
  for (let i = 0; i < 5; i += 1) {
    const candidate = makePass();
    if (!(await readJson(sb, "leads/" + candidate + ".json"))) {
      pass = candidate;
      break;
    }
  }
  if (!pass) return json({ ok: false, error: "busy" }, 503);

  await writeJson(sb, "leads/" + pass + ".json", buildLead({ pass, contact: form.contact, source: body?.source, now }));
  await writeJson(sb, emailKey, { pass, created_at: new Date(now).toISOString() });

  return json({ ok: true, pass, brain_url: Deno.env.get("BRAIN_URL") || "" });
});
