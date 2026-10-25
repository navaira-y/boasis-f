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

/* the sheet hook is a module of its own because two of the four doors want it and one of those two
   is not a SPARK door at all: save-lead shares the project and the service key but none of the
   SPARK rules, and it still has to put a row of cells in the same sheet */
const SHEET = ['_shared/sheet.js'];
const SHEET_SECRETS = ['SHEET_HOOK_URL', 'SHEET_HOOK_KEY'];

const FUNCS = [
  /* the SPARK_ pair, because Supabase reserves SUPABASE_ for the two it injects itself; the code
     reads either, so the header and the code have to keep those names together */
  { name: 'create-pass', shared: SHARED.concat(SHEET), secrets: ['SPARK_SUPABASE_URL', 'SPARK_SERVICE_ROLE_KEY', 'EMAIL_SALT', 'ALLOW_ORIGIN', 'BRAIN_URL'].concat(SHEET_SECRETS) },
  { name: 'save-step', shared: SHARED.concat(SHEET), secrets: ['SPARK_SUPABASE_URL', 'SPARK_SERVICE_ROLE_KEY', 'ALLOW_ORIGIN'].concat(SHEET_SECRETS) },
  { name: 'get-lead', shared: SHARED, secrets: ['SPARK_SUPABASE_URL', 'SPARK_SERVICE_ROLE_KEY', 'ALLOW_ORIGIN'] },
  /* the site's own mirror, which shares the project and the service key but none of the SPARK
     rules, so it is written as one file that imports nothing from a folder: `standalone` */
  { name: 'save-lead', standalone: true, shared: SHEET, secrets: ['SPARK_SUPABASE_URL', 'SPARK_SERVICE_ROLE_KEY', 'LEADS_PUSH_KEY'].concat(SHEET_SECRETS) },
];

const IMPORT = /^[ \t]*import[^\n]*?from[ \t]*["'][^"']+["'];?[ \t]*$/gm;

const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');

/* one module as it goes into a paste-in file: its own import lines taken out (the ones that point
   at another file could not resolve anyway, and the ones that point at a URL are hoisted to the
   top of the composed file once), the `export` keyword off the front of its declarations, and
   every comment and blank line inside left exactly as written */
function take(rel) {
  const text = read(rel);
  const REL = rel;
  const absolute = [];
  const body = text.replace(IMPORT, (line) => {
    const spec = /from[ \t]*["']([^"']+)["']/.exec(line)[1];
    if (!spec.startsWith('.')) absolute.push(line.trim());
    return '';
  });
  const without = body.replace(/^\/\/ deno-lint-ignore-file[^\n]*\n/m, '');   // the composed file says it once, at the top
  return { rel: REL, absolute, body: without.replace(/^export /gm, '').replace(/\n{3,}/g, '\n\n').trim() };
}

const TITLES = { 'spark-core.js': 'the rules', 'spark-supabase.js': 'the table', 'sheet.js': 'the sheet hook' };

function compose(name) {
  const fn = FUNCS.find(f => f.name === name);
  const door = take(`${name}/index.js`);
  const list = fn.shared || [];
  const extras = list.map(rel => take(rel));

  /* a standalone door inlines nothing it does not import: its body, plus whatever is named above,
     under a header that says where it came from and which secrets it wants */
  if (fn.standalone) {
    const alone = `/* ${name} · one file, to paste into the Supabase dashboard
 *
 * GENERATED, do not edit this copy. scripts/make-supabase-single.js writes it from
 * demo/supabase/functions/${name}/index.js, which is the whole function as written there. It needs
 * no folder beside it and imports nothing from one, so this file and that one are the same code and
 * a test recomposes it and fails if the two ever disagree.
 *
 * Run it: Supabase dashboard → your project → Edge Functions → ${fn.name} → paste → Save, and
 * "Deploy" if it asks. Then the secrets below, on Project Settings → Edge Functions → Secrets, or
 * in the function's own page, and nothing is set in the code.
 *
 * Secrets this one reads (${fn.secrets.length}): ${fn.secrets.join(', ')}
 *   SPARK_SUPABASE_URL and SPARK_SERVICE_ROLE_KEY are the pair the other functions already have, so
 *   on a project that has run the SPARK setup there is one new value here, LEADS_PUSH_KEY.
 *   Set it to a long random string, put the same string in LEADS_PUSH_KEY on boasis.ae, and the
 *   mirror writes. Leave it unset on either side and the site goes on storing its JSON files alone:
 *   this door answers 500 config, and a visitor never hears about it.
 *   The service key can read and write anywhere in the project, which is why the table
 *   has row level security enabled with no policies: the anon key that a browser holds gets nothing.
 *   This key stays in the function and is never in the page, never in the Brain, never in the repo.
 */
// deno-lint-ignore-file no-explicit-any
`;
    return alone + '\n' + [...new Set(door.absolute.concat(...extras.map(m => m.absolute)))].join('\n') +
      (door.absolute.length || extras.length ? '\n\n' : '') +
      extras.map(m => '/* ── inlined from _shared/' + path.basename(m.rel) + ', as written there ── */\n\n' + m.body).join('\n\n') +
      (extras.length ? '\n\n' : '') + door.body + '\n';
  }

  const parts = [door, ...extras];
  const imports = [...new Set(parts.flatMap(m => m.absolute))];
  const doorBody = parts[0].body;
  const inlined = parts.slice(1).map(m => m.body);
  const names = list.map(rel => '_shared/' + path.basename(rel));

  const head = `/* ${name} · one file, to paste into the Supabase dashboard
 *
 * GENERATED, do not edit this copy. scripts/make-supabase-single.js writes it from
 * demo/supabase/functions/${name}/index.js (the door, unchanged) with ${names.join(', ')}
 * inlined above it, because a function pasted in the browser has no folder beside it to import
 * from. The folder version and this one are the same code; a test recomposes it and fails if the
 * two ever disagree, so neither can be quietly edited into a second opinion about a person's row.
 *
 * Run it: Supabase dashboard → your project → Edge Functions → ${fn.name} → paste → Save, and
 * "Deploy" if it asks. Then the secrets below, on Project Settings → Edge Functions → Secrets, or
 * in the function's own page, and nothing is set in the code.
 *
 * Secrets this one reads (${fn.secrets.length}): ${fn.secrets.join(', ')}
 *   Supabase will not let a secret be named SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY, because the
 *   platform supplies those two to every function itself and reads them first if you set nothing.
 *   Set the SPARK_ names below and it works whichever way the project is configured.
 *   The service key can read and write anywhere in the project, which is why the table
 *   has row level security enabled with no policies: the anon key that a browser holds gets nothing.
 *   This key stays in the function and is never in the page, never in the Brain, never in the repo.
 *   EMAIL_SALT only has to be long, random and remembered: lose it and a person who scans the QR
 *   twice gets a fresh row instead of their own, and nothing else changes.
 */
// deno-lint-ignore-file no-explicit-any
`;

  return head + '\n' + imports.join('\n') +
    inlined.map((body, i) => {
      const base = path.basename(list[i]);
      return '\n\n/* ── ' + (TITLES[base] || base) + ', inlined from _shared/' + base + ', as written there ── */\n\n' + body;
    }).join('') +
    '\n\n/* ── ' + name + ', from ' + name + '/index.js, as written there ── */\n\n' + doorBody + '\n';
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
