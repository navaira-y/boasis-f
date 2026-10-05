#!/usr/bin/env node
/* One file per Supabase edge function, for the browser
 *
 * Why: the two folders in demo/supabase/functions are the tidy way to deploy, and the tidy way
 * needs the Supabase CLI on your machine. The dashboard is the other way: New Edge Function, paste
 * one file, save. But a pasted file has no folder beside it, so `import … from
 * "../_shared/spark-core.js"` has nothing to resolve. This script therefore writes the rulebook
 * and the door as one piece of paper, twice: create-pass.js and save-step.js.
 *
 *   node scripts/make-supabase-single.js      → demo/supabase/dashboard/*.js
 *
 * Nothing here is a second opinion about the rules. The rules are read out of
 * demo/supabase/functions/_shared/spark-core.js, the same module the site's own back end
 * (lib/spark.js) and the two CLI functions import, and they are copied in as they stand. A test
 * regenerates these files and fails if the copies on disk have fallen behind, so the inlined half
 * cannot drift from the real one.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CORE = path.join(ROOT, 'demo/supabase/functions/_shared/spark-core.js');
const OUT = path.join(ROOT, 'demo/supabase/dashboard');

const head = (name, needs) => `/* ${name} · one file, to paste into the Supabase dashboard
 *
 * GENERATED, do not edit here: scripts/make-supabase-single.js writes this from
 * demo/supabase/functions/_shared/spark-core.js (the rules, inlined as they stand) and the body
 * further down this script. Re-run it after a change and commit both copies. The CLI version in
 * demo/supabase/functions/${name} is the same door, kept apart only so a folder deploy and a
 * pasted file cannot argue about who is right.
 *
 * Secrets this one needs (${needs.length}): ${needs.join(', ')}
 *   SUPABASE_SERVICE_ROLE_KEY is a key that can write anywhere in the project. It lives in this
 *   function and nowhere else: never in the page, never in the Brain, never in the repo.
 */
`;

const PREAMBLE = `// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ── the rules, inlined from _shared/spark-core.js, as written there ── */
`;

const SHARED_BODY = `const BUCKET = () => Deno.env.get("BUCKET") || "leads";
const ALLOW = () => Deno.env.get("ALLOW_ORIGIN") || "*";
const CORS = () => ({
  "Access-Control-Allow-Origin": ALLOW(),
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});
const client = () =>
  createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS(), "Content-Type": "application/json" } });

async function readJson(sb, p) {
  const { data } = await sb.storage.from(BUCKET()).download(p).catch(() => ({ data: null }));
  if (!data) return null;
  try {
    return JSON.parse(await data.text());
  } catch {
    return null;
  }
}

async function writeJson(sb, p, obj) {
  const res = await sb.storage
    .from(BUCKET())
    .upload(p, new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }), {
      upsert: true,
      contentType: "application/json",
    });
  if (res.error) throw res.error;
}
`;

const CREATE_PASS = `${SHARED_BODY}
/* the same address, the same person: by-email holds a hash of the salted address, never the
   address, so a second scan of the QR hands back the pass that is already theirs */
async function keyFor(email) {
  const salt = Deno.env.get("EMAIL_SALT") || "spark-demo";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + "|" + email));
  return "by-email/" + [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("") + ".json";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS() });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  let body = null;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "json" }, 400);
  }

  const form = readForm(body);
  if (!form.ok) return json({ ok: false, error: form.error }, 400);

  const sb = client();
  const now = Date.now();
  const emailKey = await keyFor(normaliseEmail(form.contact.email));
  const seen = await readJson(sb, emailKey);
  if (seen && seen.pass && isPass(seen.pass)) {
    const existing = await readJson(sb, "leads/" + seen.pass + ".json");
    if (existing && Date.parse(existing.expires_at || 0) > now) {
      return json({ ok: true, pass: seen.pass, brain_url: Deno.env.get("BRAIN_URL") || "", reused: true });
    }
  }

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
`;

const SAVE_STEP = `${SHARED_BODY}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS() });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  let body = null;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "json" }, 400);
  }

  /* the pass is the whole credential, and it becomes an object name, so its shape is settled
     before one character of it is used: no slash, no dot, nothing that leaves leads/ */
  const pass = String(body?.pass || "");
  if (!isPass(pass)) return json({ ok: false, error: "pass" }, 400);

  const sb = client();
  const p = "leads/" + pass + ".json";
  const checked = checkPass(pass, await readJson(sb, p), Date.now());
  if (!checked.ok) return json({ ok: false, error: checked.error }, checked.error === "pass" ? 400 : 404);

  const next = applyStep(checked.lead, String(body?.step || ""), body?.data || {}, Date.now());
  if (!next) return json({ ok: false, error: "step" }, 400);

  try {
    await writeJson(sb, p, next);
  } catch (e) {
    return json({ ok: false, error: "storage" }, 500);
  }

  return json({ ok: true, version: next.version, steps_reached: next.brain.steps_reached });
});
`;

function build(name, body, needs) {
  // the rulebook as written, with only the module keyword taken off the front of its exports
  const core = fs.readFileSync(CORE, 'utf8').replace(/^export /gm, '');
  return head(name, needs) + PREAMBLE + core + '\n/* ── the door ── */\n\n' + body;
}

const WANT = [
  ['create-pass', CREATE_PASS, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'EMAIL_SALT', 'BUCKET', 'ALLOW_ORIGIN', 'BRAIN_URL']],
  ['save-step', SAVE_STEP, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'BUCKET', 'ALLOW_ORIGIN']],
];

fs.mkdirSync(OUT, { recursive: true });
for (const [name, body, needs] of WANT) {
  const to = path.join(OUT, name + '.js');
  fs.writeFileSync(to, build(name, body, needs));
  console.log('  wrote ' + path.relative(ROOT, to) + ' (' + fs.statSync(to).size + ' bytes)');
}
