#!/usr/bin/env node
/* One file per Supabase edge function, for the browser
 *
 * Why this exists: the three folders in demo/supabase/functions are the tidy way to deploy, and
 * the tidy way needs the Supabase CLI on your machine. The dashboard is the other way: New Edge
 * Function, paste one file, save. But a pasted file has no folder beside it, so the two lines at
 * the top of each function that say `import … from "../_shared/…"` have nothing to resolve. This
 * script therefore produces, for each function, one file with those two modules written into it.
 *
 *   node scripts/make-supabase-single.js      → demo/supabase/dashboard/*.js
 *
 * Nothing here is a second opinion about anything. The rulebook and the table helpers are copied
 * as they stand, with only the word `export` taken off the front of their declarations, and each
 * function's own body is copied unchanged apart from its import lines. No logic lives in this
 * script, so there is nothing here to get right or wrong, and a test recomposes all three files
 * and fails if what is on disk is not exactly what this produces. Edit the folders, re-run, commit
 * both copies.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'demo/supabase/functions');
const OUT = path.join(ROOT, 'demo/supabase/dashboard');

const SHARED = ['_shared/spark-core.js', '_shared/spark-supabase.js'];

const FUNCS = [
  { name: 'create-pass', secrets: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'EMAIL_SALT', 'ALLOW_ORIGIN', 'BRAIN_URL'] },
  { name: 'save-step', secrets: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ALLOW_ORIGIN'] },
  { name: 'get-lead', secrets: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ALLOW_ORIGIN'] },
];

const IMPORT = /^[ \t]*import[^\n]*?from[ \t]*["'][^"']+["'];?[ \t]*$/gm;

const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');

/* one module as it goes into a paste-in file: its own import lines taken out (the ones that point
   at another file could not resolve anyway, and the ones that point at a URL are hoisted to the
   top of the composed file once), the `export` keyword off the front of its declarations, and
   every comment and blank line inside left exactly as written */
function take(rel) {
  const text = read(rel);
  const absolute = [];
  const body = text.replace(IMPORT, (line) => {
    const spec = /from[ \t]*["']([^"']+)["']/.exec(line)[1];
    if (!spec.startsWith('.')) absolute.push(line.trim());
    return '';
  });
  const without = body.replace(/^\/\/ deno-lint-ignore-file[^\n]*\n/m, '');   // the composed file says it once, at the top
  return { absolute, body: without.replace(/^export /gm, '').replace(/\n{3,}/g, '\n\n').trim() };
}

function compose(name) {
  const parts = [take(`${name}/index.js`), ...SHARED.map(take)];
  const imports = [...new Set(parts.flatMap(m => m.absolute))];
  const door = parts[0].body;
  const core = parts[1].body;
  const store = parts[2].body;

  const fn = FUNCS.find(f => f.name === name);
  const head = `/* ${name} · one file, to paste into the Supabase dashboard
 *
 * GENERATED, do not edit this copy. scripts/make-supabase-single.js writes it from
 * demo/supabase/functions/${name}/index.js (the door, unchanged) with ${SHARED.map(s => '_shared/' + path.basename(s)).join(' and ')}
 * inlined above it, because a function pasted in the browser has no folder beside it to import
 * from. The folder version and this one are the same code; a test recomposes it and fails if the
 * two ever disagree, so neither can be quietly edited into a second opinion about a person's row.
 *
 * Run it: Supabase dashboard → your project → Edge Functions → ${fn.name} → paste → Save, and
 * "Deploy" if it asks. Then the secrets below, on Project Settings → Edge Functions → Secrets, or
 * in the function's own page, and nothing is set in the code.
 *
 * Secrets this one reads (${fn.secrets.length}): ${fn.secrets.join(', ')}
 *   SUPABASE_SERVICE_ROLE_KEY can read and write anywhere in the project, which is why the table
 *   has row level security enabled with no policies: the anon key that a browser holds gets nothing.
 *   This key stays in the function and is never in the page, never in the Brain, never in the repo.
 *   EMAIL_SALT only has to be long, random and remembered: lose it and a person who scans the QR
 *   twice gets a fresh row instead of their own, and nothing else changes.
 */
// deno-lint-ignore-file no-explicit-any
`;

  return head + '\n' + imports.join('\n') +
    '\n\n/* ── the rules, inlined from _shared/spark-core.js, as written there ── */\n\n' + core +
    '\n\n/* ── the table, inlined from _shared/spark-supabase.js, as written there ── */\n\n' + store +
    '\n\n/* ── ' + name + ', from ' + name + '/index.js, as written there ── */\n\n' + door + '\n';
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const fn of FUNCS) {
    const to = path.join(OUT, fn.name + '.js');
    fs.writeFileSync(to, compose(fn.name));
    console.log('  wrote ' + path.relative(ROOT, to) + ' (' + fs.statSync(to).size + ' bytes)');
  }
}

module.exports = { compose, OUT, FUNCS };
if (require.main === module) main();
