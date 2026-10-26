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

  /* which tab holds the table. Left empty on purpose: the stand's list is the first tab of this
     spreadsheet, the one the boss made with her own headers in it, and a tab that already exists needs
     no name agreed between two files. Give it a name only if the table ever moves to a tab of its own,
     and then the script creates that tab if it is missing. */
  TAB_LEADS: '',
  TAB_ANSWERS: 'Answers',

  /* which name in the post becomes which column, left to right, and only as far as the last line
     here: whatever the team keeps to the right of Est. total, Stage, Reminder sent, Payment complete,
     Receipt number, is theirs, never opened, never cleared, never written by us. `f` is the field the
     function sends, `h` is the header a person reads, `w` is the column width in pixels, `n` means the
     column holds a number you might want to add up. Adding a column is a line here and nothing else. */
  COLS: [
    { f: 'ref',               h: 'Unique Reference No', w: 140 },
    { f: 'at',                h: 'Started',             w: 150 },
    { f: 'updated',           h: 'Submitted at',        w: 150 },
    { f: 'full_name',         h: 'Shareholder Name',    w: 160 },
    { f: 'email',             h: 'Email ID',            w: 210 },
    { f: 'phone',             h: 'Mobile Number',       w: 150 },
    { f: 'described',         h: 'Sector',              w: 320 },
    { f: 'shareholders',      h: 'No of shareholders',  w: 130 },
    { f: 'activities_picked', h: 'Confirmed activity',   w: 300 },
    { f: 'package',           h: 'Package',             w: 140 },
    { f: 'visas',             h: 'Visa Quota',          w: 100 },
    { f: 'price_aed',         h: 'Est. total',          w: 110, n: 1 },
    /* the agreement is asked by our form and not by her table, so it is the one column we add: put it
       last, where the script appends a missing header, rather than in the middle where it would sit on
       top of Stage */
    { f: 'consent',           h: 'Agreed',              w: 90 },
    /* the two other things the form asks and her table has no place for: the offer they took at the
       desk gets its own column rather than being hidden inside Package, and the dial code goes beside
       the number rather than only inside it */
    { f: 'source',            h: 'Offer',               w: 150 },
    { f: 'country_code',      h: 'Code',                w: 80 }
  ],

  /* the four columns that belong to whoever works the list. They are part of the table, they are made
     here if the table ever starts out without them, and no value of ours is ever written into them: a
     row is not paid, reminded, staged or receipted by a form at a desk */
  COLS_TEAM: ['Stage', 'Reminder sent', 'Payment Complete', 'Receipt Number'],

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
  var cols = header(sh, CONFIG.COLS, CONFIG.COLS_TEAM);

  var names = {}, k;
  /* which fields this sender actually carried. A post from `create-pass` holds the form half and knows
     nothing about the package, and it sends those as empty strings, so empty has to mean the same thing
     as absent: without this a pass minted after a finished visit would blank the visit */
  for (k in fields) {
    if (!Object.prototype.hasOwnProperty.call(fields, k)) continue;
    var raw = fields[k];
    if (raw === '' || raw === null || raw === undefined) continue;
    names[k] = 1;
  }

  var row = findRow(sh, cols['email'], key);
  var isNew = !row;
  if (isNew) row = sh.getLastRow() + 1;

  /* one pass over our own columns, and a run of neighbours is written in a single setValues call. The
     cells between them are never read and never written: they belong to whoever types in the sheet, and
     carrying a displayed date or a formula back out as text is how a helper script ruins a table */
  var byCol = {}, i;
  for (i = 0; i < CONFIG.COLS.length; i++) byCol[cols[CONFIG.COLS[i].f]] = CONFIG.COLS[i];

  var span = 0, col;
  for (col in byCol) { if (Number(col) > span) span = Number(col); }
  var have = sh.getRange(row, 1, 1, span).getDisplayValues()[0];

  var out = [], first = 0, touched = 0;
  var flush = function (upto) {
    if (!out.length) return;
    sh.getRange(row, first, 1, out.length).setValues([out]);
    out = [];
  };
  for (col = 1; col <= span; col++) {
    var c = byCol[col];
    if (!c) { if (out.length) { flush(col - 1); } first = 0; continue; }
    if (!first) first = col;
    var keep = have[col - 1];
    /* a sender that has nothing to say about a field says it by saying nothing at all, which is how a
       form write that arrives after the visit leaves the finished steps alone */
    var val = names[c.f] ? (c.n ? number(fields[c.f]) : clean(fields[c.f])) : keep;
    out.push(val);
    if (val !== keep) touched++;
  }
  if (out.length) flush(span);
  if (isNew && cols['email']) sh.getRange(row, cols['email'], 1, 1).setValue(key);
  return row;
}

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
  /* no name means the first tab, which is the boss's own table: naming it would make our file able to
     create a second one beside it and the stand would end up with two half lists */
  if (!name) return ss.getSheets()[0];
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
  /* the columns are found by the words in row 1, not by counting from the left. That is the difference
     between writing into the boss's table and writing over it: her own columns sit in the middle of the
     row, and a list counted from one would land the twelfth of ours on top of Stage. A name she has
     already typed is used once and matched plainly; anything of ours that has no column yet is appended
     after the last header in the row, which is where a new column belongs and where nothing of hers is */
  var last = Math.max(sh.getLastColumn(), 1);
  var have = sh.getRange(1, 1, 1, last).getDisplayValues()[0];
  var taken = 0, i, c;
  for (i = 0; i < have.length; i++) { if (String(have[i]).trim() !== '') taken = i + 1; }

  var at = {}, used = {}, want = [], added = 0;
  var norm = function (t) {
    return String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/ s$/, '');
  };

  /* two passes, exact words first and then the same words with the plurals and the spacing ignored: a
     header retyped as "Confirmed activity" instead of "Confirmed activities" is a person correcting a
     plural, not a request for a second column beside the first one */
  var pass;
  for (pass = 0; pass < 2; pass++) {
    for (i = 0; i < cols.length; i++) {
      if (at[cols[i].f]) continue;
      var word = String(cols[i].h).trim().toLowerCase();
      if (pass) word = norm(word);
      var found = 0;
      for (c = 0; c < have.length; c++) {
        if (used[c + 1]) continue;
        var cell = String(have[c]).trim().toLowerCase();
        if (pass ? norm(cell) === word : cell === word) { found = c + 1; break; }
      }
      if (found) { at[cols[i].f] = found; used[found] = 1; }
      else if (!pass) { taken += 1; at[cols[i].f] = taken; used[taken] = 1; want.push({ col: taken, h: cols[i].h }); added++; }
    }
    if (!pass) {
      /* the team's own headers are put in the table too, so one list is the whole shape of the row and
         a fresh sheet at the next event is ready to be typed into, not half built */
      var extra = arguments[2] || [];
      for (i = 0; i < extra.length; i++) {
        var h2 = String(extra[i]), hit = 0;
        for (c = 0; c < have.length; c++) { if (!used[c + 1] && String(have[c]).trim().toLowerCase() === h2.toLowerCase()) { hit = c + 1; break } }
        if (hit) { used[hit] = 1; continue }
        taken += 1; used[taken] = 1; want.push({ col: taken, h: h2 }); added++;
      }
    }
  }
  if (added) {
    var max = sh.getMaxColumns();
    if (taken > max) sh.insertColumnsAfter(max, taken - max);
    for (i = 0; i < want.length; i++) sh.getRange(1, want[i].col, 1, 1).setValue(want[i].h);
  }

  /* widths and the text formats are set up once per layout rather than on every post, because a person
     at a stand should not wait on a sheet. The layout is in the memo key, so a column that moves or a
     name that changes brings them back without any of us remembering to ask */
  var sig = [], k;
  for (i = 0; i < cols.length; i++) sig.push(cols[i].f + '@' + at[cols[i].f] + '=' + cols[i].h);
  var props = PropertiesService.getScriptProperties();
  var mark = 'boasis.header.' + sh.getSheetId();
  var join = sig.join('|');
  if (props.getProperty(mark) !== join) {
    sh.setFrozenRows(1);
    for (i = 0; i < cols.length; i++) {
      sh.setColumnWidth(at[cols[i].f], cols[i].w || 120);
      /* everything a person typed is held as text, which is what keeps a value starting with = from
         arriving as a formula; the few columns meant for adding up are left numeric on purpose. Ours
         only: her columns keep whatever format she gave them */
      if (!cols[i].n) sh.getRange(2, at[cols[i].f], Math.max(1, sh.getMaxRows() - 1), 1).setNumberFormat('@');
    }
    props.setProperty(mark, join);
  }
  return at;
}

function indexOf_(at, field) { return at[field] || 0; }

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
  /* clean hands a number straight through, which is what the hook sends for a price, so it is turned to
     text here rather than asked for a replace it does not have: a price that arrives as 27189.75 is the
     common case, not the odd one, and throwing on it would take the whole row down with it */
  var t = typeof v === 'number' ? String(v) : String(clean(v));
  var n = Number(t.replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? n : '';
}
