/** Boasis stand sheet · the receiving end of the sheet hook
 *
 * What this is. Supabase's own save-lead, create-pass and save-step functions post one small object
 * here after every write. This file turns that object into a row of cells, one cell per field, and a
 * second tab of the questions the visitor asked and the answers they got. It is the only place the
 * columns exist, which is the point: when the boss wants one more thing to read, it is a line in COLS
 * below, and no function, no page and no deploy of the site is involved.
 *
 * Where it lives. In the sheet itself: Extensions, Apps Script, paste all of this, save, then Deploy,
 * New deployment, Web app, Execute as me, Who has access: Anyone. Copy the /exec address into the
 * SHEET_HOOK_URL secret on Supabase. The sheet is not shared with anybody for that to work, which is
 * the reason the address can be "anyone": writes only, and locked with the secret below.
 *
 * What it can and cannot do. It writes to the two tabs named here, and reads the two columns it needs
 * to find the row it is updating. It has no read of anything else in the file, it never returns a
 * value from the sheet, it sends no mail, and it opens no other spreadsheet, so a leaked /exec address
 * can add rows to this one tab and nothing more: a wrong secret gets a no and no cell is touched.
 *
 * One row per person, not one row per visit. The match is the email address, because that is the one
 * field all three senders carry. A second, third and fourth post about the same person fill in the
 * cells that have news and leave the rest alone, so a person who stopped at step two keeps what they
 * said, and a form write that arrives late cannot erase a finished conversation.
 */

var CONFIG = {
  /* the same string as the SHEET_HOOK_KEY secret on Supabase, nothing more and nothing less;
     change it here and there and the whole hook is rotated in a minute, with the site untouched */
  SECRET: 'PASTE-THE-SAME-RANDOM-STRING-HERE',

  TAB_LEADS: 'Leads',
  TAB_ANSWERS: 'Answers',

  /* which name in the post becomes which column, left to right. `f` is the field the function
     sends, `h` is the header a person reads, `w` is the column width in pixels. Adding one is a
     line here; removing one leaves the data in Supabase, where it was always the record. */
  COLS: [
    { f: 'ref',                h: 'Reference',        w: 110 },
    { f: 'at',                 h: 'Started',          w: 150 },
    { f: 'full_name',          h: 'Name',             w: 150 },
    { f: 'email',              h: 'Email',            w: 210 },
    { f: 'phone',              h: 'Mobile',           w: 150 },
    { f: 'country_code',       h: 'Code',             w: 60 },
    { f: 'residence',          h: 'In the UAE',       w: 90 },
    { f: 'consent',            h: 'Agreed',           w: 70 },
    { f: 'source',             h: 'Offer',            w: 150 },
    { f: 'described',          h: 'What they said they do', w: 340 },
    { f: 'activities_picked',  h: 'Activities picked',      w: 300 },
    { f: 'activities_confirmed', h: 'Activities agreed',  w: 100 },
    { f: 'package',            h: 'Package',          w: 140 },
    { f: 'price_aed',          h: 'Price AED',        w: 100, n: 1 },
    { f: 'visas',              h: 'Visas',            w: 70 },
    { f: 'shareholders',       h: 'Shareholders',     w: 90 },
    { f: 'premises',           h: 'Premises',         w: 150 },
    { f: 'last_step',          h: 'Reached',          w: 100 },
    { f: 'steps_done',         h: 'Steps done',       w: 80, n: 1 },
    { f: 'turns',              h: 'Questions asked',  w: 90, n: 1 },
    { f: 'frozen',             h: 'Locked',           w: 70 },
    { f: 'updated',            h: 'Last write',       w: 150 }
  ],

  /* the answers tab, one row per question, oldest first */
  ACOLS: [
    { f: 'ref', h: 'Reference', w: 110 },
    { f: 'key', h: 'Email',     w: 210 },
    { f: 'at',  h: 'Asked at',  w: 150 },
    { f: 'q',   h: 'They asked', w: 380 },
    { f: 'a',   h: 'Mira answered', w: 460 }
  ],

  MAX_FIELDS: 64,        // a post with more names than this is a mistake, not a form
  MAX_ANSWERS: 40,       // a visit is four or five questions; this is the runaway guard
  MAX_CELL: 4000         // Google's own cell is far bigger, so this only stops a wall of text
};

/* ── the door ──────────────────────────────────────────────────────────────────── */

function doGet() {
  /* a deployment check, so the stand can see it is alive without reading a single cell of it */
  return ContentService.createTextOutput('ok');
}

function doPost(e) {
  var out = function (obj) {
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
  };
  var body = readBody(e);
  if (!body) return out({ ok: false, why: 'body' });
  if (String(body.secret) !== String(CONFIG.SECRET)) return out({ ok: false, why: 'key' });
  var key = String(body.key || (body.fields && body.fields.email) || '').trim().toLowerCase();
  if (!key || key.indexOf('@') < 1) return out({ ok: false, why: 'who' });

  /* two steps can land in the same second, and one row must not be written twice into the answers
     tab: Apps Script has no transaction, so the lock is the whole answer */
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (busy) {
    /* the senders never wait for an answer, so this only means one more post than the sheet could
       take at once, and the next step writes both */
    return out({ ok: false, why: 'busy' });
  }
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var leads = writeLeads(ss, key, body.fields || {});
    var answers = (body.answers && body.answers.length) ? writeAnswers(ss, key, body) : 0;
    return out({ ok: true, row: leads, answers: answers });
  } catch (err) {
    console.log('sheet hook: ' + err);
    return out({ ok: false, why: 'sheet' });
  } finally {
    lock.releaseLock();
  }
}

/* the post, or nothing: a form encoded call, a broken JSON body, or an enormous one all end here
   without a cell being touched, and none of them is answered with anything a caller can learn from */
function readBody(e) {
  if (!e || !e.postData || !e.postData.contents) return null;
  var raw = String(e.postData.contents);
  if (raw.length > 60000) return null;
  var o = null;
  try { o = JSON.parse(raw); } catch (bad) { return null; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  if (!o.fields || typeof o.fields !== 'object') return null;
  var n = 0, k;
  for (k in o.fields) { if (Object.prototype.hasOwnProperty.call(o.fields, k)) n++; }
  return n > CONFIG.MAX_FIELDS ? null : o;
}

/* ── the two tabs ──────────────────────────────────────────────────────────────── */

function writeLeads(ss, key, fields) {
  var sh = tab(ss, CONFIG.TAB_LEADS, CONFIG.COLS);
  var cols = header(sh, CONFIG.COLS);
  var row = findRow(sh, cols['email'], key);
  var isNew = !row;
  if (isNew) row = sh.getLastRow() + 1;

  var names = {}, k;
  for (k in fields) { if (Object.prototype.hasOwnProperty.call(fields, k)) names[k] = 1; }

  var width = cols[CONFIG.COLS[CONFIG.COLS.length - 1].f];
  var have = sh.getRange(row, 1, 1, width).getDisplayValues()[0];
  var out = [], touched = 0;
  for (var i = 0; i < CONFIG.COLS.length; i++) {
    var c = CONFIG.COLS[i], col = cols[c.f], keep = have[col - 1];
    /* a sender that has nothing to say about a field says it by saying nothing at all, which is how a
       form write that arrives after the visit leaves the finished steps alone */
    out.push(names[c.f] ? (c.n ? number(fields[c.f]) : clean(fields[c.f])) : keep);
    if (out[i] !== keep) touched++;
  }
  if (isNew) out[cols['email'] - 1] = key;
  /* one write per row rather than one per cell: a person at a stand should not wait on a sheet, and
     a row is then put down all at once rather than half of it appearing in a screen someone glances */
  if (touched || isNew) sh.getRange(row, 1, 1, out.length).setValues([out]);
  return row;
}

/* the answers of one person are rewritten whole rather than appended to, so the same step arriving
   twice (a retry, or a person pressing on) leaves the same rows it left the first time */
function writeAnswers(ss, key, body) {
  var sh = tab(ss, CONFIG.TAB_ANSWERS, CONFIG.ACOLS);
  var cols = header(sh, CONFIG.ACOLS);
  var keyCol = cols['key'] || 1;
  var tag = key + '#';

  var last = sh.getLastRow();
  if (last >= 2) {
    var vals = sh.getRange(2, keyCol, last - 1, 1).getDisplayValues();
    var del = 0;
    for (var i = vals.length - 1; i >= 0; i--) {
      if (String(vals[i][0]).indexOf(tag) === 0) { sh.deleteRow(i + 2); del++; }
      if (del > 400) break;                        // a sheet with more than this is not our event
    }
  }

  var list = (body.answers && body.answers.length) ? body.answers : [];
  var ref = clean((body.fields && body.fields.ref) || '');
  var rows = [];
  for (var n = 0; n < list.length && n < CONFIG.MAX_ANSWERS; n++) {
    var a = list[n] || {};
    var row = [];
    for (var c = 0; c < CONFIG.ACOLS.length; c++) {
      var f = CONFIG.ACOLS[c].f;
      if (f === 'key') row.push(tag + (n + 1));
      else if (f === 'ref') row.push(ref);
      else row.push(clean(a[f]));
    }
    rows.push(row);
  }
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  return rows.length;
}

/* ── the small parts ───────────────────────────────────────────────────────────── */

/* the tab, made if it is not there: a fresh sheet needs nothing typed into it by hand */
function tab(ss, name, cols) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getName() !== name) sh.setName(name);
  return sh;
}

/* the header row, from the same map the cells come from, so the words a person reads and the names
   the function posts cannot drift apart: if the row on the screen is not what COLS says, COLS is
   written over it. That is also the whole rule about this file, and it is worth one line of care:
   add a column at the END of the list, never in the middle, because a middle insertion moves every
   cell after it under a header that was written for its neighbour. */
function header(sh, cols) {
  var at = {}, want = [], i;
  for (i = 0; i < cols.length; i++) { at[cols[i].f] = i + 1; want.push(cols[i].h); }
  var have = sh.getMaxColumns() >= cols.length
    ? sh.getRange(1, 1, 1, cols.length).getDisplayValues()[0] : [];
  var same = have.length === cols.length;
  for (i = 0; same && i < cols.length; i++) { if (String(have[i]) !== String(want[i])) same = false; }
  if (!same) {
    sh.getRange(1, 1, 1, want.length).setValues([want]);
    sh.setFrozenRows(1);
    for (i = 0; i < cols.length; i++) {
      sh.setColumnWidth(i + 1, cols[i].w || 120);
      /* everything a person typed is held as text, which is what keeps a value starting with = from
         arriving as a formula; the few columns meant for adding up are left numeric on purpose */
      if (!cols[i].n) sh.getRange(2, i + 1, Math.max(1, sh.getMaxRows() - 1), 1).setNumberFormat('@');
    }
  }
  return at;
}

/* the row of one person, by their address, in the only column this file searches */
function findRow(sh, col, key) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var vals = sh.getRange(2, col, last - 1, 1).getDisplayValues();
  /* the whole cell has to be the address, not merely hold it: one person's address is a perfectly
     good ending of another person's, and writing a visitor over a stranger is the one thing a sheet
     like this is not allowed to do */
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim().toLowerCase() === key) return i + 2;
  }
  return 0;
}

/* a cell, as a person wants to read it: never an object, never a bracket, never longer than a
   screen. The text columns are formatted as plain text when this file lays the header out, which is
   what stops a field that begins with = from arriving as a formula: the value is kept exactly as it
   was typed rather than softened for the sake of the trick. */
function clean(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return isFinite(v) ? v : '';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'object') {
    try { v = (v.name || v.title || v.label || (Array.isArray(v) ? v.join(', ') : JSON.stringify(v))); } catch (e) { return ''; }
    if (v === null || v === undefined || typeof v === 'object') return '';
  }
  var s = String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ').trim();
  return s.length > CONFIG.MAX_CELL ? s.slice(0, CONFIG.MAX_CELL) : s;
}

/* the four columns a person totals, kept as a number so the sheet can add them up, and empty rather
   than zero when the post had nothing in it, because a zero reads like an answer */
function number(v) {
  var n = Number(clean(v).replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? n : '';
}
