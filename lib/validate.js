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

/* the demo dialog: who they are, who they work for, and the same reachability rules.
   `who` is the only field the dialog's second step depends on, so it is refused outright
   rather than defaulted: a demo "for a company" that was meant for an authority is the
   wrong call being scheduled. */
const WHO_LABEL = { gov: 'Government authority', company: 'Company' };
function demoInput(body) {
  const b = (body && typeof body === 'object') ? body : {};
  const out = {
    ok: true,
    name: clip(b.name, 120),
    email: cleanEmail(b.email),
    phone: clip(b.phone, 32).replace(/\s{2,}/g, ' '),
    who: Object.keys(WHO_LABEL).includes(str(b.who).toLowerCase()) ? str(b.who).toLowerCase() : '',
    entity: clip(b.entity, 160),
    errors: [],
  };
  if (out.name.length < 2) out.errors.push('name');
  if (!validEmail(out.email)) out.errors.push('email');
  if (out.phone.replace(/\D/g, '').length < 7) out.errors.push('phone');
  if (!out.who) out.errors.push('who');
  if (!out.entity) out.errors.push('entity');
  if (out.errors.length) out.ok = false;
  return out;
}

/* the early access dialog: the same reachability rules, plus how far along they are.
   The three answer fields are small closed sets on purpose: anything else is stored as
   nothing, not as whatever a visitor or a script sent. */
const HAVE_LABEL = { yes: 'Yes', no: 'No' };
const COUNT_LABEL = { opening: 'Thinking of opening', '1': '1', '1-3': '1-3', '3plus': '3+' };
function manageInput(body) {
  const b = (body && typeof body === 'object') ? body : {};
  const out = {
    ok: true,
    name: clip(b.name, 120),
    email: cleanEmail(b.email),
    phone: clip(b.phone, 32).replace(/\s{2,}/g, ' '),
    have: Object.keys(HAVE_LABEL).includes(str(b.have).toLowerCase()) ? str(b.have).toLowerCase() : '',
    count: Object.keys(COUNT_LABEL).includes(str(b.count).toLowerCase()) ? str(b.count).toLowerCase() : '',
    authority: clip(b.authority, 160),
    plans: clip(b.plans, 300),
    errors: [],
  };
  if (out.name.length < 2) out.errors.push('name');
  if (!validEmail(out.email)) out.errors.push('email');
  if (out.phone.replace(/\D/g, '').length < 7) out.errors.push('phone');
  /* the company question branches: a company that exists is counted and named; one that
     is still a thought is described in a sentence. Nothing in either set is guessed. */
  if (!out.have) out.errors.push('have');
  else if (out.have === 'yes') {
    if (!out.count) out.errors.push('count');
    if (!out.authority) out.errors.push('authority');
  } else if (!out.plans) out.errors.push('plans');
  if (out.errors.length) out.ok = false;
  return out;
}

/* The bot traps, split into two kinds, because they are not equally certain.

   A trap that fires on something a robot does and a person cannot — filling a field no
   human can see — means a robot, and that submission is thrown away.

   A trap that fires on *timing* is a guess about a person. Someone filling a form with
   autofill, or pasting a message, or coming back to a tab left open over lunch, trips it
   while being perfectly real. Those used to be thrown away too, which meant a real visitor
   read "thank you" and their message was never stored and never mailed. So they are kept
   and marked instead: the lead lands, the owner is told why it looks odd, and a human
   decides. The captcha is what actually keeps the cost of automation high. */
function spamCheck(req, body, cfg) {
  const hard = [];    // robot, by its own hand: never stored
  const soft = [];    // worth knowing, not worth losing a lead over

  // 1 · honeypot: a field no human sees, so any value means a robot filled everything
  if (str(body.company_website).trim() || str(body.hp).trim()) hard.push('honeypot');

  // 2 · the fill time: posted faster than a person reads a form, or sent long after load
  const t0 = Number(body._t);
  if (Number.isFinite(t0) && t0 > 0) {
    const dt = Date.now() - t0;
    if (dt < cfg.spam.minFillMs) soft.push('too-fast');
    else if (dt > cfg.spam.maxAgeMs) soft.push('stale-form');
  } else if (!Number.isFinite(t0)) {
    /* no timing stamp at all. The page always adds one, so this is usually a script — but a
       script cannot solve the captcha either, and a real visitor whose page half-loaded
       should not lose their message over a missing field. */
    soft.push('no-timing-token');
  }

  // 3 · headers a real browser sends and a curl loop does not
  if (!str(req.headers['content-type']).includes('application/json')) hard.push('bad-content-type');

  // 4 · optional policy: business sign-ups from a free mailbox are usually noise
  if (cfg.spam.blockFreeMail && isFreeMail(body.email)) hard.push('free-mail');

  return { spam: hard.length > 0, why: [...hard, ...soft], hard, soft, flags: soft };
}

/* a body must be an object. '[]', '123' and 'null' are all valid JSON, so express.json
   happily parses them; without this the array case reached the handler as a truthy object
   and answered 200 while an empty {} answered 400 — two shapes, two rules. */
const plainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

module.exports = { validEmail, isFreeMail, waitlistInput, contactInput, demoInput, manageInput,
  WHO_LABEL, HAVE_LABEL, COUNT_LABEL, spamCheck, clip, plainObject };
