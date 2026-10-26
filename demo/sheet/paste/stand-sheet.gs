var CONFIG = {

  SECRET: 'PASTE-THE-SAME-RANDOM-STRING-HERE',

  TAB_LEADS: '',
  TAB_ANSWERS: 'Answers',

  COLS: [
    { f: 'ref',               h: 'Unique Reference No', w: 140 },
    { f: 'at',                h: 'Started',             w: 150 },
    { f: 'updated',           h: 'Submitted at',        w: 150 },
    { f: 'full_name',         h: 'Shareholder Name',    w: 160 },
    { f: 'email',             h: 'Email ID',            w: 210 },
    { f: 'phone',             h: 'Mobile Number',       w: 150 },
    { f: 'described',         h: 'Sector',              w: 320 },
    { f: 'shareholders',      h: 'No of shareholders',  w: 130 },
    { f: 'activities_picked', h: 'Confirmed activities', w: 300 },
    { f: 'package',           h: 'Package',             w: 140 },
    { f: 'visas',             h: 'Visa Quota',          w: 100 },
    { f: 'price_aed',         h: 'Est. total',          w: 110, n: 1 }
  ],

  ACOLS: [
    { f: 'ref', h: 'Reference', w: 110 },
    { f: 'key', h: 'Email',     w: 210 },
    { f: 'at',  h: 'Asked at',  w: 150 },
    { f: 'q',   h: 'They asked', w: 380 },
    { f: 'a',   h: 'Mira answered', w: 460 }
  ],

  MAX_FIELDS: 64,
  MAX_ANSWERS: 40,
  MAX_CELL: 4000
};

function doGet() {

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

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (busy) {

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

    out.push(names[c.f] ? (c.n ? number(fields[c.f]) : clean(fields[c.f])) : keep);
    if (out[i] !== keep) touched++;
  }
  if (isNew) out[cols['email'] - 1] = key;

  if (touched || isNew) sh.getRange(row, 1, 1, out.length).setValues([out]);
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
      if (del > 400) break;
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

function tab(ss, name, cols) {

  if (!name) return ss.getSheets()[0];
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getName() !== name) sh.setName(name);
  return sh;
}

function header(sh, cols) {
  var at = {}, want = [], i;
  for (i = 0; i < cols.length; i++) { at[cols[i].f] = i + 1; want.push(cols[i].h); }

  var props = PropertiesService.getScriptProperties();
  var mark = 'boasis.header.' + sh.getSheetId();
  var sig = cols.length + ':' + want.join('\u0001');
  if (props.getProperty(mark) === sig) return at;

  var have = sh.getMaxColumns() >= cols.length
    ? sh.getRange(1, 1, 1, cols.length).getDisplayValues()[0] : [];
  var same = have.length === cols.length;
  for (i = 0; same && i < cols.length; i++) { if (String(have[i]) !== String(want[i])) same = false; }
  if (!same) {
    sh.getRange(1, 1, 1, want.length).setValues([want]);
    sh.setFrozenRows(1);
  }
  for (i = 0; i < cols.length; i++) {
    sh.setColumnWidth(i + 1, cols[i].w || 120);

    if (!cols[i].n) sh.getRange(2, i + 1, Math.max(1, sh.getMaxRows() - 1), 1).setNumberFormat('@');
  }
  props.setProperty(mark, sig);
  return at;
}

function findRow(sh, col, key) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var vals = sh.getRange(2, col, last - 1, 1).getDisplayValues();

  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim().toLowerCase() === key) return i + 2;
  }
  return 0;
}

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

function number(v) {
  var n = Number(clean(v).replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? n : '';
}
