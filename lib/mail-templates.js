/* BOASIS · email templates.
   Two per event: a note to the team, and a confirmation to the person on the other side.
   Everything from a visitor is escaped before it touches HTML — a form field can
   otherwise turn into markup inside your own email.
   Email HTML rules: tables, inline styles, no flexbox, no external CSS, one column.
   The ground is a light grey and the card is white; the header carries the site's own
   wordmark, B, the orb, ASIS, served from the site's asset rather than a circle drawn
   inside the mail client, so the mail is recognisably the site. */

const BRAND = {
  night: '#0B0D12', navy: '#17365E', blue: '#0E86C4', teal: '#5FD3E8',
  ink: '#14202A', muted: '#3A4A5E', line: '#E3E9F1', white: '#FFFFFF',
  mist: '#ECEEF1',
  site: 'https://boasis.ae', mail: 'support@boasis.ae',
  logo: 'https://boasis.ae/assets/logo/orb-160.png',
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

/* ── the soft traps, in words the owner can act on ──────────────────────────────
   A timing signal is not proof of a robot, so the lead is kept. The owner still deserves
   to know why it looked odd, in a line they can read in two seconds. */
const FLAG_LABEL = {
  'too-fast': 'filled in faster than a person usually types',
  'stale-form': 'the page sat open a long time before it was sent',
  'no-timing-token': 'sent without the timing stamp the page adds',
};
const flagText = flagged => String(flagged).split(',').map(f => FLAG_LABEL[f] || f).join(' · ');
const flagRow = flagged => (!flagged ? '' : row('Check', flagText(flagged)));

/* ── the wrapper: night header with the site's wordmark, light grey ground, white card ── */
function shell({ preheader, title, intro, body, footer }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.mist};-webkit-text-size-adjust:100%">
<div style="display:none;font-size:1px;color:${BRAND.mist};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.mist}">
<tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${BRAND.white};border-radius:14px;overflow:hidden;font-family:'Plus Jakarta Sans','Helvetica Neue',Arial,sans-serif">

<tr><td style="background:${BRAND.night};padding:26px 32px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="font-family:'Outfit','Helvetica Neue',Arial,sans-serif;font-size:19px;font-weight:600;letter-spacing:.14em;color:${BRAND.white}">B</td>
<td style="padding:0 7px"><img src="${BRAND.logo}" width="18" height="18" alt="BOASIS" style="display:block;width:18px;height:18px;border-radius:50%"></td>
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

/* ───────────────────────── 1 · new early access sign-up → to the team ───────────────────────── */
function waitlistToOwner({ name, email, intent, business, at, ip, flagged }) {
  const plan = PLAN_LABEL[intent] || 'Standard';
  const who = oneline(name);
  return {
    subject: `Early access · ${plan} plan${who ? ' · ' + who : ''}`,
    preheader: `${who || 'A visitor'} requested early access to BOASIS Manage (${plan} plan).`,
    html: shell({
      preheader: `${who || 'A visitor'} requested early access to BOASIS Manage (${plan} plan).`,
      title: 'A new early access request',
      intro: 'A visitor on the site requested early access to BOASIS Manage.',
      body: panel([
        row('Name', name), row('Email', email), row('Plan', plan),
        flagRow(flagged),
        business ? row('Business', business) : '', row('When', dateLong(at)), row('IP hash', ip),
      ].join('')),
      footer: `Reply to this email to answer ${esc(email)} directly.`,
    }),
    text: [
      'New BOASIS early access request', '',
      `Name:     ${name}`, `Email:    ${email}`, `Plan:     ${plan}`,
      business ? `Business: ${business}` : '', `When:     ${dateLong(at)}`, `IP hash:  ${ip}`,
      flagged ? `Check:    ${flagText(flagged)}` : '', '',
      `Reply to this email to answer ${email} directly.`,
    ].filter(Boolean).join('\n'),
    // reply-to the applicant, so hitting "reply" in the inbox reaches them
    replyTo: email,
  };
}

/* ───────── 2 · confirmation → to the person who requested access ───────── */
function waitlistToUser({ name, intent }) {
  const plan = PLAN_LABEL[intent] || 'Standard';
  const first = (name || 'there').split(' ')[0];
  return {
    subject: `You're on the early access list · ${plan}`,
    preheader: 'One email when your access is ready. Nothing before it.',
    html: shell({
      preheader: `You're on the ${plan} early access list, ${first}.`,
      title: `You're on the early access list, ${first}.`,
      intro: 'Thank you for requesting early access to BOASIS. One email when your access is ready, and nothing before it.',
      body: [
        panel([row('Plan', plan), row('Joined', new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dubai' }))].join('')),
        `<p style="margin:0 0 10px;font-size:15px;line-height:1.65;color:${BRAND.ink};font-weight:600">What happens next</p>`,
        `<p style="margin:0 0 8px;font-size:14px;line-height:1.7;color:${BRAND.muted}">&bull;&nbsp; We are finishing the first build of Manage with SPARK. Access opens in the order people joined.</p>`,
        `<p style="margin:0 0 8px;font-size:14px;line-height:1.7;color:${BRAND.muted}">&bull;&nbsp; ${plan === 'Enterprise' ? 'For Enterprise, our team writes to you first, to map your companies and departments before your access is shaped.' : 'Standard is priced per person, not per company, and opens with the first build.'}</p>`,
        `<p style="margin:0 0 22px;font-size:14px;line-height:1.7;color:${BRAND.muted}">&bull;&nbsp; Prices are set at launch. You hear them before anyone else.</p>`,
        btn('Explore BOASIS', BRAND.site),
      ].join(''),
      footer: `To change your plan or leave the list, write to <a href="mailto:${BRAND.mail}" style="color:${BRAND.blue};text-decoration:none">${BRAND.mail}</a>.`,
    }),
    text: [
      `You're on the BOASIS early access list (${plan}).`, '',
      `Thank you, ${first}. One email when your access is ready, and nothing before it.`, '',
      'What happens next:',
      '1. We are finishing the first build of Manage with SPARK. Access opens in the order people joined.',
      plan === 'Enterprise'
        ? '2. For Enterprise, our team writes to you first, to map your companies and departments before your access is shaped.'
        : '2. Standard is priced per person, not per company, and opens with the first build.',
      '3. Prices are set at launch. You hear them before anyone else.', '',
      `Boasis, FZC, United Arab Emirates`, `${BRAND.site}`,
    ].join('\n'),
  };
}

/* ───────── 3 · contact enquiry → to the team ───────── */
function contactToOwner({ name, email, phone, organisation, message, at, flagged }) {
  const who = oneline(name);
  return {
    subject: `New enquiry${who ? ' · ' + who : ''}`,
    preheader: `${who || 'A visitor'} sent a message through the contact form.`,
    html: shell({
      preheader: `${who || 'A visitor'} sent a message through the contact form.`,
      title: 'A new enquiry',
      intro: 'This came in through the contact form on the site.',
      body: [
        panel([
          row('Name', name), row('Email', email), row('Phone', phone),
        flagRow(flagged),
          organisation ? row('Company', organisation) : '', row('When', dateLong(at)),
        ].join('')),
        `<p style="margin:0 0 8px;font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:#8A99AA">Message</p>`,
        `<div style="background:#F4F7FB;border-left:3px solid ${BRAND.teal};border-radius:0 10px 10px 0;padding:16px 18px;margin:0 0 22px;font-size:15px;line-height:1.65;color:${BRAND.ink};white-space:pre-wrap">${esc(message) || '<em>no message</em>'}</div>`,
      ].join(''),
      footer: `Reply to this email to answer ${esc(email)} directly.`,
    }),
    text: [
      'New enquiry through the BOASIS contact form', '',
      `Name:     ${name}`, `Email:    ${email}`,
      phone ? `Phone:    ${phone}` : '',
      organisation ? `Company:  ${organisation}` : '',
      `When:     ${dateLong(at)}`,
      flagged ? `Check:    ${flagText(flagged)}` : '', '',
      'Message:', message || 'The visitor left the message empty.',
      '', 'Reply to this email to answer them directly.'
    ].join('\n'),
    replyTo: email,
  };
}

/* ───────── 4 · receipt → to the person who wrote in ───────────────────────
   One receipt, on purpose: the form asks no longer which half of BOASIS the
   enquiry is about, so the answer cannot promise the wrong next step. It offers
   both, plainly, and lets the reader choose. */
function contactToUser({ name }) {
  const first = (name || 'there').split(' ')[0];
  return {
    subject: 'We have your message · BOASIS',
    preheader: 'Your message has reached BOASIS. We will be in touch with you soon.',
    html: shell({
      preheader: `Thank you, ${first}. Your message has reached BOASIS.`,
      title: `Thank you, ${first}. We have your message.`,
      intro: 'We will be in touch with you soon.',
      body: [
        btn('boasis.ae', BRAND.site),
      ].join(''),
      footer: `This address is answered by a person: <a href="mailto:${BRAND.mail}" style="color:${BRAND.blue};text-decoration:none">${BRAND.mail}</a>.`,
    }),
    text: [
      `Thank you, ${first}. We have your message.`, '',
      'Your message has reached BOASIS. We will be in touch with you soon.', '',
      'Boasis, FZC, United Arab Emirates',
      BRAND.site,
    ].join('\n'),
  };
}

/* ───────── 5 · demo request → to the team · 6 · to the visitor ─────────────────────
   The dialog asks who they are before it asks for a time, so the owner mail says who is
   walking in, and the visitor mail promises exactly what the dialog promised: a person,
   by email, on their own activity list. */
const WHO_MAIL = { gov: 'Government authority', company: 'Company' };
function demoToOwner({ name, email, phone, who, entity, at, flagged }) {
  const whoLabel = WHO_MAIL[String(who || '').toLowerCase()] || '';
  const whoLine = oneline(name);
  return {
    subject: `Demo request${whoLabel ? ' · ' + whoLabel : ''}${whoLine ? ' · ' + whoLine : ''}`,
    preheader: `${whoLine || 'A visitor'} asked to book a demo of Mira.`,
    html: shell({
      preheader: `${whoLine || 'A visitor'} asked to book a demo of Mira.`,
      title: 'A demo request',
      intro: 'A visitor on the site asked to book a demo.',
      body: panel([
        row('Name', name), row('Email', email), row('Phone', phone),
        row('Who they are', whoLabel),
        who === 'gov' ? row('Authority', entity) : row('Company', entity),
        flagRow(flagged),
        row('When', dateLong(at)),
      ].join('')),
      footer: `Reply to this email to answer ${esc(email)} directly.`,
    }),
    text: [
      'New demo request through the BOASIS site', '',
      `Name:             ${name}`, `Email:            ${email}`,
      phone ? `Phone:            ${phone}` : '',
      whoLabel ? `Who they are:     ${whoLabel}` : '',
      entity ? (who === 'gov' ? `Authority:        ${entity}` : `Company:          ${entity}`) : '',
      `When:             ${dateLong(at)}`,
      flagged ? `Check:            ${flagText(flagged)}` : '', '',
      `Reply to this email to answer ${email} directly.`,
    ].filter(Boolean).join('\n'),
    replyTo: email,
  };
}

function demoToUser({ name }) {
  const first = (name || 'there').split(' ')[0];
  return {
    subject: 'We have your demo request · BOASIS',
    preheader: 'Your demo request has reached BOASIS. We will be in touch with you soon.',
    html: shell({
      preheader: `Thank you, ${first}. Your demo request has reached BOASIS.`,
      title: `Thank you, ${first}. We have your demo request.`,
      intro: 'We will be in touch with you soon.',
      body: [
        btn('boasis.ae', BRAND.site),
      ].join(''),
      footer: `This address is answered by a person: <a href="mailto:${BRAND.mail}" style="color:${BRAND.blue};text-decoration:none">${BRAND.mail}</a>.`,
    }),
    text: [
      `Thank you, ${first}. We have your demo request.`, '',
      'Your demo request has reached BOASIS. We will be in touch with you soon.', '',
      'Boasis, FZC, United Arab Emirates',
      BRAND.site,
    ].join('\n'),
  };
}

/* ───────── 7 · early access request → to the team · 8 · to the visitor ─────────────
   The dialog collects how far along they are: a company already registered in an authority
   reads differently in a planning call than one still being opened, so all three answers
   ride to the team with the name and the number. */
const HAVE_MAIL = { yes: 'Yes', no: 'No' };
const COUNT_MAIL = { opening: 'Thinking of opening', '1': '1', '1-3': '1-3', '3plus': '3+' };
function manageToOwner({ name, email, phone, have, count, authority, plans, at, flagged }) {
  const haveLabel = HAVE_MAIL[String(have || '').toLowerCase()] || '';
  const countLabel = COUNT_MAIL[String(count || '').toLowerCase()] || '';
  const who = oneline(name);
  return {
    subject: `Early access${who ? ' · ' + who : ''}`,
    preheader: `${who || 'A visitor'} asked to join early access to BOASIS Manage.`,
    html: shell({
      preheader: `${who || 'A visitor'} asked to join early access to BOASIS Manage.`,
      title: 'A new early access request',
      intro: 'A visitor on the site asked to join early access to Manage.',
      body: panel([
        row('Name', name), row('Email', email), row('Phone', phone),
        row('Company', haveLabel),
        String(have || '') === 'no'
          ? (plans ? row('Plans', plans) : '')
          : [countLabel ? row('How many', countLabel) : '', authority ? row('Authority', authority) : ''].join(''),
        flagRow(flagged),
        row('When', dateLong(at)),
      ].join('')),
      footer: `Reply to this email to answer ${esc(email)} directly.`,
    }),
    text: [
      'New early access request through the BOASIS site', '',
      `Name:       ${name}`,
      `Email:      ${email}`,
      phone ? `Phone:      ${phone}` : '',
      haveLabel ? `Company:    ${haveLabel}` : '',
      String(have || '') === 'no'
        ? (plans ? `Plans:      ${plans}` : '')
        : [
            countLabel ? `How many: ${countLabel}` : '',
            authority ? `Authority:  ${authority}` : '',
          ].filter(Boolean).join('\n'),
      `When:       ${dateLong(at)}`,
      flagged ? `Check:      ${flagText(flagged)}` : '', '',
      `Reply to this email to answer ${email} directly.`,
    ].filter(Boolean).join('\n'),
    replyTo: email,
  };
}

function manageToUser({ name }) {
  const first = (name || 'there').split(' ')[0];
  return {
    subject: `You're on the early access list, ${first}`,
    preheader: 'Your early access request has reached BOASIS. We will be in touch with you soon.',
    html: shell({
      preheader: `Thank you, ${first}. Your early access request has reached BOASIS.`,
      title: `Thank you, ${first}. We have your early access request.`,
      intro: 'We will be in touch with you soon.',
      body: [
        btn('Explore BOASIS', BRAND.site),
      ].join(''),
      footer: `To change the details or leave the list, write to <a href="mailto:${BRAND.mail}" style="color:${BRAND.blue};text-decoration:none">${BRAND.mail}</a>.`,
    }),
    text: [
      `Thank you, ${first}. We have your early access request.`, '',
      'Your early access request has reached BOASIS. We will be in touch with you soon.', '',
      'Boasis, FZC, United Arab Emirates',
      BRAND.site,
    ].join('\n'),
  };
}

module.exports = { shell, esc, waitlistToOwner, waitlistToUser, contactToOwner, contactToUser,
  demoToOwner, demoToUser, manageToOwner, manageToUser, BRAND };
