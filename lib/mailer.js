/* BOASIS · mail · the Google Workspace SMTP relay for boasis.ae.
   Design rules, in order:
     1 · a mail failure must never fail the visitor's request. The sign-up is stored
         first; mail goes out afterwards, and if it dies we log and move on.
     2 · the password is only ever read here, never logged, never put in a response.
     3 · no visitor PII in the console. Hostinger keeps those logs.
     4 · a send is never retried blindly. An idempotency key used to be handed to Resend,
         which de-duplicated it for us. A SMTP relay has no such thing, so a retry could
         mail a customer twice: the guard below is ours now, in memory, and it dies with
         the process. That is the honest limit of doing this without a vendor.

   What the relay gives back is thin, and that is the trade accepted in config/env.js:
   send() resolves with a Gmail message id and nothing else. There is no bounce webhook,
   no open tracking and no suppression list, so a dead address stays dead quietly. If
   confirmations start failing, the evidence will be in the log line below, nowhere else. */

const config = require('../config/env');
const T = require('./mail-templates');

const nodemailer = require('nodemailer');

let transport = null;
function getTransport() {
  if (transport) return transport;
  if (!config.mail.enabled || config.mail.dryRun) return null;
  transport = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    // STARTTLS on 587 is what the relay speaks. It is opportunistic by design here:
    // the relay answers on 587 with or without it, and refusing to downgrade would
    // turn a transient TLS problem into a failed enquiry.
    secure: config.mail.port === 465,
    requireTLS: true,
    auth: config.mail.user && config.mail.pass ? { user: config.mail.user, pass: config.mail.pass } : undefined,
    maxConnections: 5,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });
  return transport;
}

/* the one log line per send. Never the address, never the key. */
const tag = (kind, to) => `${kind.padEnd(18)} → ${to ? to.replace(/^[^@]+@/, '•••@') : 'unknown'}`;

/* the body we would have sent, for the log. Bounded, so a long message cannot flood it. */
const preview = t => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 90);

/* in-memory "already mailed this" guard, replacing the provider-side idempotency key.
   Keyed per recipient, so one person on two teams still gets one mail each. */
const SENT = new Map();
const SENT_TTL_MS = 6 * 60 * 60 * 1000;
function seen(key) {
  const now = Date.now();
  for (const [k, at] of SENT) if (now - at > SENT_TTL_MS) SENT.delete(k);   // cheap sweep, no timer
  if (SENT.has(key)) return true;
  SENT.set(key, now);
  return false;
}

async function send({ kind, to, subject, html, text, replyTo, dedupeKey }) {
  if (!to) return { ok: false, skipped: 'no-recipient' };
  if (!subject) return { ok: false, skipped: 'no-subject' };

  // nothing configured (fresh clone, CI, a box with no secrets): print, do not crash
  if (!config.mail.enabled || config.mail.dryRun) {
    console.log(`[mail:dry] ${tag(kind, to)} · ${subject}\n${String(text || preview(html)).split('\n').map(l => '          ' + l).join('\n')}`);
    return { ok: true, dryRun: true };
  }
  if (dedupeKey && seen(kind + '|' + to + '|' + dedupeKey)) return { ok: true, skipped: 'already-sent' };

  const t = getTransport();
  try {
    const info = await t.sendMail({
      from: config.mail.from,
      to,
      subject: (config.mail.subjectPrefix ? config.mail.subjectPrefix + ' ' : '') + subject,
      replyTo: replyTo || config.mail.replyTo,
      html, text,
      // the relay has no message tags, so the kind rides in a header instead: it is how
      // a mailbox rule or a grep of a raw .eml can still tell an enquiry from a sign-up
      headers: { 'X-BOASIS-Kind': kind },
    });
    console.log(`[mail:sent] ${tag(kind, to)} · ${subject} · id=${info && info.messageId ? String(info.messageId).slice(0, 24) : '?'}`);
    return { ok: true, id: info && info.messageId };
  } catch (e) {
    // a mail fault stays a log line, never a 500 for the visitor
    const msg = e && e.response ? String(e.response) : (e && e.message ? e.message : 'unknown');
    console.error(`[mail:error] ${tag(kind, to)} · ${msg.slice(0, 200)}`);
    if (/5\.7\.0|relay access denied|Relaying to_client/i.test(msg)) {
      console.error('[mail]   ↳ the relay refused this client. In Gmail admin: Apps > Google Workspace > Gmail >'
        + ' Route for email, allow this server IP (or send SMTP_USER/SMTP_PASS), and check the'
        + ' "allow any IP even if it does not conform to the SPF" box.');
    }
    return { ok: false, error: e && e.response ? 'relay-refused' : 'transport' };
  }
}

const now = () => new Date().toISOString().slice(0, 13);   // one hour bucket per record

/* ── the two events ──────────────────────────────────────────────────────────── */
async function notifyWaitlist(record, extra = {}) {
  const jobs = [];
  const rec = { ...record, ...extra };          // ip and friends come from the caller, not the form
  for (const to of config.mail.notifyTo) {
    jobs.push(send({ kind: 'waitlist:owner', to, ...T.waitlistToOwner(rec), dedupeKey: `${rec.email}|${rec.at}` }));
  }
  // the confirmation. keyed to the person, so a double-click cannot send two
  jobs.push(send({ kind: 'waitlist:user', to: record.email, ...T.waitlistToUser(record), dedupeKey: `${record.intent}|${now()}` }));
  return settle(jobs);
}

async function notifyContact(record) {
  const jobs = [];
  for (const to of config.mail.notifyTo) {
    jobs.push(send({ kind: 'contact:owner', to, ...T.contactToOwner(record), dedupeKey: `${record.email}|${record.at}` }));
  }
  jobs.push(send({ kind: 'contact:user', to: record.email, ...T.contactToUser(record), dedupeKey: `${record.about || 'x'}|${now()}` }));
  return settle(jobs);
}

function settle(jobs) {
  return Promise.allSettled(jobs).then(results => ({
    sent: results.filter(r => r.value && r.value.ok).length,
    failed: results.filter(r => r.status !== 'fulfilled' || !r.value.ok).length,
  }));
}

function status() {
  return {
    enabled: config.mail.enabled,
    dryRun: config.mail.dryRun,
    from: config.mail.from,
    relay: `${config.mail.host}:${config.mail.port}`,
    authed: !!(config.mail.user && config.mail.pass),
    notify: config.mail.notifyTo.map(a => a.replace(/^[^@]+@/, '•••@')),
  };
}

module.exports = { send, notifyWaitlist, notifyContact, status, T };
