/* SPARK demo · the stub, for the night before
 *
 * The real thing is two Supabase edge functions writing JSON objects into a private bucket
 * (demo/supabase/functions). This is the same rules, on a laptop: it serves the offer page,
 * answers create-pass and save-step from the very module the functions import, and keeps the
 * objects in a temp folder. It exists so the flow can be walked through on a phone before
 * anyone has a Supabase project, and so a broken demo is found here rather than at a stand.
 *
 *   node scripts/spark-stub.js            →  http://localhost:8090
 *
 * Nothing in this file is deployed. The page falls back to these paths only on localhost.
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8090);
const DIR = process.env.SPARK_BUCKET_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'spark-bucket-'));

let core = null;

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8', '.ico': 'image/x-icon' };
const leadPath = (pass) => path.join(DIR, 'leads', pass + '.json');
const emailPath = (email) => path.join(DIR, 'by-email', crypto.createHash('sha256').update('spark-demo-stub|' + email).digest('hex') + '.json');
const readObj = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
const writeObj = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2)); };
const json = (res, code, body) => { const s = JSON.stringify(body, null, 2); res.writeHead(code, { 'Content-Type': MIME['.json'], 'Content-Length': Buffer.byteLength(s) }); res.end(s); };

function createPass(body, res) {
  const form = core.readForm(body);
  if (!form.ok) return json(res, 400, { ok: false, error: form.error });
  const now = Date.now();
  const seen = readObj(emailPath(form.contact.email));
  if (seen && seen.pass && core.isPass(seen.pass)) {
    const existing = readObj(leadPath(seen.pass));
    if (existing && Date.parse(existing.expires_at || 0) > now) return json(res, 200, { ok: true, pass: seen.pass, brain_url: '/brain', reused: true });
  }
  let pass = '';
  for (let i = 0; i < 5; i += 1) { const c = core.makePass(); if (!readObj(leadPath(c))) { pass = c; break; } }
  if (!pass) return json(res, 503, { ok: false, error: 'busy' });
  writeObj(leadPath(pass), core.buildLead({ pass, contact: form.contact, source: body && body.source, now }));
  writeObj(emailPath(form.contact.email), { pass, created_at: new Date(now).toISOString() });
  console.log('  pass ' + pass + ' for ' + form.contact.email + '  →  ' + leadPath(pass));
  json(res, 200, { ok: true, pass, brain_url: '/brain' });
}

function saveStep(body, res) {
  const pass = String((body && body.pass) || '');
  if (!core.isPass(pass)) return json(res, 400, { ok: false, error: 'pass' });
  const lead = readObj(leadPath(pass));
  const checked = core.checkPass(pass, lead, Date.now());
  if (!checked.ok) return json(res, checked.error === 'pass' ? 400 : 404, { ok: false, error: checked.error });
  const next = core.applyStep(checked.lead, String((body && body.step) || ''), (body && body.data) || {}, Date.now());
  if (!next) return json(res, 400, { ok: false, error: 'step' });
  writeObj(leadPath(pass), next);
  console.log('  ' + pass + ' saved ' + body.step + ' (version ' + next.version + ')');
  json(res, 200, { ok: true, version: next.version, steps_reached: next.brain.steps_reached });
}

/* a stand-in for the Brain: one step, saved through the same function the real UI will call,
   then the file it wrote shown as it lies on disk. This is the part worth rehearsing. */
const BRAIN_PAGE = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Stub Brain · SPARK demo</title><link rel="stylesheet" href="/spark.css">
<style>body{padding:32px 16px;max-width:760px;margin:0 auto}.card{padding:22px}textarea{min-height:120px}pre{background:#0B0D12;color:#B4C7DA;padding:14px;border-radius:12px;overflow:auto;font-size:13px}</style>
</head><body><div class="card"><p class="eyebrow">Stub, not Mira</p><h2>Describe your business</h2>
<p class="lead">What the real Brain does after this step, this page does too: one POST, one file updated.</p>
<form id="f"><div class="field"><label for="d">In your own words</label><textarea id="d">A small import business, one licence, two partners, need the visa count.</textarea></div>
<button class="cta" type="submit"><span class="dot"></span>Send the step</button></form>
<pre id="out">the file will appear here</pre></div>
<script>
var p=new URLSearchParams(location.search).get('pass')||'';
document.getElementById('f').addEventListener('submit',async function(e){e.preventDefault();
 var r=await fetch('/functions/v1/save-step',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pass:p,step:'describe',data:{description:document.getElementById('d').value,output:'Three activities fit: general trading, e commerce, consulting.',log:[{in:document.getElementById('d').value,out:'Three activities fit, and each one needs its own paper.'}]}})});
 var j=await r.json(); document.getElementById('out').textContent=JSON.stringify(j,null,2);
 var g=await fetch('/file?pass='+encodeURIComponent(p)); document.getElementById('out').textContent=await g.text();});
</script></body></html>`;

const server = http.createServer(async (req, res) => {
  if (!core) core = await import(path.join(ROOT, 'demo/supabase/functions/_shared/spark-core.js'));
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && url.pathname === '/functions/v1/create-pass') {
    return readBody(req, (b) => { try { createPass(JSON.parse(b || '{}'), res); } catch (e) { json(res, 400, { ok: false, error: 'json' }); } });
  }
  if (req.method === 'POST' && url.pathname === '/functions/v1/save-step') {
    return readBody(req, (b) => { try { saveStep(JSON.parse(b || '{}'), res); } catch (e) { json(res, 400, { ok: false, error: 'json' }); } });
  }
  if (url.pathname === '/file') {
    const pass = String(url.searchParams.get('pass') || '');
    if (!core.isPass(pass)) return json(res, 400, { ok: false, error: 'pass' });
    const obj = readObj(leadPath(pass));
    return obj ? json(res, 200, obj) : json(res, 404, { ok: false, error: 'unknown' });
  }
  if (url.pathname === '/brain') {
    res.writeHead(200, { 'Content-Type': MIME['.html'], 'X-Robots-Tag': 'noindex, nofollow' });
    return res.end(BRAIN_PAGE);
  }
  /* the real addresses, so a rehearsal is not a different site: /try-mira is served as
     boasis.ae serves it, with its css, its script and the site's own orb assets */
  const p0 = url.pathname.replace(/\/+$/, '') || '/';
  const SERVED = p0 === '/' || /^\/(?:try-mira(?:\.html)?|css\/.+|js\/.+|assets\/.+)$/.test(p0);
  if (!SERVED) { res.writeHead(404); return res.end('not part of the demo'); }
  const want = p0 === '/' ? '/try-mira' : p0;
  /* boasis.ae answers /try-mira from try-mira.html, so the rehearsal resolves the same way */
  const file = path.normalize(path.join(ROOT, path.extname(want) ? want : want + '.html'));
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(404); return res.end('not part of the demo'); }
  fs.readFile(file, (e, buf) => {
    if (e) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('missing: ' + path.relative(ROOT, file)); }
    /* the shipped file keeps its endpoint empty on purpose; the stub is the one that says
       "post here", so nothing about running a demo locally ever reaches the deploy */
    const out = /js[\/]try-mira\.js$/.test(file)
      /* whatever the shipped page points at is replaced, rather than one exact string being
         looked for: the page ships pointed at this site's own door now, and the stub answers at
         its own, and the rehearsal must not depend on the address in the file */
      ? Buffer.from(String(buf)
          .replace(/endpoint: '[^']*'/, "endpoint: '/functions/v1/create-pass'")
          .replace(/brainUrl: '[^']*'/, "brainUrl: '/brain'"))
      : buf;
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'X-Robots-Tag': 'noindex, nofollow' });
    res.end(out);
  });
});

function readBody(req, done) {
  let b = '';
  req.on('data', (c) => { b += c; if (b.length > 64 * 1024) { req.destroy(); } });
  req.on('end', () => done(b));
}

server.listen(PORT, '0.0.0.0', () => {
  // the real bound port, so PORT=0 works and a busy 8090 is not a dead end
  console.log('SPARK demo stub on http://localhost:' + server.address().port + '  (bucket: ' + DIR + ')');
  console.log('  the page at /try-mira is the real one, served as boasis.ae serves it; the two endpoints are the real rules, in ' + path.relative(ROOT, path.join(ROOT, 'demo/supabase/functions/_shared/spark-core.js')));
});
