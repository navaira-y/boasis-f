/* BOASIS config · everything comes from the environment, never from a file in git.
   Loads .env if present (real env vars always win over the file). No dotenv dependency:
   Node has no built-in .env loader below 20.6, so we read the file ourselves.

   Mail goes through the Google Workspace SMTP relay for boasis.ae. That is a deliberate
   choice, not a default: the domain already receives on Google, DKIM already signs on
   Google, so app mail needs no new vendor, no new DNS and no new bill. What it gives up,
   known and accepted, is delivery visibility: no bounce classification, no webhooks, no
   suppression list, and app mail shares the reputation of the staff mailboxes. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* ── .env loader ─────────────────────────────────────────────────────────────
   Only KEY=VALUE lines. `#` starts a comment. Quotes are stripped.
   A real environment variable is never overwritten — that matters on Hostinger,
   where the panel sets the env and a stray .env must not shadow it. */
function loadEnv(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { return; }   // no .env → fine
  for (const line of raw.split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line)) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (key && !(key in process.env)) process.env[key] = val;
  }
}
loadEnv(path.join(ROOT, '.env'));

/* ── helpers ──────────────────────────────────────────────────────────────── */
const str = (k, d = '') => (process.env[k] || '').trim() || d;
/* Number('') is 0 and Number.isFinite(0) is true — so a variable left blank in .env
   (SPAM_MAX_AGE_MS=) silently became 0 instead of taking its default, which once made
   every single form submission look "stale" and get dropped. Blank must mean "unset". */
const num = (k, d) => { const raw = (process.env[k] || '').trim(); if (raw === '') return d; const v = Number(raw); return Number.isFinite(v) ? v : d; };
const bool = (k, d = false) => { const v = str(k).toLowerCase(); if (!v) return d; return v === '1' || v === 'true' || v === 'yes' || v === 'on'; };
const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || ''));
/* A display name is not part of the address. Two shapes must work: "a@b.co" and
   "BOASIS <a@b.co>". The obvious mistake, and the one made here first, is *stripping* the
   angle-bracket group: that leaves the display name and reports "BOASIS" as the address.
   Extract what is inside the brackets when there are any, else take the whole string. */
const addrOf = v => { const m = /<\s*([^>]+?)\s*>/.exec(String(v || '')); return (m ? m[1] : String(v || '')).trim(); };

/* ── the settings ─────────────────────────────────────────────────────────── */
const configFrom = str('MAIL_FROM', 'BOASIS <support@boasis.ae>');
const SMTP_USER = str('SMTP_USER');
const SMTP_PASS = str('SMTP_PASS');

const config = {
  nodeEnv: str('NODE_ENV', 'development'),
  port: num('PORT', 3000),

  /* how the first-visit detection salts the IP */
  visitorSalt: str('VISITOR_SALT', ''),

  /* ── mail ──
     DRY RUN is the default whenever the credentials are missing, so the site still runs on
     a fresh clone: the emails print to the log instead of failing. Two relay modes:
       SMTP_USER + SMTP_PASS  → authenticated relay, works from any IP
       no credentials         → IP allowlist mode, needs the server's IP added in Gmail
     With no credentials and no allowlist Gmail answers 5.7.0, which is why the log says so. */
  mail: {
    host: str('SMTP_HOST', 'smtp-relay.gmail.com'),
    port: num('SMTP_PORT', 587),
    user: SMTP_USER,
    pass: SMTP_PASS,
    // true = never open a socket, just log. An explicit MAIL_DRY_RUN=1 wins even with credentials.
    enabled: !!(SMTP_USER && SMTP_PASS),
    dryRun: bool('MAIL_DRY_RUN', !(SMTP_USER && SMTP_PASS)),
    from: configFrom,
    replyTo: str('MAIL_REPLY_TO', 'support@boasis.ae'),
    // who gets told: comma-separated, so one variable covers a team
    notifyTo: str('MAIL_NOTIFY_TO', 'support@boasis.ae').split(',').map(s => s.trim()).filter(isEmail),
    subjectPrefix: str('MAIL_SUBJECT_PREFIX', ''),
    /* The relay allows 10,000 recipients a day and shares that quota with the staff
       mailboxes. Two emails go out per submission, so the day cap is also the point where
       a flood would start eating the company's own mail. Past it, leads are still stored
       and the visitor still sees success: only the sending stops. */
    maxPerHour: num('MAIL_MAX_PER_HOUR', 60),
    maxPerDay: num('MAIL_MAX_PER_DAY', 400),
    /* the relay will only accept "From:" inside the domains it serves; a typo here fails
       every send with a confusing TLS-looking error, so catch it at boot. */
    fromDomain: addrOf(configFrom).split('@')[1] || '',
  },

  /* ── anti-spam on the forms ──
     a bot posts the instant it parses the page, so an honest form takes a moment */
  spam: {
    minFillMs: num('SPAM_MIN_FILL_MS', 3000),
    maxAgeMs: num('SPAM_MAX_AGE_MS', 30 * 60 * 1000),   // a tab left open overnight is not spam, just slow
    blockFreeMail: bool('SPAM_BLOCK_FREE_MAIL', false), // optional: refuse gmail/yahoo/etc on the waitlist
  },

  /* ── the captcha: a proof of work we run ourselves ──
     The secret signs the puzzles, so a script cannot invent its own easy one. It falls back
     to VISITOR_SALT on a fresh clone, and the boot warning says so out loud. The kill switch
     exists for one reason: if the widget ever breaks in production, the forms must not go
     down with it — CAPTCHA_DISABLED=1 and the site trades the captcha for the traps it had
     before, with no deploy. */
  captcha: {
    secret: str('CAPTCHA_SECRET', '') || str('VISITOR_SALT', '') || 'boasis-dev-only',
    difficulty: num('CAPTCHA_DIFFICULTY', 20000),   // the search space; half of it is the average
    disabled: bool('CAPTCHA_DISABLED', false),
  },

  /* ── how many proxies sit in front of us ──
     Express trusts X-Forwarded-For only up to this many hops, and it is what makes a
     forged header useless. 1 means "one proxy, and it appends the real client", which is
     the shape of shared hosting. Too low and every visitor shares one bucket; too high and
     a header can be invented again. TRUST_PROXY=0 ignores the header entirely. */
  trustProxy: Math.max(1, num('TRUST_PROXY', 1)),

  /* ── abuse limits ──
     Forms: 8 a minute per visitor is generous for a human and ruinous for a script. The
     relay also caps at 100 recipients per transaction and 10,000 a day, so a flood here
     would spend the same quota the staff mailboxes need. Raised only where a test drives
     many requests through one bucket on purpose. */
  limits: {
    forms: num('RATE_LIMIT_FORMS_PER_MIN', 8),
    visits: num('RATE_LIMIT_VISITS_PER_MIN', 60),
    /* The caps below count the whole site, so they hold even when the per-visitor bucket
       is fooled. Generous on purpose: a quiet day never comes near them, and a flood stops
       at a number the owner can live with instead of one the header decides. */
    formsPerMin: num('GLOBAL_FORMS_PER_MIN', 60),
    formsPerDay: num('GLOBAL_FORMS_PER_DAY', 2000),
    captchaPerMin: num('GLOBAL_CAPTCHA_PER_MIN', 600),
    visitsPerMin: num('GLOBAL_VISITS_PER_MIN', 900),
    newVisitorsPerMin: num('NEW_VISITORS_PER_MIN', 200),
  },

  /* where the sign-ups are kept, as JSON. Swap for a DB when this grows. */
  dataDir: str('DATA_DIR', path.join(ROOT, 'data')),
};

/* Refuse to run mail half-set-up: credentials with no usable sender is a silent failure
   waiting to happen, and so is a user with no password (the relay needs both or neither). */
const problems = [];
if (!isEmail(addrOf(config.mail.from))) problems.push('MAIL_FROM is not a usable address');
if (config.mail.enabled && !config.mail.notifyTo.length) problems.push('MAIL_NOTIFY_TO has no valid address');
if (config.mail.notifyTo.some(a => addrOf(a).split('@')[1] !== config.mail.fromDomain)) {
  problems.push('MAIL_NOTIFY_TO is outside the MAIL_FROM domain, so it will not reach the owner');
}
if (SMTP_USER && !SMTP_PASS) problems.push('SMTP_USER is set but SMTP_PASS is not · the relay needs both');
if (!SMTP_USER && SMTP_PASS) problems.push('SMTP_PASS is set but SMTP_USER is not · the relay needs both');
if (!config.visitorSalt) problems.push('VISITOR_SALT is empty · set a private one in production');
if (!str('CAPTCHA_SECRET', '')) problems.push('CAPTCHA_SECRET is empty · the captcha is signing puzzles with the visitor salt');
config.problems = problems;

module.exports = config;
