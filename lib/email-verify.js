/* BOASIS · proof of the mailbox: a six-digit code, sent once, checked once.
   ---------------------------------------------------------------------------
   Why this exists: an early-access list is only worth something if the addresses on
   it are real and theirs. A form field called "email" proves nothing; a code read
   from the mailbox proves the visitor controls it. It also makes a scripted flood
   pointless — a bot can solve our captcha, but it cannot read someone's inbox.

   The protocol, exactly (same shape as the captcha's, and for the same reasons):

     1 · POST /api/verify-email/send { email }
         A six-digit code is minted, and only its hash is kept in memory. The mail
         goes through the normal mailer. Nothing is written to disk: a code that
         outlives a deploy is a code an attacker has a day to guess.
     2 · POST /api/verify-email/verify { email, code }
         Three tries, then this address must ask for a fresh code. On the third
         success the entry is deleted and the visitor is handed a signed token —
         base64 + HMAC, self-contained, replay-burned, exactly like a solved puzzle.
     3 · POST /api/manage { …, emailv }
         The token is checked against the email in the same body and burned when the
         signup is stored. One token, one signup, no reuse in either direction.

   Limits, so the feature cannot be turned into a weapon: one code per minute per
   address, three per ten minutes, six per hour — an attacker can harass one mailbox
   a little, and cannot bomb a thousand. The mail budget (docs/LIMITS.md) still
   caps everything on top. All state is a Map swept on use, like the captcha's. */
const crypto = require('crypto');
const config = require('../config/env');

const CODE_TTL_MS = config.verify.codeTtlMin * 60 * 1000;
const TOKEN_TTL_MS = config.verify.tokenTtlMin * 60 * 1000;
const GAP_MS = 60 * 1000;                    // the wait between two codes to one address
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 3;                    // per address, per window
const MAX_PER_HOUR = 6;                       // per address, hard stop
const MAX_WRONG = config.verify.maxWrong;     // tries before the code dies and a new one is needed

const hash = v => crypto.createHash('sha256').update(String(v)).digest('hex');
const hashEmail = email => hash((config.verify.secret || 'boasis-dev-only') + '|' + email).slice(0, 24);
const sign = v => crypto.createHmac('sha256', config.verify.secret).update(v).digest('hex').slice(0, 32);

/* ── the codes, in memory ────────────────────────────────────────────────────── */
const CODES = new Map();                     // hashEmail → { at, sentAt: [], wrong, exp }
function sweep(map, now) { for (const [k, v] of map) if (v.exp <= now) map.delete(k); }

function canSend(email) {
  const now = Date.now();
  sweep(CODES, now);
  const e = CODES.get(hashEmail(email));
  if (!e) return { ok: true };
  const recent = e.sentAt.filter(t => now - t < WINDOW_MS).length;
  const hour = e.sentAt.filter(t => now - t < 3600 * 1000).length;
  /* the gap is judged from the last ASK, refused ones included: an address that has to
     wait a minute would otherwise be asked for a code every ten seconds by a script
     counting on each refusal to restart the clock — a metronome is not a cooldown */
  const since = Math.max(e.at, e.lastBlocked || 0);
  if (now - since < GAP_MS) return { ok: false, why: 'too-soon', retryIn: Math.ceil((GAP_MS - (now - since)) / 1000) };
  /* four polite silences — the trap answers a script gets when it skips the page — and the
     address is spaced out like one that had been asked properly. The silence is for the
     script's education, not an open door between it and someone's inbox. */
  if ((e.quiet || 0) >= 4) return { ok: false, why: 'too-soon', retryIn: GAP_MS / 1000 };
  if (recent >= MAX_PER_WINDOW) return { ok: false, why: 'too-many-window' };
  if (hour >= MAX_PER_HOUR) return { ok: false, why: 'too-many-hour' };
  return { ok: true };
}

function issue(email) {
  const key = hashEmail(email);
  const now = Date.now();
  const prev = CODES.get(key);
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  CODES.set(key, { code, at: now, exp: now + CODE_TTL_MS, sentAt: [...(prev ? prev.sentAt : []), now].filter(t => now - t < 3600 * 1000), wrong: 0, lastBlocked: prev ? prev.lastBlocked : 0, quiet: 0 });
  return code;
}

/* a refused ask marks the wait and nothing else: no code is minted, no mail is queued,
   and no send history grows — a script burning the traps learns no new timing at all */
function blocked(email, quiet) {
  const key = hashEmail(email);
  const now = Date.now();
  const prev = CODES.get(key) || { at: 0, exp: now + GAP_MS, sentAt: [], wrong: 0 };
  /* the entry lives as long as it must — a mark on an address with a live code never
     shortens the code's own hour, or the sweep would erase a waiting visitor */
  CODES.set(key, { ...prev, exp: prev.code ? prev.exp : Math.max(prev.exp || 0, now + GAP_MS), lastBlocked: now, quiet: quiet ? (prev.quiet || 0) + 1 : (prev.quiet || 0) });
}

/* ── the token: base64 of { email, exp, sig } — carries its own proof ──────── */
const bodyOf = t => [t.email, t.exp].join('|');
function makeToken(email) {
  const t = { email, exp: Date.now() + TOKEN_TTL_MS };
  t.sig = sign(bodyOf(t));
  return Buffer.from(JSON.stringify(t)).toString('base64');
}

/* burned tokens live until their own expiry would have passed; a replay cannot outlive
   the replay, so the sweep is the same clock as everywhere else here */
const USED = new Set();
function check(email, token, burn) {
  const now = Date.now();
  let t;
  try { t = JSON.parse(Buffer.from(String(token), 'base64').toString('utf8')); } catch (e) { return false; }
  if (!t || typeof t !== 'object' || typeof t.email !== 'string' || typeof t.sig !== 'string') return false;
  const exp = Number(t.exp);
  if (!Number.isFinite(exp) || exp <= now) return false;
  const expected = sign(bodyOf(t));
  if (t.sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(t.sig), Buffer.from(expected))) return false;
  if (t.email !== email) return false;                 // the token is for the address in the same body, never another
  const tag = hash(t.sig);
  if (USED.has(tag)) return false;
  if (burn) {
    USED.add(tag);
    if (USED.size > 20000) USED.clear();               // a flooded box trades memory for honesty; the window is short anyway
  }
  return true;
}
/* peek: is this a real, fresh token for this address — without spending it. The route
   checks at the door and spends only when the signup is stored, so a visitor refused by
   the captcha can fix the form and send again with the same proof. */
const peek = (email, token) => check(email, token, false);
const consume = (email, token) => check(email, token, true);

function verifyCode(email, code) {
  const now = Date.now();
  sweep(CODES, now);
  const key = hashEmail(email);
  const e = CODES.get(key);
  if (!e) return { ok: false, why: 'none' };
  /* a spent address leaves a tombstone, not a hole: deleting the entry would also delete
     the minute's wait, and three wrong guesses would become a way to make the site mail
     again and again, instantly. The tombstone keeps the history and dies with the gap. */
  if (typeof e.code !== 'string') {                 // a tombstone: the old code is dead, only a new ask helps
    e.wrong += 1;
    return { ok: false, why: 'none' };
  }
  if (e.wrong >= MAX_WRONG) {
    CODES.set(key, { at: e.at, exp: now + GAP_MS, sentAt: e.sentAt, wrong: 0, lastBlocked: e.lastBlocked || 0 });
    return { ok: false, why: 'attempts' };
  }
  if (!/^\d{6}$/.test(String(code || ''))) { e.wrong += 1; return { ok: false, why: 'bad' }; }
  const given = Buffer.from(String(code));
  const want = Buffer.from(e.code);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) { e.wrong += 1; return { ok: false, why: 'bad' }; }
  CODES.set(key, { at: e.at, exp: now + GAP_MS, sentAt: e.sentAt, wrong: 0, lastBlocked: e.lastBlocked || 0 });   // one success, one code; the cooldown stays honest
  return { ok: true, token: makeToken(email) };
}

/* the endpoint's whole life, kept in one place so the route stays three lines and the
   tests drive exactly what a browser drives */
async function sendCode(email, mail) {
  const room = canSend(email);
  if (!room.ok) { if (room.why === 'too-soon') blocked(email); return { ok: false, why: room.why, retryIn: room.retryIn || 0 }; }
  const code = issue(email);
  const r = await mail.sendVerifyCode({ email, code, nonce: crypto.randomBytes(4).toString('hex') });
  if (!r || r.sent === 0) { CODES.delete(hashEmail(email)); return { ok: false, why: 'send-failed' }; }
  /* only a box that is not really mailing anyone — dry-run is on, which needs no credentials
     and nothing can switch off by accident, because the credentials path in config/env.js
     sets dry-run to true when they are missing — hands the code back, for tests and demos.
     A server that sends for real, or tries to, answers with silence about the code. */
  const dev = config.mail.dryRun;
  return { ok: true, sent: r.sent, devCode: dev ? code : null };
}

module.exports = { sendCode, verifyCode, peek, consume, canSend, blocked, hashEmail, issue,
  CODE_TTL_MS, TOKEN_TTL_MS, GAP_MS, MAX_PER_WINDOW, MAX_PER_HOUR, MAX_WRONG };
