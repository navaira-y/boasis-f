/* the mirror · every form the site accepts, copied into your own Supabase table
 *
 * The site has always kept its sign-ups as JSON files under DATA_DIR, and that is still what
 * happens first, so nothing here can lose a person. What the mirror adds is a copy that lives
 * outside the build folder. Hostinger puts each deploy in hbuilds/versions/<id>/, the app writes
 * into its own folder, so a deploy starts a fresh empty `data` and the live path stops showing the
 * names taken before it. A table cannot be unlinked by a build, and the dashboard next to it is
 * where the CSV comes from now on: no SSH, no file manager, no guessing which folder the process
 * is standing in.
 *
 * One door does all the work: POST <project>/functions/v1/save-lead with the kind, the record as
 * the site built it, and a shared key in a header. That function holds the database key, this file
 * never sees it, so nothing on the web host can read or write anywhere else in the project.
 *
 * The rule that keeps this from being a new way to break a form: the mirror's answer never changes
 * the visitor's. It is tried before the mail so a dead relay cannot hide a name, it has a short
 * timeout, and a failure is one log line. With no key set it is simply off, and the site behaves
 * exactly as it did before it existed.
 */
'use strict';

/* The four forms that exist today, and the names the table's check constraint knows. A new form is
   one string here plus one line in the SQL, and nothing else. */
const KINDS = ['early_access', 'waitlist', 'demo', 'contact'];

/* What never leaves the site: the bot traps and the gates. They are the visitor's browser's
   business, and a copy of them in a table is a way to hand someone a solved puzzle. */
const DROP = new Set(['hp', 'altcha', '_t', 'emailv', 'code', 'captcha', 'token']);
const MAX_STR = 500;                          // one field of a form is never worth more than this

/* the record as the mirror sends it: the answers, clipped, and nothing else */
function scrub(record) {
  const out = {};
  for (const [k, v] of Object.entries(record || {})) {
    if (DROP.has(k) || v === null || v === undefined) continue;
    if (typeof v === 'string') out[k] = v.length > MAX_STR ? v.slice(0, MAX_STR) : v;
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else { const s = JSON.stringify(v); out[k] = s.length > MAX_STR + 2 ? s.slice(0, MAX_STR) : v; }
  }
  return out;
}

function makeLeads(o = {}) {
  const cfg = o.config || {};
  const L = cfg.leads || {};
  const log = typeof o.log === 'function' ? o.log : () => {};
  const key = String(L.key || '').trim();
  const spark = cfg.spark || {};

  /* One value is enough to turn this on: the key. The URL then comes from the project the SPARK
     demo already talks to, so a new deployment is one secret and no new knowledge. LEADS_PUSH_URL
     overrides it, which is what you set if the mirror ever moves to another project. */
  const base = String(L.url || '').trim().replace(/\/+$/, '');
  const url = base || (key && spark.projectUrl
    ? String(spark.projectUrl).replace(/\/+$/, '') + '/functions/v1/save-lead' : '');
  const timeoutMs = Number(L.timeoutMs) > 0 ? Number(L.timeoutMs) : 2000;
  const fetchImpl = o.fetchImpl || (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);

  let sent = 0, failed = 0, lastError = '';
  const enabled = () => !!(url && key && fetchImpl);

  /* never throws, never returns a rejected promise: the caller is a visitor's request */
  async function push(kind, record) {
    if (!KINDS.includes(kind)) return { ok: false, skipped: 'kind' };
    if (!enabled()) return { ok: false, skipped: 'off' };
    const body = JSON.stringify({
      kind, key,
      at: (record && record.at) || new Date().toISOString(),
      record: scrub(record),
    });
    const init = {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-boasis-key': key },
      body,
    };
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      init.signal = AbortSignal.timeout(timeoutMs);
    }
    try {
      const r = await fetchImpl(url, init);
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        failed++; lastError = 'http ' + r.status;
        log('mirror refused ' + kind + ': ' + r.status + ' ' + String(text).slice(0, 120));
        return { ok: false, error: 'http ' + r.status };
      }
      await r.text().catch(() => '');          // drain it, the body is a log line at most
      sent++; lastError = '';
      log('mirrored ' + kind);
      return { ok: true };
    } catch (e) {
      failed++; lastError = (e && e.name) || 'error';
      log('mirror unreachable for ' + kind + ': ' + String(e && e.message || e).slice(0, 120));
      return { ok: false, error: lastError };
    }
  }

  /* what /api/health says, so a deploy can be checked from a browser: which host the copy goes to,
     how many landed, how many did not, and what the last one said. No key, no address, no names. */
  function status() {
    let host = '';
    if (enabled()) { try { host = new URL(url).host; } catch (e) { host = 'bad url'; } }
    return { enabled: enabled(), host, sent, failed, lastError };
  }

  return { push, status, enabled, url: () => url, KINDS };
}

module.exports = { makeLeads, scrub, KINDS };
