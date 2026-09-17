/* The test half of the captcha: fetch a challenge from the running server, solve it the way
   a browser would, and hand back the field the forms post.

   It deliberately goes through the real HTTP endpoint and the real solver in js/captcha.js
   rather than reaching into lib/captcha.js and minting a payload. If the browser's half and
   the server's half ever drift apart, these tests are the only thing that would notice. */
const { solve } = require('../../js/captcha');

async function captchaField(base) {
  const r = await fetch(base + '/api/captcha', { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error('the challenge endpoint answered ' + r.status);
  const c = await r.json();
  const number = await solve(c);
  if (number === null) throw new Error('the challenge could not be solved');
  return Buffer.from(JSON.stringify({ ...c, number })).toString('base64');
}

/* a form body with a fresh, solved puzzle in it */
async function withCaptcha(base, body) {
  return { ...body, altcha: await captchaField(base) };
}

module.exports = { captchaField, withCaptcha };
