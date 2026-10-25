/* the stand's Google sheet · one row of cells per person, one cell per field
 *
 * The Brain keeps a visit as one JSON object in the row, which is right in a database and unreadable
 * in a spreadsheet: an export of it hands the boss one cell with the whole conversation in it. So
 * there is a hook, and the hook has one job: open that object and send named values, and let a small
 * file inside the sheet decide which of them become columns. These checks are about the two rules that
 * make that safe to leave running at a stand: nothing a person is waiting on can be broken by a sheet
 * that is asleep, and nothing that opens a visitor's conversation leaves our server for Google.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SHARED = 'demo/supabase/functions/_shared/sheet.js';
const GS = 'demo/sheet/Boasis stand sheet.gs';

/* the row as the Brain leaves it, taken from a real export of the other entrance, so this is the
   shape the flattener has to survive rather than a shape invented to flatter it */
const LEAD = {
  pass: 'PASS4SBM6NN5',
  version: 5,
  source: 'sharjah-next-2026',
  created_at: '2026-10-06T08:22:43.265Z',
  updated_at: '2026-10-06T08:27:39.825Z',
  expires_at: '2026-10-07T08:22:43.265Z',
  contact: {
    full_name: 'Test Two', email: 'test2@gmail.com', phone: '+971 501234567',
    country_code: '+971', residence: 'uae', consent: true,
  },
  brain: {
    last_step: 'package',
    steps_reached: ['describe', 'mira', 'activities', 'package'],
    description: 'A small workshop that repairs and services drones, and sells spare parts.',
    activities: { shown: ['Import, sale, and maintenance of drones', 'Drone services'], picked: ['Import, sale, and maintenance of drones'], confirmed: true },
    mira: [{ at: '2026-10-06T08:25:08.720Z', question: 'Do I need a separate activity for spare parts online?', answer: 'No, the existing one covers it.' }],
    log: [{ at: '2026-10-06T08:25:08.720Z', in: 'Do I need a separate activity?', out: 'No.' }],
    package: { visas: ['2'], shareholders: ['3'], premises: 'Flexi-desk (included)', confirmed: true, price_aed: 27189.75 },
  },
};

const core = async () => import(pathToFileURLShim(path.join(ROOT, SHARED)));
function pathToFileURLShim(p) { return 'file://' + (process.platform === 'win32' ? '/' : '') + p.replace(/\\/g, '/').replace(/^\/([A-Za-z]:)/, '$1'); };

test('the visit is opened into named values, one per cell, with nothing JSON about them', async () => {
  const m = await core();
  const f = m.fieldsFromLead({ ...LEAD, ref: 'SN-7QF3KM' });
  assert.equal(f.ref, 'SN-7QF3KM', 'the reference the stand quotes rides along, so the row can be found again');
  assert.equal(f.full_name, 'Test Two');
  assert.equal(f.email, 'test2@gmail.com');
  assert.equal(f.phone, '+971 501234567', 'the number as the row holds it, dial code first');
  assert.equal(f.consent, 'yes', 'a tick box reads as a word, not as true');
  assert.equal(f.described, LEAD.brain.description, 'what they said about themselves, in their words');
  assert.equal(f.activities_picked, 'Import, sale, and maintenance of drones', 'a list becomes one readable line, not a bracket');
  assert.equal(f.activities_shown, 2, 'and how many she offered is a count, which is the useful number');
  assert.equal(f.price_aed, 27189.75, 'the estimate stays a number so the column can be totalled');
  assert.equal(f.visas, '2');
  assert.equal(f.shareholders, '3');
  assert.equal(f.premises, 'Flexi-desk (included)');
  assert.equal(f.steps_done, 4, 'how far the visit got');
  assert.equal(f.turns, 2, 'one question in the mira list plus one in the log, which is what a stand reads as interest');
  assert.equal(f.last_step, 'package');
  const jsony = Object.entries(f).filter(([, v]) => typeof v === 'string' && /[{}\[\]]/.test(v)).map(([k]) => k);
  assert.deepEqual(jsony, [], 'no cell of it is a JSON block, which is the whole reason this file exists');

  const a = m.answersFromLead(LEAD);
  assert.equal(a.length, 1, 'the questions the person asked, one entry each');
  assert.equal(a[0].q, 'Do I need a separate activity for spare parts online?');
  assert.equal(a[0].a, 'No, the existing one covers it.', 'and what Mira said back, as its own value');
  const fromLog = m.answersFromLead({ brain: { log: [{ at: 'x', in: 'one', out: 'two' }] } });
  assert.deepEqual(fromLog[0], { at: 'x', q: 'one', a: 'two' }, 'a visit written only to the log still reads, by the pair it holds');
});

test('what goes to Google is names and words, never a key into the record', async () => {
  const m = await core();
  const body = m.payloadFor({ email: LEAD.contact.email, fields: m.fieldsFromLead(LEAD), answers: m.answersFromLead(LEAD) });
  const wire = JSON.stringify(body);
  assert.ok(!/PASS4SBM6NN5/.test(wire), 'the pass stays home: it is what opens that person\'s conversation, and a row in a sheet is not where it belongs');
  assert.ok(!/email_hash|48ce6834/.test(wire), 'nor the hash of the address, which is only a second way to match the same person');
  assert.ok(!/expires_at/.test(wire), 'and nothing about when a credential stops working');
  assert.equal(body.key, 'test2@gmail.com', 'the row is found by the address, the one field every sender here carries');
  assert.deepEqual(Object.keys(body), ['key', 'fields', 'answers'], 'and the post is three things: who, what, and what they asked');
  const form = m.payloadFor({ email: 'A@B.co', fields: m.fieldsFromRecord({ ref: 'SN-A', email: 'A@B.co', full_name: 'Ada', consent: 'on', at: 't' }) });
  assert.equal(form.key, 'a@b.co', 'a half record still keys to the same row, in the same shape the table keeps it');
  assert.ok(!('answers' in form), 'and it says nothing about answers rather than saying zero, which is how a late form write leaves the visit alone');
});

test('the hook is a courtesy: it cannot fail a visitor, and it is off unless both halves are set', async () => {
  const m = await core();
  assert.deepEqual(await m.pushSheet({ key: 'a@b.co', fields: {} }, { url: '', key: 'k', fetch: () => { throw new Error('never') } }),
    { ok: false, why: 'off' }, 'no address set and no call is made, which is how a rehearsal and a test run stay out of a live sheet');
  assert.equal((await m.pushSheet({ key: 'a@b.co', fields: {} }, { url: 'https://x/exec', key: '', fetch: () => { throw new Error('never') } })).why, 'off',
    'an address with no secret is the same: both are needed, and neither is enough alone');

  const seen = [];
  const ok = await m.pushSheet({ key: 'a@b.co', fields: { email: 'a@b.co' } }, {
    url: 'https://example.test/exec', key: 'sekret',
    fetch: (u, o) => { seen.push({ u, o }); return Promise.resolve({ ok: true, status: 200 }) },
  });
  assert.deepEqual(ok, { ok: true }, 'one try, and a good answer is not read for anything');
  assert.equal(seen[0].u, 'https://example.test/exec');
  const sent = JSON.parse(seen[0].o.body);
  assert.equal(sent.secret, 'sekret', 'the secret travels in the body, where neither of us logs it and a browser cannot stumble on it');
  assert.ok(!/key=sekret|\?/.test(seen[0].u), 'and not in the address, which a proxy would write down');
  assert.equal(seen[0].o.method, 'POST', 'write only: the sheet is never read through this call');
  assert.ok(seen[0].o.signal, 'with a clock on it, so a Google that is thinking cannot hold a door open');

  const slow = await m.pushSheet({ key: 'a@b.co', fields: {} }, {
    url: 'https://example.test/exec', key: 'k', timeout: 10,
    fetch: (u, o) => new Promise((res, rej) => { o.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e) }) }),
  });
  assert.deepEqual(slow, { ok: false, why: 'timeout' }, 'a sheet that never answers is a timeout, and a timeout is a log line');
  const down = await m.pushSheet({ key: 'a@b.co', fields: {} }, {
    url: 'https://example.test/exec', key: 'k',
    fetch: () => Promise.reject(new Error('socket hung up')),
  });
  assert.equal(down.ok, false, 'and any other failure is the same: nothing throws at a caller that is waiting to answer a person');
  assert.match(down.why, /socket/);
});

test('the three doors push after the write, and the row they write to is the one already there', () => {
  for (const f of ['create-pass', 'save-step']) {
    const src = read('demo/supabase/functions/' + f + '/index.js');
    assert.match(src, /import \{ pushLeadToSheet \} from "\.\.\/_shared\/sheet\.js";/, f + ' asks the hook, in the same module the others use');
    const at = src.indexOf('await pushLeadToSheet');
    assert.ok(at > src.indexOf('writeLead(sb'), f + ' sends it after the row is safe, never instead of writing it');
    assert.ok(at > src.indexOf('return json({ ok: false, error: "storage" }'), f + ' does not send when the write failed');
  }
  const lead = read('demo/supabase/functions/save-lead/index.js');
  assert.match(lead, /import \{ pushRecordToSheet \} from "\.\.\/_shared\/sheet\.js";/, 'the form mirror sends the form half too, so a name is on the screen before anybody speaks to Mira');
  assert.ok(lead.indexOf('await pushRecordToSheet') > lead.indexOf('if (error) return json({ ok: false, error: "db" }'), 'and only once the row is in');
  assert.match(read('demo/supabase/functions/create-pass/index.js'), /const ref = String\(body\?\.ref \|\| ""\)\.replace\(/,
    'the reference is taken from the caller and cleaned, because a field one hop from a form is still a field one hop from a form');
  assert.match(read('demo/supabase/functions/create-pass/index.js'), /if \(ref\) lead\.ref = ref;/,
    'and it goes inside the record rather than beside it, so no column has to be created for the sheet to show it');
});

test('the comment free copies are the same code, and only the same code', () => {
  const { compose, paste } = require(path.join(ROOT, 'scripts/make-supabase-single.js'));
  const { tokens } = require(path.join(ROOT, 'scripts/strip-comments.js'));
  for (const name of ['create-pass', 'save-step', 'get-lead', 'save-lead']) {
    const both = read('demo/supabase/paste/' + name + '.js');
    assert.equal(both, paste(name), name + ' in paste/ is exactly what the generator writes from the folder, not an edited copy');
    const coded = t => tokens(t).out.filter(x => x.kind === 'code').map(x => x.text).join('').replace(/\s+/g, ' ').trim();
    const full = compose(name);
    assert.ok(coded(both).length > coded(full).length * 0.4, name + ' kept its code, it is ' + Math.round(coded(both).length / 1000) + 'k of it');
    assert.equal(coded(both), coded(full).replace(/^\s*\/\/ deno-lint-ignore-file no-explicit-any/, ''),
      name + ': taking the comments out changed no string, no regular expression and no line');
    assert.ok(!/\/\*[ \t]*[A-Z]/.test(both), name + ': not one sentence of prose is left in it');
  }
});

test('the sheet file writes cells, locks, and reads nothing it does not have to', () => {
  const gs = read(GS);
  assert.match(gs, /if \(String\(body\.secret\) !== String\(CONFIG\.SECRET\)\) return out\(\{ ok: false, why: 'key' \}\);/,
    'a post without the secret is refused before a cell is looked at');
  assert.match(gs, /function doGet\(\)[\s\S]{0,160}createTextOutput\('ok'\)/, 'and the address answers a question nobody can use, so she can see it is alive');
  assert.match(gs, /lock\.waitLock\(/, 'two steps in one second write one row, not two');
  assert.ok(gs.indexOf('lock.releaseLock()') > 0, 'and the lock is let go of on every path');
  assert.match(gs, /setNumberFormat\('@'\)/, 'text columns are held as text, which is how a value starting with = stays a value');
  assert.match(gs, /function findRow\(sh, col, key\)[\s\S]*toLowerCase\(\) === key\)/, 'the row is matched by the whole cell, because one address can be the end of another');
  assert.match(gs, /function writeAnswers[\s\S]*sh\.deleteRow\(i \+ 2\)/, 'the answers of one person are rewritten rather than appended to, so a second step does not double them');
  assert.ok(!/MailApp|GmailApp/.test(gs), 'it sends no mail from the sheet');
  assert.ok(!/openById|openByUrl|getSpreadsheetUrl/.test(gs), 'it opens no other spreadsheet, so a leaked address can only add rows to this one');
  assert.ok(!/removeRow|\.clear\(\)/.test(gs.replace(/deleteRow/g, '')), 'it never clears a range, only the rows of the one person it is rewriting');
  assert.match(gs, /CONFIG\.MAX_FIELDS/, 'a post with more names than this is a mistake and is left alone');
  assert.match(gs, /MAX_ANSWERS: 40/, 'as is one with more answers than a visit holds');
  const cols = (gs.match(/\{ f: '/g) || []).length;
  assert.ok(cols >= 25, 'the map holds ' + cols + ' columns, which is the sheet half of the contract and the only place the order lives');
  for (const name of ['ref', 'full_name', 'email', 'phone', 'described', 'activities_picked', 'price_aed', 'last_step', 'turns']) {
    assert.ok(gs.includes("f: '" + name + "'"), name + ' has a column of its own');
  }
  assert.ok(!/getValues\(\)/.test(gs.split('function writeAnswers')[1].split('/* \u2500\u2500 the small parts')[0] || ''),
    'and the answers tab is written from the post alone, not read back out of anything');
});

test('the site hands Mira a pass only when it is told to, and only a real one', () => {
  const sp = read('lib/spark.js');
  assert.match(sp, /process\.env\.SPARK_SN_PASS \|\| 'off'/, 'off until switched on, so a rehearsal and a test run cannot mint passes in the live project');
  assert.match(sp, /page: 'sharjah-next'/, 'and the call names the entrance, which is what puts the row in the stand table');
  assert.match(sp, /k\.isPass\(String\(j\.pass \|\| ''\)\)/, 'an answer is only a pass if it is shaped like one');
  assert.ok(sp.indexOf('create-pass') < sp.indexOf("return res.json({ ok: true, ref, pass"), 'and the lead is written whether or not the pass came back');
  assert.match(sp, /_t: Number\(req\.body\._t\) \|\| 0/, 'the age of the form travels again, so the same door judges the same thing twice');
  const sent = sp.slice(sp.indexOf('body: JSON.stringify({'), sp.indexOf('signal: AbortSignal.timeout(4000)'));
  assert.ok(!/emailv|hp\b/.test(sent), 'and the honeypot and the mailbox proof are not passed along to a second service, which has no use for either');

  const js = JS();
  assert.match(js, /function cleanPass\(v\)\{const s=String\(v\|\|''\);return \/\^PASS\[ABCDEFGHJKLMNPQRSTUVWXYZ23456789\]\{8\}\$\/\.test\(s\)\?s:''\}/,
    'the page accepts a pass only in the shape the doors accept it, because it is a key into somebody\'s row');
  assert.match(js, /pass\?'&pass='\+encodeURIComponent\(pass\)\+'&embed=1'/, 'with the pass the frame asks for the embedded chrome, the way the other entrance does');
  assert.match(js, /document\.getElementById\('miraLink'\)\.href=brainHref\(url, ref, pass\)\|*\|*'#';/,
    'and the link under the frame is built by the same line, so the two can never point at different visits');
});

const JS = () => read('js/sharjah-next.js');
