var CONFIG = {

  SECRET: 'PASTE-THE-SAME-RANDOM-STRING-HERE',

  TAB_LEADS: '',
  TAB_ANSWERS: 'Answers',

  COLS: [
    { f: 'ref',               h: 'Unique Reference No', w: 140 },
    { f: 'at',                h: 'Started',             w: 150 },
    { f: 'updated',           h: 'Submitted at',        w: 150 },

    { f: 'full_name',         h: 'Name',                w: 150 },
    { f: 'shareholder_name',  h: 'Shareholder Name',    w: 160, from: 'full_name', first: 1 },
    { f: 'email',             h: 'Email ID',            w: 210 },
    { f: 'phone',             h: 'Mobile Number',       w: 150 },
    { f: 'described',         h: 'Sector',              w: 320 },
    { f: 'shareholders',      h: 'No of shareholders',  w: 130 },
    { f: 'activities_picked', h: 'Confirmed activity',   w: 300 },
    { f: 'package',           h: 'Package',             w: 140 },
    { f: 'visas',             h: 'Visa Quota',          w: 100 },
    { f: 'price_aed',         h: 'Est. total',          w: 110, n: 1 },

    { f: 'consent',           h: 'Agreed',              w: 90 },

    { f: 'source',            h: 'Offer',               w: 150 },
    { f: 'country_code',      h: 'Code',                w: 80 }
  ],

  COLS_TEAM: ['Stage', 'Reminder sent', 'Payment Completed', 'Receipt Number'],

  DROPDOWNS: [
    { h: 'Payment Completed', options: ['yes', 'no'] }
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
  var cols = header(sh, CONFIG.COLS, CONFIG.COLS_TEAM);

  var names = {}, k;

  for (k in fields) {
    if (!Object.prototype.hasOwnProperty.call(fields, k)) continue;
    var raw = fields[k];
    if (raw === '' || raw === null || raw === undefined) continue;
    names[k] = 1;
  }

  var row = findRow(sh, cols['email'], key);
  var isNew = !row;
  if (isNew) row = sh.getLastRow() + 1;

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

    var src = names[c.f] ? c.f : (c.from && names[c.from] ? c.from : '');
    var val = src ? (c.n ? number(fields[src]) : clean(fields[src])) : keep;
    if (c.first && String(keep).trim() !== '') val = keep;
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

  var last = Math.max(sh.getLastColumn(), 1);
  var have = sh.getRange(1, 1, 1, last).getDisplayValues()[0];
  var taken = 0, i, c;
  for (i = 0; i < have.length; i++) { if (String(have[i]).trim() !== '') taken = i + 1; }

  var fresh = true;
  for (i = 0; i < have.length; i++) { if (String(have[i]).trim() !== '') { fresh = false; break } }

  var at = {}, used = {}, want = [], added = 0;
  var norm = function (t) {
    return String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/ s$/, '');
  };

  var pass;
  for (pass = 0; pass < 3; pass++) {
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
      else if (pass === 2) { taken += 1; at[cols[i].f] = taken; used[taken] = 1; want.push({ col: taken, h: cols[i].h }); added++; }
    }
    if (pass === 2 && fresh) {

      var extra = arguments[2] || [];
      for (i = 0; i < extra.length; i++) {
        var h2 = String(extra[i]), hit = 0;
        for (c = 0; c < have.length; c++) {
          if (used[c + 1]) continue;
          var cell = String(have[c]).trim().toLowerCase();
          if (cell === h2.toLowerCase() || norm(cell) === norm(h2)) { hit = c + 1; break }
        }
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

  var sig = [], k;
  for (i = 0; i < cols.length; i++) sig.push(cols[i].f + '@' + at[cols[i].f] + '=' + cols[i].h);
  var dts = CONFIG.DROPDOWNS || [];
  for (i = 0; i < dts.length; i++) sig.push('dd:' + dts[i].h + '=' + (dts[i].options || []).join('/'));
  var props = PropertiesService.getScriptProperties();
  var mark = 'boasis.header.' + sh.getSheetId();
  var join = sig.join('|');
  if (props.getProperty(mark) !== join) {
    sh.setFrozenRows(1);
    for (i = 0; i < cols.length; i++) {
      sh.setColumnWidth(at[cols[i].f], cols[i].w || 120);

      if (!cols[i].n) sh.getRange(2, at[cols[i].f], Math.max(1, sh.getMaxRows() - 1), 1).setNumberFormat('@');
    }

    for (i = 0; i < dts.length; i++) {
      var word2 = String(dts[i].h).trim().toLowerCase();
      var dcol = 0;
      for (c = 0; c < have.length; c++) {
        if (String(have[c]).trim().toLowerCase() === word2 || norm(have[c]) === norm(word2)) { dcol = c + 1; break }
      }
      if (!dcol) continue;
      var rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(dts[i].options || ['yes', 'no'], true)
        .setAllowInvalid(false)
        .build();
      sh.getRange(2, dcol, Math.max(500, sh.getMaxRows()), 1).setDataValidation(rule);
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

  var t = typeof v === 'number' ? String(v) : String(clean(v));
  var n = Number(t.replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? n : '';
}
