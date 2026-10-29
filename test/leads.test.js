/* the mirror into Supabase: the shape of what leaves the site, what comes back, and the three
   places that have to agree (lib/leads.js, the save-lead door, demo/supabase/leads.sql).
   The end to end case at the bottom runs a real server against a real sink, because the wiring of
   "store the file, then copy it, and never let the copy decide the visitor's answer" is exactly the
   kind of thing a unit test signs its way through and a deploy finds out about. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const { makeLeads, scrub, KINDS } = require('../lib/leads');

const record = {
  name: 'Mehran Zare', email: 'MEZZ@hq.coach', phone: '+971 557895626',
  have: 'yes', count: '1-3', authority: 'CoachHQ Apps FZCO', plans: '',
  at: '2026-10-06T10:16:01.672Z',
  hp: 'secret honeypot', altcha: 'a solved puzzle', _t: 1234, emailv: 'a verification token',
};

test('the copy holds the answers and nothing that guards the form', () => {
  const s = scrub(record);
  assert.equal(s.name, 'Mehran Zare', 'what they typed, as it was typed');
  assert.equal(s.email, 'MEZZ@hq.coach', 'the address is left alone, the door lower cases it');
  assert.equal(s.at, '2026-10-06T10:16:01.672Z', 'and the time the site accepted it travels with it');
  for (const k of ['hp', 'altcha', '_t', 'emailv']) {
    assert.ok(!(k in s), k + ' never leaves the site: a solved puzzle in a table is an invitation');
  }
  const long = scrub({ note: 'x'.repeat(5000) });
  assert.equal(long.note.length, 500, 'and one field is clipped, not streamed');
});

test('with no key the mirror is off, says so, and touches nothing', async () => {
  let touched = 0;
  const L = makeLeads({ config: { leads: {}, spark: { projectUrl: 'https://example.supabase.co' } }, fetchImpl: async () => { touched++; return { ok: true }; }, log: () => {} });
  const r = await L.push('early_access', record);
  assert.equal(r.ok, false);
  assert.equal(r.skipped, 'off', 'off is a decision, not a failure');
  assert.equal(touched, 0, 'and it asked no one');
  assert.equal(L.status().enabled, false);
  assert.equal(L.status().host, '', 'nothing to name in a health reply while it is off');
});

test('the key is the whole switch, and the URL follows the project the demo already knows', () => {
  const L = makeLeads({ config: { leads: { key: 'kk' }, spark: { projectUrl: 'https://p.supabase.co/' } }, fetchImpl: async () => ({ ok: true, text: async () => '' }) });
  assert.equal(L.url(), 'https://p.supabase.co/functions/v1/save-lead', 'one secret, and the trailing slash is forgiven');
  const M = makeLeads({ config: { leads: { key: 'kk', url: 'https://elsewhere.test/door' }, spark: { projectUrl: 'https://p.supabase.co' } }, fetchImpl: async () => ({ ok: true, text: async () => '' }) });
  assert.equal(M.url(), 'https://elsewhere.test/door', 'but an explicit URL wins');
});

test('a sign-up is posted once, with the key in a header, and the answer is not the visitor\'s problem', async () => {
  const seen = [];
  const log = [];
  const L = makeLeads({
    config: { leads: { key: 'kk' }, spark: { projectUrl: 'https://p.supabase.co' } },
    log: m => log.push(m),
    fetchImpl: async (url, init) => { seen.push({ url, init, body: JSON.parse(init.body) }); return { ok: true, status: 201, text: async () => '{"ok":true,"id":7}' }; },
  });
  const r = await L.push('early_access', record);
  assert.equal(r.ok, true);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, 'https://p.supabase.co/functions/v1/save-lead');
  assert.equal(seen[0].init.method, 'POST');
  assert.equal(seen[0].init.headers['x-boasis-key'], 'kk', 'the door reads the header first');
  assert.equal(seen[0].body.kind, 'early_access');
  assert.equal(seen[0].body.at, record.at, 'and the time the site accepted it, not the time the copy ran');
  assert.ok(!('altcha' in seen[0].body.record) && !('hp' in seen[0].body.record));
  assert.ok(log.some(l => l.includes('mirrored early_access')), 'one quiet line in the log');
  assert.equal(L.status().sent, 1);
});

test('a door that is down costs a log line and nothing else', async () => {
  for (const [what, impl] of [
    ['refused', async () => { throw new Error('ECONNREFUSED'); }],
    ['timeout', async () => { const e = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'; throw e; }],
    ['not ok', async () => ({ ok: false, status: 401, text: async () => '{"ok":false,"error":"auth"}' })],
    ['gone', async () => ({ ok: false, status: 500, text: async () => 'not json at all' })],
  ]) {
    const log = [];
    const L = makeLeads({ config: { leads: { key: 'kk' }, spark: { projectUrl: 'https://p.supabase.co' } }, log: m => log.push(m), fetchImpl: impl });
    const r = await L.push('contact', record);
    assert.equal(r.ok, false, what + ' does not count as stored');
    assert.ok(log.length === 1 && log[0].startsWith('mirror '), what + ' is one log line');
    assert.equal(L.status().failed, 1, what + ' is counted, so health can say it out loud');
  }
});

test('an unknown kind is refused on the way out, so a new form cannot invent a column', async () => {
  let touched = 0;
  const L = makeLeads({ config: { leads: { key: 'kk' }, spark: { projectUrl: 'https://p.supabase.co' } }, fetchImpl: async () => { touched++; return { ok: true, text: async () => '' }; } });
  assert.equal((await L.push('newsletter', record)).skipped, 'kind');
  assert.equal(touched, 0);
});

test('the three lists of kinds are one list, in the site, in the door, and in the table', () => {
  const door = fs.readFileSync(path.join(ROOT, 'demo/supabase/functions/save-lead/index.js'), 'utf8');
  const sql = fs.readFileSync(path.join(ROOT, 'demo/supabase/leads.sql'), 'utf8');
  const inDoor = /const KINDS = \[([^\]]+)\]/.exec(door)[1].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
  const inSql = /check \(kind in \(([^)]+)\)\)/.exec(sql)[1].split(',').map(s => s.trim().replace(/^'|'$/g, ''));
  assert.deepEqual(KINDS, inDoor, 'the door accepts exactly what the site sends');
  assert.deepEqual(KINDS.slice().sort(), inSql.slice().sort(), 'and the table has a place for exactly those');
});

test('the table has the columns the door writes, and the lock the comment promises', () => {
  const door = fs.readFileSync(path.join(ROOT, 'demo/supabase/functions/save-lead/index.js'), 'utf8');
  const sql = fs.readFileSync(path.join(ROOT, 'demo/supabase/leads.sql'), 'utf8');
  for (const col of ['kind', 'full_name', 'email', 'phone', 'company', 'at', 'data']) {
    assert.ok(new RegExp('^\\s*' + col + '\\s', 'm').test(sql), col + ' is a column in the table');
    assert.ok(door.includes(col), col + ' is written by the door');
  }
    assert.match(door, /from\(table\)\.insert\(row\)/, 'the door writes with one insert, into the table the kind picked');
  assert.match(door, /const STAND = "sharjah_next_leads"/, 'and the stand has a table of its own to pick');
  assert.ok(!/\.delete\(|\.upsert\(/.test(door), 'and no row is ever removed, and nothing upserts a whole key by accident');
  assert.match(door, /if \(table === STAND && row\.ref\)/,
    'the stand\'s own table is the one place a row is rewritten, by reference, because a visitor is one row there');
  assert.match(door, /const fresh = await sb\.from\(table\)\.insert\(row\)\.select\("id"\)\.single\(\);\n      data = fresh\.data; error = fresh\.error;/,
    'and an update that the grant refuses falls back to the append this door always did, so deploying before the grant is a duplicate row and not a lost lead');
  assert.match(sql, /enable row level security/, 'RLS on');
  assert.ok(!/create policy/.test(sql), 'and no policy: the browser roles get nothing, the service role does not need one');
  assert.match(sql, /grant select, insert on table public.site_leads to service_role/, 'insert and read, never update');
});

test('the file you paste in the dashboard is the function, with nothing left to import', () => {
  const { compose } = require('../scripts/make-supabase-single.js');
  const dash = fs.readFileSync(path.join(ROOT, 'demo/supabase/dashboard/save-lead.js'), 'utf8');
  assert.equal(dash, compose('save-lead'), 'save-lead in dashboard/ is exactly what the generator writes');
  assert.ok(!/from ["']\.\.\//.test(dash), 'no relative import, which is the whole reason the copy exists');
  assert.deepEqual([...dash.matchAll(/^import .*$/gm)].map(m => m[0]),
    ['import { createClient } from "https://esm.sh/@supabase/supabase-js@2";'],
    'one import, from a URL, and it is the Supabase client');
  assert.match(dash, /^\/\* save-lead · one file, to paste into the Supabase dashboard\n \*\n \* GENERATED, do not edit this copy\./m);
  assert.ok(dash.includes('Deno.serve(') && dash.includes('LEADS_PUSH_KEY'), 'a function that refuses without the key');
});

/* ── end to end: a real server, a real sink, and a form that must not notice ───── */
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'boasis-leads-'));
const wait = ms => new Promise(r => setTimeout(r, ms));

async function startSink(onRequest) {
  const got = [];
  const server = http.createServer((req, res) => {
    let text = '';
    req.on('data', d => { text += d; });
    req.on('end', () => {
      const body = (() => { try { return JSON.parse(text); } catch (e) { return null; } })();
      got.push({ method: req.method, url: req.url, headers: req.headers, body });
      const out = onRequest ? onRequest(body, req.headers) : { ok: true, id: 1 };
      res.writeHead(out.status || 200, { 'content-type': 'application/json' });
      res.end(typeof out.raw === 'string' ? out.raw : JSON.stringify(out.payload || out));
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  /* close, and drop the pooled keep-alive sockets with it: a request after this has to fail the
     way a dead relay fails, not be answered by a socket that was already open */
  return {
    port: server.address().port, got,
    close: () => new Promise(r => { try { server.closeAllConnections(); } catch (e) {} server.close(r); }),
  };
}

async function startServer(env) {
  const proc = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: {
      ...process.env, BOASIS_NO_ENV_FILE: '1', PORT: '0', DATA_DIR: DATA, MAIL_DRY_RUN: '1',
      VISITOR_SALT: 'test-salt', RATE_LIMIT_FORMS_PER_MIN: '10000', RATE_LIMIT_VISITS_PER_MIN: '10000',
      MAIL_MAX_PER_HOUR: '10000', MAIL_MAX_PER_DAY: '10000', ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server did not start: ' + log)), 20000);
    proc.stdout.on('data', d => { log += d; if (/port \d{2,6}/.test(log)) { clearTimeout(t); res(); } });
    proc.stderr.on('data', d => { log += d; });
    proc.on('exit', c => rej(new Error('exited ' + c + ': ' + log)));
  });
  const out = { proc, log, base: 'http://127.0.0.1:' + /port (\d+)/.exec(log)[1], lines: [] };
  proc.stdout.on('data', d => out.lines.push(String(d)));
  return out;
}
const { withCaptcha } = require('./helpers/captcha');

test('a contact that is stored is copied, and a copy that fails still stores it', async () => {
  const sink = await startSink();
  const s = await startServer({ LEADS_PUSH_KEY: 'kk', LEADS_PUSH_URL: 'http://127.0.0.1:' + sink.port + '/functions/v1/save-lead' });
  try {
    const body = await withCaptcha(s.base, {
      name: 'Sara Khan', email: 'sara@corp.example', phone: '+971 500001111',
      organisation: 'Corp', about: 'setup', message: 'Please call us on Monday.', _t: Date.now() - 9000,
    });
    const r = await fetch(s.base + '/api/contact', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await r.json();
    assert.equal(r.status, 200, 'the visitor is answered whatever the mirror does');
    assert.equal(j.ok, true, 'and the answer is the same shape as always');

    for (let i = 0; i < 60 && !sink.got.length; i++) await wait(50);
    assert.equal(sink.got.length, 1, 'the copy arrived at the door');
    assert.equal(sink.got[0].headers['x-boasis-key'], 'kk');
    assert.equal(sink.got[0].body.kind, 'contact');
    assert.equal(sink.got[0].body.record.name, 'Sara Khan');
    assert.ok(!('altcha' in sink.got[0].body.record), 'the puzzle stayed home');

    const file = JSON.parse(fs.readFileSync(path.join(DATA, 'contact.json'), 'utf8'));
    assert.equal(file.length, 1, 'and the file is still written, first');
    assert.equal(file[0].email, 'sara@corp.example');

    const h = await (await fetch(s.base + '/api/health')).json();
    assert.equal(h.leads.enabled, true, 'health says the mirror is on');
    assert.equal(h.leads.host, '127.0.0.1:' + sink.port, 'and to which host, which is all of it it says');
    assert.ok(!JSON.stringify(h).includes('sara@'), 'no address in health, ever');

    /* now break the door: the form must still be stored, answered, and honest in the log */
    await sink.close();
    const r2 = await fetch(s.base + '/api/contact', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(await withCaptcha(s.base, {
        name: 'Omar Farid', email: 'omar@corp.example', phone: '+971 500002222',
        about: 'setup', message: 'The mirror is down.', _t: Date.now() - 9000,
      })),
    });
    assert.equal(r2.status, 200, 'a dead mirror is not the visitor\'s problem');
    assert.equal((await r2.json()).ok, true);
    const file2 = JSON.parse(fs.readFileSync(path.join(DATA, 'contact.json'), 'utf8'));
    assert.equal(file2.length, 2, 'and it is not the store\'s problem either');
    for (let i = 0; i < 60 && !s.lines.join('').includes('mirror unreachable'); i++) await wait(50);
    assert.ok(s.lines.join('').includes('[leads] mirror unreachable for contact'), 'it is said once, in the log: ' + s.lines.join('').slice(-400));
    const h2 = await (await fetch(s.base + '/api/health')).json();
    assert.equal(h2.leads.failed >= 1, true, 'and health counts it');
  } finally {
    s.proc.kill();
    await sink.close().catch(() => {});
  }
});

test('a mirror that is off leaves the site exactly as it was', async () => {
  const s = await startServer({});
  try {
    const r = await fetch(s.base + '/api/contact', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(await withCaptcha(s.base, {
        name: 'No Mirror', email: 'nm@corp.example', phone: '+971 500003333',
        about: 'manage', message: 'Nothing is configured here.', _t: Date.now() - 9000,
      })),
    });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).ok, true);
    const h = await (await fetch(s.base + '/api/health')).json();
    assert.equal(h.leads.enabled, false, 'health says off, not broken');
    const before = JSON.parse(fs.readFileSync(path.join(DATA, 'contact.json'), 'utf8')).length;
    assert.ok(before >= 1, 'the file took it');
  } finally { s.proc.kill(); }
});
