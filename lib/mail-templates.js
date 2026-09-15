/* BOASIS · email templates.
   Two per event: a note to us, a confirmation to the person who just signed up.
   Everything from a visitor is escaped before it touches HTML — a form field can
   otherwise turn into markup inside your own email.
   Email HTML rules: tables, inline styles, no flexbox, no external CSS, one column. */

const BRAND = {
  night: '#0B0D12', navy: '#17365E', blue: '#0E86C4', teal: '#5FD3E8',
  ink: '#14202A', muted: '#3A4A5E', line: '#E3E9F1', white: '#FFFFFF',
  site: 'https://boasis.ae', mail: 'support@boasis.ae',
};

/* Escape FIRST, then we are allowed to put the result inside a template. */
/* a subject is the one place a field is used *unescaped* (it becomes a mail header), so it
   gets stripped of control characters here too. validate.js already does this for real form
   input; this is the belt to that braces, for any caller that skips validation. */
const oneline = v => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

const esc = v => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const dateLong = d => new Date(d).toLocaleString('en-GB', {
  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai',
}) + ' (Dubai)';

const PLAN_LABEL = { standard: 'Standard', enterprise: 'Enterprise' };

/* the contact form asks one question: is this about setting a company up, or running one
   you already have. The words on the site are Set up and Manage; the words in a subject
   line have to stand alone, because a mail client shows nothing else. */
const ABOUT_LABEL = { setup: 'Company setup', manage: 'Company management' };
const aboutLabel = v => ABOUT_LABEL[String(v || '').toLowerCase()] || 'BOASIS';

/* ── the wrapper: night header with the wordmark, white body, one hairline ── */
function shell({ preheader, title, intro, body, footer }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.navy};-webkit-text-size-adjust:100%">
<div style="display:none;font-size:1px;color:${BRAND.navy};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.navy}">
<tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${BRAND.white};border-radius:14px;overflow:hidden;font-family:'Plus Jakarta Sans','Helvetica Neue',Arial,sans-serif">

<tr><td style="background:${BRAND.night};padding:26px 32px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="font-family:'Outfit','Helvetica Neue',Arial,sans-serif;font-size:19px;font-weight:600;letter-spacing:.14em;color:${BRAND.white}">B</td>
<td style="padding:0 7px"><span style="display:inline-block;width:15px;height:15px;border-radius:50%;background:${BRAND.teal};box-shadow:0 0 14px ${BRAND.teal}"></span></td>
<td style="font-family:'Outfit','Helvetica Neue',Arial,sans-serif;font-size:19px;font-weight:600;letter-spacing:.14em;color:${BRAND.white}">ASIS</td>
</tr></table>
</td></tr>

<tr><td style="padding:34px 32px 8px">
<p style="margin:0 0 12px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:${BRAND.blue};font-weight:600">The most advanced AI for company setup in the UAE</p>
<h1 style="margin:0 0 16px;font-family:'Outfit','Helvetica Neue',Arial,sans-serif;font-size:25px;line-height:1.25;font-weight:600;color:${BRAND.ink}">${esc(title)}</h1>
${intro ? `<p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:${BRAND.muted}">${intro}</p>` : ''}
${body}
</td></tr>

<tr><td style="padding:26px 32px 32px;border-top:1px solid ${BRAND.line}">
<p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:${BRAND.muted}">${footer || ''}</p>
<p style="margin:0;font-size:11px;line-height:1.7;color:#8A99AA">Boasis &middot; FZC &middot; United Arab Emirates &middot; <a href="${BRAND.site}" style="color:${BRAND.blue};text-decoration:none">boasis.ae</a></p>
</td></tr>

</table>
</td></tr></table>
</body></html>`;
}

/* a definition row for the "what they told us" block */
const row = (k, v) => (!v ? '' : `<tr>
<td style="padding:9px 0;font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:#8A99AA;vertical-align:top;width:120px">${esc(k)}</td>
<td style="padding:9px 0;font-size:15px;line-height:1.55;color:${BRAND.ink};font-weight:500">${esc(v)}</td></tr>`);

const panel = rows => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F4F7FB;border-radius:10px;padding:6px 16px;margin:0 0 22px">${rows}</table>`;

const btn = (label, href) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px"><tr><td style="background:${BRAND.navy};border-radius:999px">
<a href="${esc(href)}" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:600;color:${BRAND.white};text-decoration:none">${esc(label)}</a></td></tr></table>`;

/* ───────────────────────── 1 · new waitlist sign-up → to us ───────────────────────── */
function waitlistToOwner({ name, email, intent, business, at, ip }) {
  const plan = PLAN_LABEL[intent] || 'Standard';
  return {
    subject: `Waiting list: ${plan} plan, ${oneline(name)}`,
    preheader: `${name} joined the ${plan} waiting list.`,
    html: shell({
      preheader: `${name} joined the ${plan} waiting list.`,
      title: `Someone joined the ${plan} list`,
      intro: 'A new person is waiting for access to Manage.',
      body: panel([
        row('Name', name), row('Email', email), row('Plan', plan),
        business ? row('Business', business) : '', row('When', dateLong(at)), row('IP hash', ip),
      ].join('')),
      footer: `Reply straight to this email to write to them at ${esc(email)}.`,
    }),
    text: [
      'New BOASIS waitlist sign-up', '',
      `Name:    ${name}`, `Email:   ${email}`, `Plan:    ${plan}`,
      business ? `Business:${' '}${business}` : '', `When:    ${dateLong(at)}`, `IP hash: ${ip}`, '',
      `Reply to this email to write to them at ${email}.`,
    ].filter(Boolean).join('\n'),
    // reply-to the applicant, so hitting "reply" in the inbox reaches them
    replyTo: email,
  };
}

/* ───────── 2 · confirmation → to the person who signed up ───────── */
function waitlistToUser({ name, intent }) {
  const plan = PLAN_LABEL[intent] || 'Standard';
  const first = (name || 'there').split(' ')[0];
  return {
    subject: `You are on the BOASIS waiting list · ${plan}`,
    preheader: 'One email when your access is ready. Nothing else.',
    html: shell({
      preheader: `You are on the ${plan} list, ${first}.`,
      title: `You are on the ${plan} list, ${first}.`,
      intro: 'Thank you for joining. One email when access is ready, and nothing before it.',
      body: [
        panel([row('Plan', plan), row('Joined', new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dubai' }))].join('')),
        `<p style="margin:0 0 10px;font-size:15px;line-height:1.65;color:${BRAND.ink};font-weight:600">What happens next</p>`,
        `<p style="margin:0 0 8px;font-size:14px;line-height:1.7;color:${BRAND.muted}">&bull;&nbsp; We finish the first build of Manage with SPARK, then open it in the order people joined.</p>`,
        `<p style="margin:0 0 8px;font-size:14px;line-height:1.7;color:${BRAND.muted}">&bull;&nbsp; ${plan === 'Enterprise' ? 'For Enterprise we write to you first, to map your companies and departments before your access is shaped.' : 'Standard is priced per person, not per company. Your access opens with it.'}</p>`,
        `<p style="margin:0 0 22px;font-size:14px;line-height:1.7;color:${BRAND.muted}">&bull;&nbsp; Prices come with launch. You hear them before anyone else.</p>`,
        btn('See what BOASIS does', BRAND.site),
      ].join(''),
      footer: `To change the plan or leave the list, write to <a href="mailto:${BRAND.mail}" style="color:${BRAND.blue};text-decoration:none">${BRAND.mail}</a>`,
    }),
    text: [
      `You are on the BOASIS waiting list (${plan}).`, '',
      `Thank you ${first}. One email when access is ready, and nothing before it.`, '',
      'What happens next:', '1. We finish the first build of Manage with SPARK, then open it in the order people joined.',
      plan === 'Enterprise'
        ? '2. For Enterprise we write to you first, to map your companies and departments before your access is shaped.'
        : '2. Standard is priced per person, not per company. Your access opens with it.',
      '3. Prices come with launch. You hear them before anyone else.', '',
      `Boasis, FZC, United Arab Emirates`, `${BRAND.site}`,
    ].join('\n'),
  };
}

/* ───────── 3 · contact enquiry → to us ───────── */
function contactToOwner({ name, email, phone, organisation, about, message, at }) {
  const aboutText = ABOUT_LABEL[String(about || '').toLowerCase()] || 'General enquiry';
  return {
    subject: `Enquiry (${aboutText}) from ${oneline(name)}`,
    preheader: `${oneline(name)} wrote in about ${aboutText.toLowerCase()}.`,
    html: shell({
      preheader: `${oneline(name)} wrote in about ${aboutText.toLowerCase()}.`,
      title: 'A new enquiry',
      intro: 'This came in through the contact form.',
      body: [
        panel([
          row('Name', name), row('Email', email), row('Phone', phone),
          row('Company', organisation), row('About', aboutText), row('When', dateLong(at)),
        ].join('')),
        `<p style="margin:0 0 8px;font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:#8A99AA">Message</p>`,
        `<div style="background:#F4F7FB;border-left:3px solid ${BRAND.teal};border-radius:0 10px 10px 0;padding:16px 18px;margin:0 0 22px;font-size:15px;line-height:1.65;color:${BRAND.ink};white-space:pre-wrap">${esc(message) || '<em>no message</em>'}</div>`,
      ].join(''),
      footer: `Reply to this email to answer ${esc(email)} directly.`,
    }),
    text: [
      'New enquiry through the BOASIS contact form', '',
      `Name:     ${name}`, `Email:    ${email}`,
      phone ? `Phone:    ${phone}` : '', `Company:  ${organisation}`,
      `About:    ${aboutText}`, `When:     ${dateLong(at)}`, '',
      'Message:', message || 'The visitor left the message empty.',
      '', 'Reply to this email to answer them directly.'
    ].join('\n'),
    replyTo: email,
  };
}

/* ───────── 4 · receipt → to the person who wrote in ─────────
   Split by what they picked, because "thank you" that promises the wrong next step is
   worse than no receipt at all. A setup enquiry is answered with an offer of a demo;
   a company already running is answered with a review of what it has. */
function contactToUser({ name, about }) {
  const first = (name || 'there').split(' ')[0];
  const setup = String(about || '').toLowerCase() !== 'manage';
  const what = setup ? 'company setup' : 'company management';
  return {
    subject: setup ? 'Your enquiry about company setup is with BOASIS' : 'Your enquiry about managing your company is with BOASIS',
    preheader: 'We have your message. A person is reading it.',
    html: shell({
      preheader: `Thank you ${first}. Your message is with BOASIS.`,
      title: `Thank you ${first}. We have your message.`,
      intro: `Your enquiry about ${what} has been read by a person at BOASIS, and answered by email.`,
      body: [
        `<p style="margin:0 0 10px;font-size:15px;line-height:1.65;color:${BRAND.ink};font-weight:600">What happens next</p>`,
        `<p style="margin:0 0 8px;font-size:14px;line-height:1.7;color:${BRAND.muted}">&bull;&nbsp; A person at BOASIS reads the enquiry and prepares an answer for you.</p>`,
        setup
          ? `<p style="margin:0 0 8px;font-size:14px;line-height:1.7;color:${BRAND.muted}">&bull;&nbsp; The usual next step is a demo of Mira on your own activity list, with your rules and your prices.</p>`
          : `<p style="margin:0 0 8px;font-size:14px;line-height:1.7;color:${BRAND.muted}">&bull;&nbsp; The usual next step is a review of your companies, their dates and who is told what.</p>`,
        `<p style="margin:0 0 22px;font-size:14px;line-height:1.7;color:${BRAND.muted}">&bull;&nbsp; Anything you want to add? Reply to this email and it reaches the same person.</p>`,
        btn('boasis.ae', BRAND.site),
      ].join(''),
      footer: `This address is answered by a person: <a href="mailto:${BRAND.mail}" style="color:${BRAND.blue};text-decoration:none">${BRAND.mail}</a>`,
    }),
    text: [
      `Thank you ${first}.`, '',
      `We have your enquiry about ${what}. Here is what happens next:`, '',
      '1. A person at BOASIS reads it and prepares an answer for you.',
      setup
        ? '2. The usual next step is a demo of Mira on your own activity list, with your'
          + ' rules and your prices.'
        : '2. The usual next step is a review of your companies, their dates and who is told what.',
      '3. Reply to this email to add anything. It reaches the same person.', '',
      'Boasis, FZC, United Arab Emirates',
      BRAND.site,
    ].join('\n'),
  };
}

module.exports = { shell, esc, waitlistToOwner, waitlistToUser, contactToOwner, contactToUser, BRAND };
