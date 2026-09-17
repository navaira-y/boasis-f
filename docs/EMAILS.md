# BOASIS · every email the site sends, at every point

Who gets what, the moment they press the button. Subject lines are the real ones, from
`lib/mail-templates.js`; `support@boasis.ae` is the sender and the reply address throughout.

Every email is sent **twice-shaped**: HTML in the site's design, plus a plain-text twin of the
same sentences. Both come from one template, so they cannot drift apart.

---

## 1 · "Book a demo" dialog — home page (`/api/demo`)

### → To the team (one mail per address in `MAIL_NOTIFY_TO`)

- **Subject** `Demo request · Company · Amina Al Mazroui` (the parts that exist; a short one is `Demo request`)
- **Icon/wordmark**: BOASIS orb + wordmark, night header
- **Says**: "A visitor on the site asked to book a demo." — preheader "Amina Al Mazroui asked to book a demo of Mira."
- **Fields**: Name · Email · Phone · Who they are (Company / Government authority) · Company *or* Authority · When (Dubai time)
- **Reply-To**: the visitor. Pressing Reply in the inbox writes to the applicant.

### → To the visitor

- **Subject** `We have your demo request · BOASIS`
- **Says**: "Thank you, Amina. We have your demo request." / "We will be in touch with you soon."
- **Button**: `boasis.ae`
- **Footer**: "This address is answered by a person: support@boasis.ae"
- No promise of a time or a call — only that a person will write. (The dialog frames Google's calendar itself.)

---

## 2 · "Join early access" dialog — home page (`/api/manage`)

### → To the team

- **Subject** `Early access · Amina Al Mazroui`
- **Says**: "A visitor on the site asked to join early access to Manage."
- **Fields**: Name · Email · Phone · Company (Yes/No) — then branches:
  - if **no company yet** → Plans (what they typed)
  - if **yes** → How many (Thinking of opening / 1 / 1–3 / 3+) · Authority
  - When (Dubai time)
- **Reply-To**: the visitor

### → To the visitor

- **Subject** `You're on the early access list, Amina`
- **Says**: "Thank you, Amina. We have your early access request." / "We will be in touch with you soon."
- **Button**: `Explore BOASIS`
- **Footer**: "To change the details or leave the list, write to support@boasis.ae"
- Deliberately plain: a receipt, not a promise of a date.

---

## 3 · Contact form — `/contact.html` (`/api/contact`)

### → To the team

- **Subject** `New enquiry · Amina Al Mazroui`
- **Says**: "This came in through the contact form on the site."
- **Fields**: Name · Email · Phone · Company · When (Dubai time) — then the **message in full**, quoted in a panel, line breaks kept
- **Reply-To**: the visitor

### → To the visitor

- **Subject** `We have your message · BOASIS`
- **Says**: "Thank you, Amina. We have your message." / "We will be in touch with you soon."
- **Button**: `boasis.ae`
- **Footer**: "This address is answered by a person: support@boasis.ae"
- One receipt on purpose: the form asks which half of BOASIS the enquiry is about, so the
  template cannot promise the wrong next step — it just says a person will answer.

---

## 4 · Early-access sign-up form (`/api/waitlist`) — ⚠︎ no page posts to this any more

The endpoint, its storage file and both of its emails still exist and are tested, but **no form
on the site posts to it**: the two home-page dialogs (§1, §2) replaced it. So in practice these
two emails never fire. Either delete the endpoint, or point a form back at it — do not leave it
open and unused, because the guard still allows `POST /api/waitlist` to anyone who knows the URL.

- **To the team** — subject `Early access · Standard plan · Amina Al Mazroui`; fields Name · Email · Plan · Business · When · IP hash
- **To the visitor** — subject `You're on the early access list · Standard`; says "One email when your access is ready. Nothing before it." + three "What happens next" bullets + button `Explore BOASIS`

---

## The alert email (only when something is wrong)

Nothing here fires on a normal day. When a cap trips, the owner gets one short mail:

- **Subject**: `[BOASIS] form submissions: the site is being hit harder than usual`
- **Says**: which cap tripped and at what number, that the site is still up and leads are still
  being stored, and where to look (`docs/LIMITS.md`, `/api/health`)
- **At most once per half hour per kind of limit** — a flood must not be able to turn our
  warning system into the spam it is warning about
- **Never to a visitor**, and never to an address that submitted a form
- **Skips the sending budget**: the moment the mail cap trips is exactly the moment this has
  to get out

## A lead that looked odd

If a submission arrived quickly, or from a tab left open over lunch, it is **kept** and the
owner's notification carries one extra line:

```
Check:    filled in faster than a person usually types
```

Nothing is discarded for its timing — only a filled honeypot, a form-encoded post, or a
mailbox blocked by policy. See `docs/LIMITS.md` for the whole table.

## Rules that apply to all of them

| Rule | Where it lives |
|---|---|
| Record is written to `data/*.json` **first**, mail after — a dead SMTP relay never loses a lead | `server.js` |
| Visitor still sees success if mail fails (mail is best-effort) | `mailer.js` |
| Duplicate sends suppressed, 6-hour memory, keyed per record | `mailer.js` |
| Every field HTML-escaped; control characters stripped from anything that becomes a header | `mail-templates.js` |
| Dates always `Asia/Dubai` and labelled "(Dubai)" | `mail-templates.js` |
| Repeat recipients masked in the server log (`•••@domain`) | `mailer.js` |
| `MAIL_DRY_RUN=1` prints the whole email instead of sending | `config/env.js` |
| Bot-trapped submissions send nothing at all (they answer `{ok:true}` and are dropped) | `server.js` + `validate.js` |
| A dropped submission is silent to the sender, but never to us: one bounded log line names the trap, the endpoint and the salted IP hash | `noteTrap` in `lib/protect.js` |
| `npm run mail:check` renders all templates with a deliberately spammy payload; `--send` puts one real mail through the relay | `scripts/mail-check.js` |

## Known gaps, honestly

- **No unsubscribe link.** Every visitor mail says "write to support@boasis.ae" instead. Fine for
  transactional receipts; a legal requirement the moment anything becomes a newsletter.
- **`support@boasis.ae` is the only visible address.** No phone number, no street address in the
  footer.
- **The sender name is fixed** (`BOASIS <support@boasis.ae>`) plus an optional
  `MAIL_SUBJECT_PREFIX`, so the team can tag environment ("STAGING") if ever needed.
- **A failed send is logged, never retried.** `lib/mailer.js` prints `[mail:error]` with the
  relay's own message and a hint when the relay refuses the client, and the visitor still sees
  success. What does not exist is a retry queue or bounce handling — if the relay is down for
  an hour, those emails are simply not sent, though the record on disk keeps the lead.
- **No cap on total mail sent per hour or per day.** Eight form posts a minute per visitor is
  the only ceiling, and the Google Workspace relay allows 10,000 recipients a day on the same
  quota the staff mailboxes use.
