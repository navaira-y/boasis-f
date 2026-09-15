/* Prints the real config as JSON in a fresh process, so a test can load it under a
   controlled environment. Used by config.test.js. */
process.stdout.write(JSON.stringify(require('../../config/env.js')));
