#!/usr/bin/env node
/* SPARK demo · read the book each person left behind
 *
 * The whole demo is meant to end up in one file per person: the name, the number, the words they
 * typed into the form, what they typed into Mira, and what Mira said back. This is how you read
 * them without a database client and without an account anywhere.
 *
 *   node scripts/spark-leads.js                     every lead, newest first, one line each
 *   node scripts/spark-leads.js --pass=PASSR4RK96R4 one person, start to finish, as a page of text
 *   node scripts/spark-leads.js --csv > leads.csv   all of them, for SPARK or for Sheets
 *   node scripts/spark-leads.js --jsonl             the files as they are, one line per person
 *   node scripts/spark-leads.js --day=2026-10-06    one day of the event
 *
 * On the server the folder is the one the app writes to: DATA_DIR, which is ./data by default.
 * To read the leads somewhere else, say so: --dir=/var/www/boasis/data/leads, or point it at a
 * folder of copies. Nothing here writes, so it is safe to run beside a live stand.
 *
 * The output is people's names, addresses and phone numbers. Print it to the terminal, and if you
 * make a CSV make it for one laptop and one recipient: it is not a file to leave in the repo, in
 * a chat, or in an email to a wider list. docs/SPARK.md has the same warning in the client's words.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const arg = (name, dflt) => {
  const hit = process.argv.find(a => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : dflt;
};

const DIR = (() => {
  const given = arg('dir', '');
  if (given) return path.resolve(ROOT, given);
  return path.join(path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data')), 'leads');
})();
const PASS = arg('pass', '');
const DAY = arg('day', '');
const AS = process.argv.includes('--csv') ? 'csv' : process.argv.includes('--jsonl') ? 'jsonl' : PASS ? 'one' : 'list';

const STEP_LABEL = {
  describe: 'Describe your business',
  mira: 'Mira finds your activities',
  activities: 'The activities you picked',
  package: 'The package and the estimate',
};

const all = fs.existsSync(DIR)
  ? fs.readdirSync(DIR).filter(f => /^PASS[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}\.json$/.test(f)).map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); }
      catch (e) { return { pass: f.replace(/\.json$/, ''), unreadable: e.message }; }
    })
  : [];

const wanted = PASS ? all.filter(l => l.pass === PASS) : all;
if (DAY) {
  const isDay = (iso) => String(iso || '').slice(0, 10) === DAY;
  wanted.splice(0, wanted.length, ...wanted.filter(l => isDay(l.created_at) || isDay(l.updated_at)));
}
wanted.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

if (wanted.length === 0) {
  console.error(DIR + ': no lead files' + (PASS ? ' for that pass' : '') + (DAY ? ' on ' + DAY : '') + '.');
  console.error('The folder the app writes to is ' + (process.env.DATA_DIR ? 'DATA_DIR, set to ' + process.env.DATA_DIR : './data') + ', and a lead appears there the moment someone submits the form.');
  process.exit(0);
}

const when = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso || '').slice(0, 16);
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
};
const flat = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const short = (s, n) => { const t = flat(s); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const nAed = (v) => (Number.isFinite(Number(v)) ? 'AED ' + Number(v).toLocaleString('en-US') : '');

if (AS === 'list') {
  const rows = [['opened', 'name', 'email', 'phone', 'reached', 'estimate', 'pass']];
  for (const l of wanted) {
    const b = l.brain || {};
    rows.push([
      when(l.created_at),
      short((l.contact || {}).full_name, 26),
      short((l.contact || {}).email, 30),
      short((l.contact || {}).phone, 18),
      (b.last_step || 'nothing yet') + ' (' + ((b.steps_reached || []).length) + '/4)',
      nAed((b.package || {}).price_aed),
      l.pass,
    ]);
  }
  const w = rows[0].map((_, i) => Math.max(...rows.map(r => String(r[i]).length)));
  for (const r of rows) console.log(r.map((c, i) => String(c).padEnd(w[i])).join('  ').trimEnd());
  const turns = wanted.reduce((n, l) => n + ((l.brain || {}).log || []).length, 0);
  const each = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  console.log('\n' + each(wanted.length, 'person', 'people') + ', ' + each(turns, 'exchange', 'exchanges')
    + ' of question and answer, read from ' + path.relative(ROOT, DIR) + '/');
  process.exit(0);
}

if (AS === 'csv') {
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const head = ['pass', 'created_at', 'updated_at', 'expires_at', 'source', 'full_name', 'email', 'phone',
    'country_code', 'residence', 'consent', 'steps_reached', 'last_step', 'description',
    'activities_shown', 'activities_picked', 'activities_confirmed', 'shareholders', 'visas', 'premises',
    'price_aed', 'package_confirmed', 'mira_turns', 'log_turns', 'final_answer', 'unreadable'];
  console.log(head.join(','));
  for (const l of wanted) {
    const c = l.contact || {}, b = l.brain || {}, a = b.activities || {}, p = b.package || {};
    console.log([
      l.pass, l.created_at, l.updated_at, l.expires_at, l.source,
      c.full_name, c.email, c.phone, c.country_code, c.residence, c.consent === true ? 'yes' : 'no',
      (b.steps_reached || []).join(' '), b.last_step, b.description,
      (a.shown || []).join('; '), (a.picked || []).join('; '), a.confirmed === true ? 'yes' : 'no',
      (p.shareholders || []).join('; '), (p.visas || []).join('; '), p.premises, p.price_aed,
      p.confirmed === true ? 'yes' : 'no',
      (b.mira || []).length, (b.log || []).length,
      (b.output && b.output.package) || '', l.unreadable || '',
    ].map(q).join(','));
  }
  console.error('# ' + wanted.length + (wanted.length === 1 ? ' person' : ' people')
    + '. A file of names and numbers: send it to one address, and delete it when the follow up is done.');
  process.exit(0);
}

if (AS === 'jsonl') {
  for (const l of wanted) console.log(JSON.stringify(l));
  process.exit(0);
}

/* one person, the whole visit, top to bottom */
const l = wanted[0];
const c = l.contact || {}, b = l.brain || {}, a = b.activities || {}, p = b.package || {};
const line = (n) => console.log('-'.repeat(n));
console.log(flat(c.full_name).toUpperCase());
console.log(flat(c.email) + '  ·  ' + flat(c.phone) + (c.residence ? '  ·  ' + (c.residence === 'uae' ? 'in the UAE' : 'living abroad') : ''));
line(64);
console.log('pass      ' + l.pass);
console.log('opened    ' + when(l.created_at) + (l.source ? '   from ' + l.source : ''));
console.log('last saved ' + when(l.updated_at));
console.log('reached   ' + (b.last_step ? STEP_LABEL[b.last_step] || b.last_step : 'they did not start')
  + '  (' + (b.steps_reached || []).length + ' of 4)');
if (l.expires_at) console.log('this pass stops working ' + when(l.expires_at));
console.log('');

if (b.description) {
  console.log('1. What they said about the business');
  line(64);
  console.log(String(b.description).trim().replace(/^/gm, '  '));
  console.log('');
}
if ((b.mira || []).length) {
  console.log('2. What Mira asked and what she answered');
  line(64);
  for (const t of b.mira) {
    if (t.question) console.log('  asked   ' + flat(t.question));
    if (t.answer) console.log('  answer  ' + String(t.answer).trim().replace(/\n/g, '\n            '));
    console.log('  ' + when(t.at) + '   ' + '-'.repeat(20));
  }
  console.log('');
}
if ((a.shown || []).length || (a.picked || []).length) {
  console.log('3. Activities');
  line(64);
  if ((a.shown || []).length) console.log('  offered   ' + a.shown.join(', '));
  if ((a.picked || []).length) console.log('  chosen    ' + a.picked.join(', '));
  console.log('  confirmed ' + (a.confirmed === true ? 'yes' : 'not yet'));
  console.log('');
}
if ((p.shareholders || []).length || (p.visas || []).length || p.premises || p.price_aed != null) {
  console.log('4. The package');
  line(64);
  if ((p.shareholders || []).length) console.log('  shareholders  ' + p.shareholders.join(', '));
  if ((p.visas || []).length) console.log('  visas         ' + p.visas.join(', '));
  if (p.premises) console.log('  premises      ' + flat(p.premises));
  if (p.price_aed != null) console.log('  estimate      ' + nAed(p.price_aed));
  console.log('  confirmed     ' + (p.confirmed === true ? 'yes' : 'not yet'));
  console.log('');
}
if ((b.log || []).length) {
  console.log('The whole exchange, as it happened');
  line(64);
  for (const t of b.log) {
    console.log(when(t.at));
    if (t.in) console.log('  in   ' + String(t.in).trim().replace(/\n/g, '\n       '));
    if (t.out) console.log('  out  ' + String(t.out).trim().replace(/\n/g, '\n       '));
  }
  console.log('');
}
if (b.output && Object.keys(b.output).length) {
  console.log('What each step ended with');
  line(64);
  for (const k of Object.keys(b.output)) console.log('  ' + (STEP_LABEL[k] || k) + '\n    ' + String(b.output[k]).trim().replace(/\n/g, '\n    '));
  console.log('');
}
if (l.unreadable) console.log('The file could not be read: ' + l.unreadable);
if (wanted.length > 1) console.log('(' + wanted.length + ' files match that pass, which cannot be; the first is shown)');
