/* BOASIS · the captcha: a proof of work, run on our own server.
   ---------------------------------------------------------------------------
   What it does: the visitor clicks one box. Their browser is handed a puzzle —
   find the number whose SHA-256 hash matches a value we picked — which takes a
   person's machine a fraction of a second and a spam script thousands of times
   more, because the cost is paid on every single submission. No images, no
   third party, nothing about the visitor leaving this process.

   Why it is written here rather than pulled in: the alternative vendors all cost
   something we do not want to spend. reCAPTCHA and Turnstile need an account,
   keys to rotate, a third party told every visitor's IP, and a looser Content
   Security Policy (script-src 'self' stops being true). This is about sixty lines
   of standard crypto, it is fully testable, and the CSP does not move.

   The protocol, exactly:

     1 · GET /api/captcha returns, signed:
           { algorithm: 'SHA-256', challenge, salt, maxNumber, expires, signature }
         where challenge = sha256(salt + number) for a number we picked at random
         and never disclose, and signature = HMAC(secret, the five fields joined).
         The signature is what stops a script inventing its own easy challenge.
     2 · The browser searches 0 … maxNumber for the number that reproduces
         challenge. It is the only way to find it: the hash cannot be reversed.
     3 · It posts the answer back, base64, in the form field named `altcha`.
     4 · We check the signature, the expiry, the hash — and then burn the
         signature, so the same solved puzzle cannot be replayed.

   Cost is set by maxNumber (CAPTCHA_DIFFICULTY): the expected search is half of
   it. 20,000 is about a tenth of a second on a laptop and makes a 10,000-post
   flood cost hours of CPU instead of seconds. */
const crypto = require('crypto');

const ALGORITHM = 'SHA-256';
const TTL_MS = 10 * 60 * 1000;          // a puzzle stays good for one sitting
const MAX_NUMBER = 20000;               // half of this is the average search
const MAX_PAYLOAD = 4096;               // a posted answer is a small object, never a novel

const sha256hex = text => crypto.createHash('sha256').update(text).digest('hex');

/* the five fields, joined the same way on both sides, signed with our secret */
const fieldsOf = c => [c.algorithm, c.challenge, c.salt, c.maxNumber, c.expires].join('|');
const sign = (secret, c) => crypto.createHmac('sha256', secret).update(fieldsOf(c)).digest('hex');

function makeChallenge(secret, opts = {}) {
  const maxNumber = Number(opts.maxNumber) > 0 ? Number(opts.maxNumber) : MAX_NUMBER;
  const salt = crypto.randomBytes(16).toString('hex');
  const number = crypto.randomInt(0, maxNumber);         // the answer; never leaves this process
  const c = {
    algorithm: ALGORITHM,
    challenge: sha256hex(salt + number),
    salt,
    maxNumber,
    expires: Date.now() + (Number(opts.ttlMs) > 0 ? Number(opts.ttlMs) : TTL_MS),
  };
  c.signature = sign(secret, c);
  return c;
}

/* the same search the browser does, kept server-side so the tests (and anyone
   debugging) can solve a challenge without a browser. Not used at runtime. */
function solveChallenge(c) {
  const max = Number(c.maxNumber) || MAX_NUMBER;
  for (let n = 0; n <= max; n++) if (sha256hex(c.salt + n) === c.challenge) return n;
  return null;
}

const toPayload = c => Buffer.from(JSON.stringify(c)).toString('base64');

/* ── the replay guard ──────────────────────────────────────────────────────────
   A solved puzzle that could be posted twice is not a captcha, it is a formality.
   Only successful sends burn one: a visitor whose form came back with a field
   error can fix it and send again without solving a second puzzle. The map is
   swept on use, so a busy minute cannot grow it without bound. */
const USED = new Map();
function sweep(now) {
  for (const [tag, until] of USED) if (until <= now) USED.delete(tag);
}
const tagOf = signature => crypto.createHash('sha256').update(String(signature)).digest('hex').slice(0, 16);
function isUsed(tag) { sweep(Date.now()); return USED.has(tag); }
function consume(tag, expires) { if (tag) USED.set(tag, Number(expires) || Date.now() + TTL_MS); }

/* ── checking the answer ───────────────────────────────────────────────────────
   Every failure says only that it failed. The caller decides what the visitor is
   told; nothing here echoes a value back, so a script learns nothing to tune on. */
function verify(secret, payload) {
  if (typeof payload !== 'string' || payload.length === 0 || payload.length > MAX_PAYLOAD) {
    return { ok: false, why: 'missing' };
  }
  let c;
  try { c = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')); } catch (e) { return { ok: false, why: 'unreadable' }; }
  if (!c || typeof c !== 'object' || Array.isArray(c)) return { ok: false, why: 'shape' };
  if (c.algorithm !== ALGORITHM) return { ok: false, why: 'algorithm' };
  if (typeof c.challenge !== 'string' || typeof c.salt !== 'string') return { ok: false, why: 'shape' };
  if (!/^[a-f0-9]{64}$/.test(c.challenge) || !/^[a-f0-9]{32}$/.test(c.salt)) return { ok: false, why: 'shape' };

  const maxNumber = Number(c.maxNumber);
  if (!Number.isInteger(maxNumber) || maxNumber <= 0 || maxNumber > 10_000_000) return { ok: false, why: 'maxnumber' };
  const expires = Number(c.expires);
  if (!Number.isFinite(expires) || expires <= Date.now()) return { ok: false, why: 'expired' };

  const expected = sign(secret, { algorithm: c.algorithm, challenge: c.challenge, salt: c.salt, maxNumber, expires });
  const given = String(c.signature || '');
  if (given.length !== expected.length) return { ok: false, why: 'signature' };
  if (!crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return { ok: false, why: 'signature' };

  const number = Number(c.number);
  if (!Number.isInteger(number) || number < 0 || number > maxNumber) return { ok: false, why: 'number' };
  if (sha256hex(c.salt + number) !== c.challenge) return { ok: false, why: 'wrong' };

  const tag = tagOf(given);
  if (isUsed(tag)) return { ok: false, why: 'replay' };
  return { ok: true, tag, expires };
}

module.exports = { makeChallenge, solveChallenge, toPayload, verify, consume, tagOf, isUsed,
  ALGORITHM, MAX_NUMBER, TTL_MS };
