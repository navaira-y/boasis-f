#!/usr/bin/env node
/* One pass of the three Sharjah Next triggers, run by hand instead of waiting for the timer:

     BOASIS_NO_ENV_FILE=1 node scripts/sharjah-watch.js
/* Running this while the app is up is safe on purpose: a letter is claimed on the disk before it is
   posted, so the two of them cannot send the same mail twice. The app's own beat is five seconds, so
   this exists to answer "did it go?" right now rather than waiting for the next pass. */

   It reads the stand's own queue in the data directory, asks the project what the visit and the sheet say
   about each reference, sends whichever mail is due, and prints what it did. Running it twice is safe for
   the same reason the timer is: a mail is marked when it goes, and the duplicate rule is per reference and
   per mail, so a second pass cannot send a person the same letter again.

   It is here because two things about this feature are otherwise invisible from a shell: whether the read
   of the sheet and of the pass rows actually answers, and how long a lead has been waiting. Both are
   answered by the line it prints, and neither needs a visitor to submit a form to find out. */

const path = require('path');
const config = require('../config/env');
const { makeLeads } = require('../lib/leads');
const watch = require('../lib/sharjah-watch');

const leads = makeLeads({ config, log: (m) => console.log('[leads] ' + m) });
const w = watch.create({
  dir: path.resolve(config.dataDir),
  log: (m) => console.log('[watch] ' + m),
  readFacts: (refs) => leads.watch(refs),
});

w.tick().then((r) => {
  console.log('[watch] ' + JSON.stringify(r));
  console.log('[watch] mode: ' + watch.snMode() + ' · queue: ' + path.join(path.resolve(config.dataDir), 'sharjah-next'));
  process.exitCode = 0;
}).catch((e) => {
  console.log('[watch] failed: ' + String((e && e.message) || e).slice(0, 160));
  process.exitCode = 1;
});
