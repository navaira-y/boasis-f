# The stand's Google sheet

One row per person, one cell per field, and a second tab of what they asked Mira. This is a **view**,
not the record: the row in Supabase and the file on the host are what a person's visit actually is, and
a sheet that is deleted costs no lead.

Why it exists: the Brain writes a whole visit into the row as one JSON object, which is right in a
database and unreadable in a spreadsheet. An export of that table gives one cell with the entire
conversation in it. So the functions open the object and send named values, and a small file inside the
sheet decides which of them become columns.

## Setting it up, once

0. Supabase, SQL Editor: paste `demo/supabase/paste/sharjah-next-passes.sql`, which makes the table Mira
   writes the visit into (`demo/supabase/sharjah-next-passes.sql` is the same thing with the reasons
   beside it). Safe to paste twice.
1. Make the sheet. One blank Google Sheet is the whole thing, no header row and no second tab needed:
   the script makes both.
2. In the sheet: Extensions, Apps Script. Paste all of
   `demo/sheet/Boasis stand sheet.gs`. Put a long random string in `CONFIG.SECRET`.
3. Deploy, New deployment, Web app. Execute as **me**, Who has access **anyone**. Copy the `/exec`
   address. First run asks for permission to edit the spreadsheet, and nothing else.
4. In Supabase, Project Settings, Edge Functions, Secrets: `SHEET_HOOK_URL` (that `/exec` address) and
   `SHEET_HOOK_KEY` (the same random string).
5. Re-paste the three functions: `demo/supabase/paste/create-pass.js`, `save-step.js` and `save-lead.js`.
   Those three are the same files as the ones in `demo/supabase/dashboard/` with the comments taken out,
   which is the copy worth pasting at a stand; a test rebuilds both from the folder and fails if the two
   ever disagree by anything but prose. `get-lead.js` is in the folder too and does not need a re-paste.
6. On boasis.ae, in hPanel Environment Variables: `SPARK_SN_PASS = on`. That is what gives a person at
   this stand a pass at all, which is what lets Mira write on their row, which is what the sheet reads.

With 4 or 6 missing nothing breaks: the hook says `sheet skipped: off` in the log and the site behaves
exactly as it did before any of this.

## Who writes what

| when | who posts | what the row gets |
|---|---|---|
| the form is accepted | `save-lead` | reference, date, name, email, mobile, code, offer, consent |
| a pass is minted | `create-pass` | the same, plus Reached, Steps done, and the empty frame of the visit |
| each Mira step | `save-step` | what they said, the activities, the package, the price, and their questions |

One row per person because the match is the email address, the one field all three carry. A sender with
nothing to say about a field says nothing at all, and an empty cell is never written over a filled one,
so the order these arrive in does not matter and a late form write cannot erase a finished visit. The
answers tab is rewritten whole for that person on every post, so four steps leave four rows, not
sixteen.

All three ask one question first: is this row one of the event's? `save-step` and `create-pass` serve
boasis.ae/try-mira as well as the stand, and a website lead has no business in a spreadsheet about an
event, so a row in `spark_leads` or `site_leads` is answered with a log line and no call at all. The
gate reads the table each function just wrote to, which is the one thing that says which door a person
came through, and it lives in `STAND_TABLES` in `demo/supabase/functions/_shared/sheet.js`.

## What Google never gets

The pass (it is a key into that person's conversation), the hash of their email, when their credential
expires, and the mailbox proof. `fieldsFromLead` in `demo/supabase/functions/_shared/sheet.js` is the
only list that leaves, and it is a list rather than the row, so a field added to a record next month
does not arrive in a Google file by itself.

## Changing what she reads

The columns live in `CONFIG.COLS` in the sheet file and nowhere else: header words, order, widths, and
which cells are numbers. Add a line at the **end** of that list, and add the name to `fieldsFromLead`
only if the value is not already being sent. No page change, no site deploy, and nothing in the Brain.

## The Brain team

Nothing. She hands Mira a URL with `?pass=` in it, exactly as `/try-mira` does, and the Brain writes
through `get-lead` and `save-step` by that pass as it already does. Which table the row lives in is
decided by the site, not by them, and the sheet is written by our functions after their write, so they
are not told about it, not given a key, and not asked for a change.
