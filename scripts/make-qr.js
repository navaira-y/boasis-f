#!/usr/bin/env node
/* The QR for the stand · one code, one address, the orb in the middle
 *
 * It encodes https://boasis.ae/try-mira and nothing else. Three things about it are not taste,
 * and they are why this is a script rather than a picture from a web generator:
 *
 *   Error correction H. It rebuilds about 30% of the codewords, so the orb may stand in the
 *   middle. The script counts what it actually removed and refuses to go past a twelfth.
 *
 *   The hole is cut on whole modules. A module the disc touches is left out entirely rather than
 *   painted over in part, because a half-covered module is what makes a reader guess and no
 *   error correction helps with a shape a camera cannot see. The edge of the hole therefore
 *   steps, and every module is either there or not there.
 *
 *   Four modules of quiet zone on every side, which is what the standard asks for and what makes
 *   a code on a busy poster read on the first try.
 *
 * Then it reads the file back with a decoder at four sizes, because "it looks like a QR" is not
 * proof that it is one.
 *
 * Needs three packages the site itself does not use, so they stay out of package.json:
 *
 *   npm i --no-save qrcode sharp jsqr
 *   node scripts/make-qr.js                    → docs/qr/try-mira.png and .svg, then the check
 *   node scripts/make-qr.js --size=2400        → a bigger PNG for a bigger print
 *   node scripts/make-qr.js --url=https://…    → another address, same rules
 *
 * Three files come out: the PNG, the SVG for print, and one HTML file with the code inside it, for
 * opening on any machine and cropping the picture you want. The picture is in that file as data, so
 * the file does not depend on what sits next to it.
 */
'use strict';

const fs = require('fs');
const nodePath = require('path');

const ROOT = nodePath.resolve(__dirname, '..');
const arg = (name, dflt) => {
  const hit = process.argv.find(a => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : dflt;
};

const URL_TO_ENCODE = arg('url', 'https://boasis.ae/try-mira');
const SIZE = Number(arg('size', 1200));                       // px of the square PNG
/* docs/, on purpose: /docs/ is one of the closed prefixes in lib/protect.js, so nothing on the
   web can fetch the code back out of the deploy. /assets/ is served, and a QR filed there is a
   guessable file that says, in its own comment, the address the entrance lives at. */
const OUT = arg('out', 'docs/qr');
const LOGO = arg('logo', 'assets/logo/orb-512.png');
const LEVEL = 'H';
const QUIET = 4;                                              // modules of white, as the standard wants
const U = 8;                                                  // user units per module, so the maths stays whole

let qrLib, sharp, jsQR;
try {
  qrLib = require('qrcode');
  sharp = require('sharp');
  jsQR = require('jsqr');
} catch (e) {
  console.error('the three packages this needs are not installed:\n  npm i --no-save qrcode sharp jsqr\n(' + e.message.split('\n')[0] + ')');
  process.exit(1);
}

/* the page that carries the picture: nothing external in it, so it works off a USB stick */
function card(b64, url) {
  const shown = url.replace(/^https?:\/\//, '');        // the address as the code encodes it, less the scheme
  return `<!doctype html>
<!-- The QR for the stand, in one file, with the picture inside it. Open it anywhere and crop. -->
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${url}</title>
<style>
:root{--night:#0B0D12;--teal:#5FD3E8}
html,body{height:100%;margin:0}
body{background:radial-gradient(1100px 620px at 50% -8%, rgba(95,211,232,.14), transparent 62%),
  radial-gradient(900px 520px at 92% 96%, rgba(79,110,247,.12), transparent 60%), var(--night);
  color:#fff; display:grid; place-items:center; padding:40px; box-sizing:border-box;
  font-family:'PP Neue Montreal',ui-sans-serif,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
.stack{display:grid; justify-items:center; gap:24px; max-width:100%}
img{display:block; width:min(74vh, 92vw, 900px); height:auto; border-radius:18px; box-shadow:0 30px 90px rgba(0,0,0,.55)}
.addr{font-family:'PP Neue Machina','PP Neue Montreal',ui-sans-serif,sans-serif; font-weight:700;
  letter-spacing:.08em; font-size:clamp(20px,3.4vh,34px)}
.addr b{color:var(--teal); font-weight:700}
.hint{color:rgba(233,240,247,.6); font-size:clamp(13px,1.7vh,15px); margin-top:8px; text-align:center}
@media print{body{background:#fff; padding:0; display:block}
  img{box-shadow:none; border-radius:0; width:100%; max-width:170mm}
  .skip{display:none}}
</style></head><body>
<div class="stack">
<img alt="QR code for ${url}" src="data:image/png;base64,${b64}">
<div class="skip"><div class="addr">${shown.replace('.ae', '<b>.ae</b>')}</div>
<div class="hint">Point the camera of a phone at the code. It opens the page, and the code works as the key.</div></div>
</div></body></html>
`;
}

/* the code, as a grid of modules */
function symbol(url) {
  const sym = qrLib.create(url, { errorCorrectionLevel: LEVEL });
  const n = sym.modules.size;
  return { n, version: sym.version, at: (r, c) => !!sym.modules.data[r * n + c] };
}

/* the orb, measured rather than assumed: where its visible pixels actually are */
async function logoBox() {
  const file = nodePath.resolve(ROOT, LOGO);
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error('the logo has no visible pixels: ' + LOGO);
  return { box: { x0, y0, x1, y1 } };
}

async function build() {
  const s = symbol(URL_TO_ENCODE);
  const logo = await logoBox();

  const span = Math.max(5, Math.round(s.n * 0.24));           // modules the ring is allowed across
  const radius = span / 2 + 1;                                // plus one module of white, to breathe
  const mid = s.n / 2;
  const inHole = (c, r) => {
    const nx = Math.max(Math.abs(c + 0.5 - mid) - 0.5, 0);
    const ny = Math.max(Math.abs(r + 0.5 - mid) - 0.5, 0);
    return Math.hypot(nx, ny) < radius;
  };

  let gone = 0;
  const runs = [];
  for (let r = 0; r < s.n; r++) {
    let c = 0;
    while (c < s.n) {
      if (!s.at(r, c)) { c++; continue; }
      if (inHole(c, r)) { gone++; c++; continue; }
      let end = c;
      while (end < s.n && s.at(r, end) && !inHole(end, r)) end++;
      runs.push([c, r, end - c]);                             // one rect per unbroken run of a row
      c = end;
    }
  }
  const covered = gone / (s.n * s.n);
  if (covered > 0.12) {
    throw new Error('the orb would remove ' + (covered * 100).toFixed(1) + '% of the modules; H rebuilds about 30% of the codewords and no more');
  }

  const side = (s.n + QUIET * 2) * U;
  const d = runs.map(([c, r, w]) => `M${(c + QUIET) * U} ${(r + QUIET) * U}h${w * U}v${U}h${-w * U}z`).join('');
  const big = span * U;
  const ratio = (logo.box.y1 - logo.box.y0 + 1) / (logo.box.x1 - logo.box.x0 + 1);
  const b64 = fs.readFileSync(nodePath.resolve(ROOT, LOGO)).toString('base64');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" width="${side}" height="${side}">
<!-- ${URL_TO_ENCODE} · error correction ${LEVEL} · quiet zone ${QUIET} modules · ${(covered * 100).toFixed(1)}% of the modules step out of the orb's way -->
<rect width="${side}" height="${side}" fill="#fff"/>
<path fill="#0B0D12" d="${d}"/>
<image x="${side / 2 - big / 2}" y="${side / 2 - (big * ratio) / 2}" width="${big}" height="${big * ratio}" href="data:image/png;base64,${b64}"/>
</svg>
`;

  /* resolve, not join: join(ROOT, '/tmp/somewhere') hides a folder inside the repo, which is how
     an --out= that looks absolute ends up writing next to the source */
  const dir = nodePath.resolve(ROOT, OUT);
  fs.mkdirSync(dir, { recursive: true });
  const svgTo = nodePath.join(dir, 'try-mira.svg');
  const pngTo = nodePath.join(dir, 'try-mira.png');
  fs.writeFileSync(svgTo, svg);
  await sharp(Buffer.from(svg), { density: 300 }).resize(SIZE, SIZE).png({ compressionLevel: 9 }).toFile(pngTo);

  /* the one file you can open and crop: the PNG as data, on the night of the brand, with the address
     under it. Crop tight around the white square for print, or take the whole picture for a screen.
     On paper it prints the code alone, because the dark around it would only drink the toner. */
  const cardTo = nodePath.join(dir, 'try-mira-card.html');
  fs.writeFileSync(cardTo, card(fs.readFileSync(pngTo).toString('base64'), URL_TO_ENCODE));

  /* the same picture at four sizes, each read back by a decoder. The small ones are what a phone
     camera really sees: a printed card across a loud hall, at arm's length, in bad light. */
  const reads = [];
  for (const px of [SIZE, 600, 320, 160]) {
    const raw = await sharp(pngTo).resize(px, px).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const found = jsQR(new Uint8ClampedArray(raw.data), raw.info.width, raw.info.height);
    reads.push(px + 'px ' + (found && found.data === URL_TO_ENCODE ? 'ok' : 'FAILED'));
  }

  console.log('  encodes   ' + URL_TO_ENCODE);
  console.log('  symbol    ' + s.n + 'x' + s.n + ' modules, version ' + s.version + ', error correction ' + LEVEL);
  console.log('  quiet     ' + QUIET + ' modules of white on all four sides');
  console.log('  the orb   ' + span + ' modules across, with ' + (covered * 100).toFixed(1) + '% of the code standing out of its way');
  console.log('  files     ' + [pngTo, svgTo, cardTo].map(f => nodePath.relative(ROOT, f)).join(', '));
  console.log('  reads     ' + reads.join(' · '));
  if (reads.some(r => /FAILED/.test(r))) process.exitCode = 1;
}

build().catch(e => { console.error(e.message); process.exit(1); });
