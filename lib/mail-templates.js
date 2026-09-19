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

/* ── the pieces the reviewed copy is built from ─────────────────────────────────
   A body paragraph, a section heading, a numbered item, and the quiet aside the
   reader is asked to answer. One of each, used by all three visitor mails, so the
   three read as one voice rather than three designs. */
const para = html => `<p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:${BRAND.muted}">${html}</p>`;
const head = t => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${BRAND.ink};font-weight:600">${esc(t)}</p>`;
const step = (n, lead, text) => `<tr>
<td style="padding:0 0 14px;width:30px;vertical-align:top;font-size:12px;letter-spacing:.06em;color:#8A99AA;font-weight:600">${esc(n)}</td>
<td style="padding:0 0 14px;font-size:14.5px;line-height:1.65;color:${BRAND.muted}"><strong style="color:${BRAND.ink}">${esc(lead)}</strong> ${esc(text)}</td></tr>`;
const steps = rows => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px">${rows.join('')}</table>`;
const aside = html => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px"><tr>
<td style="background:#F4F7FB;border-left:3px solid ${BRAND.teal};border-radius:0 10px 10px 0;padding:16px 18px;font-size:14.5px;line-height:1.65;color:${BRAND.ink}">${html}</td></tr></table>`;
const quote = html => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px"><tr>
<td style="background:#F4F7FB;border-left:3px solid ${BRAND.teal};border-radius:0 10px 10px 0;padding:16px 18px;font-size:15px;line-height:1.65;color:${BRAND.ink};white-space:pre-wrap">${html}</td></tr></table>`;
const sign = (line, hours) => `<p style="margin:0;font-size:14.5px;line-height:1.7;color:${BRAND.muted}">${esc(line)}<br>The BOASIS Team<br>${hours ? esc(hours) + '<br>' : ''}<a href="mailto:${BRAND.mail}" style="color:${BRAND.blue};text-decoration:none">${BRAND.mail}</a> &middot; <a href="${BRAND.site}" style="color:${BRAND.blue};text-decoration:none">boasis.ae</a></p>`;
const linkline = (url, label, text) => `<p style="margin:0 0 10px;font-size:14.5px;line-height:1.65;color:${BRAND.muted}"><a href="${esc(url)}" style="color:${BRAND.blue};text-decoration:none;font-weight:600">${esc(label)}</a> ${esc(text)}</p>`;

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
    preheader: 'Your place is saved. The next email comes when your access is ready.',
    html: shell({
      preheader: `You're on the ${plan} early access list, ${first}.`,
      title: `You're on the early access list, ${first}.`,
      intro: 'Thank you for requesting early access to BOASIS. Your place is saved, and the next email comes when your access is ready.',
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
      `Thank you, ${first}. Your place is saved, and the next email comes when your access is ready.`, '',
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
function contactToUser({ name, email, message, at }) {
  const first = (name || 'there').split(' ')[0];
  const received = dateLong(at || Date.now());
  const title = `Thank you for writing to us, ${first}.`;
  const intro = 'Your message has reached our team and is now with the person best placed to answer it. You can expect a considered reply within two business days.';
  return {
    subject: 'We have received your message',
    preheader: 'Thank you for writing to us. A reply is on its way within two business days.',
    html: shell({
      preheader: `Thank you, ${first}. Your message has reached our team.`,
      title, intro,
      body: [
        head('Your message'),
        panel([row('Received', received), row('Reply to', email)].join('')),
        quote(esc(message) || '<em>no message</em>'),
        para('If anything else comes to mind, simply reply to this email. Your answer will land in the same conversation, with the full context already in front of us.'),
        head('While you wait'),
        linkline(BRAND.site + '/contact.html', 'Book a demonstration', 'thirty minutes, live, with the team.'),
        linkline(BRAND.site + '/#manage', 'Join the early access list', 'be among the first inside the platform.'),
        sign('With our best regards,', 'Monday to Friday, 9:00 to 18:00 Gulf Standard Time'),
      ].join(''),
      footer: `This is an automatic acknowledgement of the message sent from boasis.ae with ${esc(email)}.`,
    }),
    text: [
      title, '',
      intro, '',
      'Your message', '',
      `Received:  ${received}`,
      `Reply to:  ${email}`, '',
      message || 'The message was empty.', '',
      'If anything else comes to mind, simply reply to this email. Your answer will land in the same conversation, with the full context already in front of us.', '',
      'While you wait',
      `Book a demonstration: ${BRAND.site}/contact.html (thirty minutes, live, with the team).`,
      `Join the early access list: ${BRAND.site}/#manage (be among the first inside the platform).`, '',
      'With our best regards,',
      'The BOASIS Team',
      'Monday to Friday, 9:00 to 18:00 Gulf Standard Time',
      BRAND.mail, BRAND.site, '',
      `This is an automatic acknowledgement of the message sent from boasis.ae with ${email}.`,
      'BOASIS, United Arab Emirates.',
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

/* ───────── 6 · the demo booking → to the visitor ────────────────────────────
   The reviewed copy. One thing it cannot carry from our side: the time they chose,
   the joining link and the reschedule links live in Google's own booking, which
   mails them separately. So the line here says where those come from rather than
   promising a link this mail does not have. */
function demoToUser({ name, email, entity }) {
  const first = (name || 'there').split(' ')[0];
  const bookedBy = [oneline(name), oneline(entity)].filter(Boolean).join(', ');
  const title = `We look forward to meeting you, ${first}.`;
  const intro = 'Thank you for taking the time to book a session with us. Your demonstration of the BOASIS platform is confirmed, and Google has emailed you the joining link for the time you chose.';
  return {
    subject: 'Demo confirmed · BOASIS',
    preheader: 'Your thirty minutes with us, and what we will cover.',
    html: shell({
      preheader: `We look forward to meeting you, ${first}. Your demonstration is confirmed.`,
      title, intro,
      body: [
        panel([
          row('Duration', '30 minutes'), row('Format', 'Google Meet, video call'),
          bookedBy ? row('Booked by', bookedBy) : '',
        ].join('')),
        para('The joining link, the time and the reschedule or cancel links are in Google\'s own confirmation, sent to this address the moment you booked. If it has not arrived, check the spam folder, or write to ' + `<a href="mailto:${BRAND.mail}" style="color:${BRAND.blue};text-decoration:none">${BRAND.mail}</a>` + ' and we will send it ourselves.'),
        head('What we will cover'),
        steps([
          step('01', 'Where you stand today.', 'How licences, renewals, visas and compliance are handled across the entities you are responsible for, and where the time goes.'),
          step('02', 'Mira in your environment.', 'A working look at Mira, our intelligence layer, and then the two questions that matter for you: how Mira connects to the systems your teams already run, and how far you wish that mandate to extend. Mira is capable of carrying a file end to end, up to preparing and submitting a complete application. Where the line sits is yours to set, and we will agree it together.'),
          step('03', 'Scope and next steps.', 'Data handling, security, and what a first pilot would involve for your organisation.'),
        ]),
        aside(`<strong>One thing that would help.</strong> If you reply with the number of activities on your published list, and the external approvals that hold files up most often, we will build the session on your own catalogue rather than on a standard demonstration.`),
        sign('With our best regards,'),
      ].join(''),
      footer: `You are receiving this message because a demonstration was booked with ${esc(email)} on boasis.ae.`,
    }),
    text: [
      title, '',
      intro, '',
      'Duration:  30 minutes',
      'Format:    Google Meet, video call',
      bookedBy ? `Booked by: ${bookedBy}` : '', '',
      'The joining link, the time and the reschedule or cancel links are in Google\'s own confirmation, sent to this address the moment you booked. If it has not arrived, check the spam folder, or write to ' + BRAND.mail + ' and we will send it ourselves.', '',
      'What we will cover', '',
      '01  Where you stand today. How licences, renewals, visas and compliance are handled across the entities you are responsible for, and where the time goes.',
      '02  Mira in your environment. A working look at Mira, our intelligence layer, and then the two questions that matter for you: how Mira connects to the systems your teams already run, and how far you wish that mandate to extend. Mira is capable of carrying a file end to end, up to preparing and submitting a complete application. Where the line sits is yours to set, and we will agree it together.',
      '03  Scope and next steps. Data handling, security, and what a first pilot would involve for your organisation.', '',
      'One thing that would help. If you reply with the number of activities on your published list, and the external approvals that hold files up most often, we will build the session on your own catalogue rather than on a standard demonstration.', '',
      'With our best regards,',
      'The BOASIS Team', BRAND.mail, BRAND.site, '',
      `You are receiving this message because a demonstration was booked with ${email} on boasis.ae.`,
      'BOASIS, United Arab Emirates.',
    ].filter(l => l !== undefined).join('\n').replace(/\n\n\n+/g, '\n\n'),
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

/* ───────── 8 · early access → to the visitor ───────────────────────────────
   The reviewed copy: what they are joining, what happens next, and one question. */
function manageToUser({ name, email, at }) {
  const first = (name || 'there').split(' ')[0];
  const joined = new Date(at || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dubai' });
  const title = `Your place is reserved, ${first}.`;
  const intro = 'Thank you for your interest in BOASIS. You are now on the list for early access, and you will be among the first to use the platform when we begin opening accounts.';
  const body = [
    para('Once the licence is issued, the part nobody prepares you for begins. Import the licence you already hold, whoever set it up for you, and the platform carries it from there: renewals, visas, VAT, corporate tax, documents and deadlines, all held in one place, with a reminder before every date.'),
    head('What happens next'),
    steps([
      step('01', 'Your invitation will come by email.', 'On the day we open, you will receive a personal invitation with your access link and a short guide to setting up.'),
      step('02', 'Nothing is required from you meanwhile.', 'No payment, no commitment, and no further forms to complete.'),
    ]),
    aside(`<strong>May we ask one thing?</strong> Reply to this email and tell us, in a line or two, what you are trying to solve. We read every reply, and they decide what we build first.`),
    sign('We are glad to have you with us,'),
  ].join('');
  return {
    subject: 'You are on the early access list',
    preheader: 'Your place is reserved. Here is what we are building, and what happens next.',
    html: shell({
      preheader: `Your place is reserved, ${first}. Here is what we are building, and what happens next.`,
      title, intro, body,
      footer: `You joined the early access list with ${esc(email)} on ${esc(joined)}. We will only write to you about access, and nothing else. To leave the list, write to <a href="mailto:${BRAND.mail}" style="color:${BRAND.blue};text-decoration:none">${BRAND.mail}</a>.`,
    }),
    text: [
      title, '',
      intro, '',
      'Once the licence is issued, the part nobody prepares you for begins. Import the licence you already hold, whoever set it up for you, and the platform carries it from there: renewals, visas, VAT, corporate tax, documents and deadlines, all held in one place, with a reminder before every date.', '',
      'What happens next', '',
      '01  Your invitation will come by email. On the day we open, you will receive a personal invitation with your access link and a short guide to setting up.',
      '02  Nothing is required from you meanwhile. No payment, no commitment, and no further forms to complete.', '',
      'May we ask one thing? Reply to this email and tell us, in a line or two, what you are trying to solve. We read every reply, and they decide what we build first.', '',
      'We are glad to have you with us,',
      'The BOASIS Team', BRAND.mail, BRAND.site, '',
      `You joined the early access list with ${email} on ${joined}. We will only write to you about access, and nothing else. To leave the list, write to ${BRAND.mail}.`,
      'BOASIS, United Arab Emirates.',
    ].join('\n'),
  };
}

module.exports = { shell, esc, waitlistToOwner, waitlistToUser, contactToOwner, contactToUser,
  demoToOwner, demoToUser, manageToOwner, manageToUser, BRAND };
