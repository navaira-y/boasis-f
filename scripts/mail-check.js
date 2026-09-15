#!/usr/bin/env node
/* BOASIS · mail smoke test. Run this before you trust a deploy.
     npm run mail:check              print what would be sent, send nothing
     npm run mail:check -- --send    put one real mail through the SMTP relay

   It checks the five things that actually break mail: credentials, a sender the relay will
   sign for, a reachable recipient, a reachable transport, and the templates rendering.
   Run it on the server, not on your laptop: the relay answer depends on the sending IP. */
const config = require('../config/env');
const mail = require('../lib/mailer');
const T = require('../lib/mail-templates');

const wantSend = process.argv.includes('--send');

/* an obviously-spammy payload, so you also see how the filters behave */
const sample = {
  name: 'Amina Al Mazroui <script>alert(1)</script>',
  email: 'amina@example.com',
  intent: 'enterprise',
  business: 'Skincare, online, across the Gulf & more "quoted" text',
  at: new Date().toISOString(),
  ip: 'a1b2c3d4e5f60718',
};

console.log('── configuration ─────────────────────────────────────────');
console.log('RELAY            ', `${config.mail.host}:${config.mail.port}${config.mail.port === 465 ? ' implicit TLS' : ' STARTTLS'}`);
console.log('SMTP_USER        ', config.mail.user || '(not set)');
console.log('SMTP_PASS        ', config.mail.pass ? `set, ${config.mail.pass.length} chars, never printed` : '(not set · only IP allowlist mode can send)');
console.log('MODE             ', config.mail.enabled && !config.mail.dryRun ? 'sending for real' : 'DRY RUN, nothing will be mailed');
console.log('MAIL_DRY_RUN     ', config.mail.dryRun);
console.log('MAIL_FROM        ', config.mail.from);
console.log('MAIL_REPLY_TO    ', config.mail.replyTo);
console.log('MAIL_NOTIFY_TO   ', config.mail.notifyTo.length ? config.mail.notifyTo.join(', ') : 'NONE → nobody would be told');
console.log('FROM DOMAIN      ', config.mail.fromDomain, '(the relay only signs for domains in this Workspace)');
console.log('VISITOR_SALT     ', config.visitorSalt ? 'set' : 'MISSING → dev fallback in use');
if (config.problems.length) { console.log('\n⚠ problems'); config.problems.forEach(p => console.log('   ' + p)); }

console.log('\n── templates render ──────────────────────────────────────');
const built = [
  ['waitlist → us', T.waitlistToOwner(sample)],
  ['waitlist → visitor', T.waitlistToUser(sample)],
  ['contact → us', T.contactToOwner({ name: 'Amina Al Mazroui', email: 'amina@example.com', phone: '+971 50 123 4567', organisation: 'Sharjah RB', message: 'We would like a demo for our free zone.', at: new Date().toISOString() })],
  ['contact → visitor', T.contactToUser({ name: 'Amina Al Mazroui' })],
  ['demo → us', T.demoToOwner({ name: 'Amina Al Mazroui', email: 'amina@example.com', phone: '+971 50 123 4567', who: 'gov', entity: 'SPARK Free Zone', at: new Date().toISOString() })],
  ['demo → visitor', T.demoToUser({ name: 'Amina Al Mazroui' })],
  ['manage → us', T.manageToOwner({ name: 'Amina Al Mazroui', email: 'amina@example.com', phone: '+971 50 123 4567', have: 'yes', count: '1-3', authority: 'SPARK Free Zone', at: new Date().toISOString() })],
  ['manage → visitor', T.manageToUser({ name: 'Amina Al Mazroui' })],
];
for (const [label, m] of built) {
  const htmlOK = typeof m.html === 'string' && m.html.length > 800;
  const textOK = typeof m.text === 'string' && m.text.length > 80;
  const injected = /<script>/i.test(m.html);           // must be false: escaped, not emitted
  console.log(`${label.padEnd(22)} subject=${m.subject ? 'yes' : 'NO '} html=${htmlOK ? m.html.length + 'b' : 'TOO SHORT'} text=${textOK ? 'ok' : 'TOO SHORT'} escape=${injected ? '❌ RAW SCRIPT TAG' : 'ok'}`);
}

console.log('\n── validation ────────────────────────────────────────────');
const { waitlistInput, contactInput } = require('../lib/validate');
[['good', 'Amina', 'amina@example.com'], ['bad email', 'Amina', 'NOT-AN-EMAIL'], ['no name', '', 'a@b.co'], ['name too long', 'x'.repeat(500), 'a@b.co'], ['sql-ish name', "'; DROP TABLE--", 'a@b.co']]
  .forEach(([label, name, email]) => {
    const r = waitlistInput({ name, email, intent: 'enterprise' });
    console.log(`${label.padEnd(14)} ok=${r.ok}  errors=[${r.errors}]  name.len=${r.name.length}  email=${r.email.slice(0, 30)}`);
  });

[['contact good', 'amina@example.com'], ['contact no message', 'a@b.co']].forEach(([label, email], i) => {
  const r = contactInput({ name: 'Amina', email, phone: '+971 50 123 4567', about: 'manage', message: i === 0 ? 'A demo please.' : '' });
  console.log(`${label.padEnd(22)} ok=${r.ok}  errors=[${r.errors}]  about=${r.about}  phone="${r.phone}"`);
});

if (!wantSend) {
  console.log('\n── dry run ───────────────────────────────────────────────');
  mail.notifyWaitlist(sample).then(() => {
    console.log('\nNothing was mailed. Re-run with --send on the server to put one real mail through the relay.');
  });
} else {
  console.log('\n── one real send ─────────────────────────────────────────');
  mail.send({
    kind: 'smoke-test',
    to: config.mail.notifyTo[0],
    subject: 'BOASIS · mail smoke test',
    html: T.shell({ preheader: 'Test', title: 'Mail works.', intro: 'If you can read this, the BOASIS relay is wired up correctly.', body: '', footer: 'Sent by <code>npm run mail:check -- --send</code>.' }),
    text: 'If you can read this, mail is wired up correctly.',
  }).then(r => console.log(r.ok ? (r.dryRun ? 'DRY RUN only · set SMTP_USER and SMTP_PASS to really send.' : "✅ accepted by the relay · delivery to each inbox is Gmail's call, not ours") : '❌ failed: ' + (r.error || r.skipped)));
}
