/* BOASIS · what we accept from a form. One place, used by every endpoint.
   Rules: never trust the length, never trust the shape, never throw. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const str = v => (v == null ? '' : String(v));
const clip = (v, max) => str(v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

/* A plain address check is the honest scope here. A regex can be perfect or it can
   reject a real customer; rejecting a real customer is the worse failure. The SMTP relay
   answers for a mailbox that does not exist, and the reply it gives is the only signal
   there is: the relay keeps no bounce records for us (see docs/EMAIL.md). */
const validEmail = v => {
  const e = str(v).trim().toLowerCase();
  if (!e || e.length > 254) return false;
  return EMAIL_RE.test(e) && !/\.{2,}/.test(e);
};

/* the address as we store it: validated and cleaned by the same rules, so what passes
   the check is exactly what lands in the file and in the To: header. */
const cleanEmail = v => str(v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().toLowerCase().slice(0, 254);

const FREE_MAIL = ['gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com', 'icloud.com', 'aol.com', 'proton.me', 'protonmail.com', 'mail.ru', 'yandex.com', 'gmx.com'];
const isFreeMail = v => { const at = str(v).toLowerCase().lastIndexOf('@'); return at > -1 && FREE_MAIL.includes(v.slice(at + 1)); };

/* the waitlist: name, email, plan */
function waitlistInput(body) {
  const b = (body && typeof body === 'object') ? body : {};   // a null or non-object body is bad input, not a crash
  const out = {
    ok: true,
    name: clip(b.name, 120),
    email: cleanEmail(b.email),
    intent: ['standard', 'enterprise'].includes(str(b.intent).toLowerCase()) ? str(b.intent).toLowerCase() : 'standard',
    business: clip(b.business, 300),
    errors: [],
  };
  if (out.name.length < 2) out.errors.push('name');
  if (!validEmail(out.email)) out.errors.push('email');
  if (out.errors.length) out.ok = false;
  return out;
}

/* the contact form: who they are, how to reach them, and which half of BOASIS it is about.
   `about` is deliberately NOT reused from the waitlist's `intent`: that field already means
   Standard or Enterprise there, and one name carrying two vocabularies is how a "valid"
   submission quietly becomes the wrong default. Anything unrecognised falls back to setup,
   which is the safer guess for a marketing site: it promises a demo, not a company review.
   A phone number is free form on purpose. A strict pattern rejects the way people actually
   type one (+971, 050, spaces, brackets) and every rejection is a lost enquiry. */
function contactInput(body) {
  const b = (body && typeof body === 'object') ? body : {};
  const org = b.authority || b.organisation;
  const out = {
    ok: true,
    name: clip(b.name, 120),
    email: cleanEmail(b.email),
    phone: clip(b.phone, 32).replace(/\s{2,}/g, ' '),
    organisation: clip(org, 160),
    about: ['setup', 'manage'].includes(str(b.about).toLowerCase()) ? str(b.about).toLowerCase() : 'setup',
    message: clip(b.message, 2000),
    errors: [],
  };
  if (out.name.length < 2) out.errors.push('name');
  if (!validEmail(out.email)) out.errors.push('email');
  /* the owner asked for the phone to be required. Checked for a number, not a format: the
     page asks for one, so an empty value is refused, but the shapes people type are far too
     varied (+971, 050, spaces, brackets, extensions) for a pattern to be fair to anyone. */
  if (out.phone.replace(/[^\d]/g, '').length < 7) out.errors.push('phone');
  // a message is what makes an enquiry worth answering; without one there is nothing to do
  if (out.message.length < 4) out.errors.push('message');
  if (out.errors.length) out.ok = false;
  return out;
}

/* the bot traps, in order of how cheap they are to run */
function spamCheck(req, body, cfg) {
  const why = [];
  // 1 · honeypot: a field no human sees, so any value means a robot filled everything
  if (str(body.company_website).trim() || str(body.hp).trim()) why.push('honeypot');
  // 2 · the fill time: posted faster than a person reads a form
  const t0 = Number(body._t);
  const ua = str(req.headers['user-agent']);
  if (Number.isFinite(t0) && t0 > 0) {
    const dt = Date.now() - t0;
    if (dt < cfg.spam.minFillMs) why.push('too-fast');
    else if (dt > cfg.spam.maxAgeMs) why.push('stale-form');
  } else if (!Number.isFinite(t0)) {
    /* No token at all. The page always stamps one, so a submission without it is a script —
       and it is often a script wearing a borrowed "Mozilla/5.0" user-agent. Requiring the
       token costs an honest visitor nothing: a stale cached page just reloads. */
    why.push('no-timing-token');
  }
  // 3 · headers a real browser sends and a curl loop does not
  if (!str(req.headers['content-type']).includes('application/json')) why.push('bad-content-type');
  // 4 · optional policy: business sign-ups from a free mailbox are usually noise
  if (cfg.spam.blockFreeMail && isFreeMail(body.email)) why.push('free-mail');
  return { spam: why.length > 0, why };
}

/* a body must be an object. '[]', '123' and 'null' are all valid JSON, so express.json
   happily parses them; without this the array case reached the handler as a truthy object
   and answered 200 while an empty {} answered 400 — two shapes, two rules. */
const plainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

module.exports = { validEmail, isFreeMail, waitlistInput, contactInput, spamCheck, clip, plainObject };
