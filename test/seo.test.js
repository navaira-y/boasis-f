const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/* SEO and the machine-readable layer, tested as a served thing — the same way the contact
   page is. What is asserted here is what a crawler sees: the head of every page, the three
   files a search engine fetches by name, and the structured data that a search engine or an
   AI assistant reads instead of guessing what the business is.

   Two rules run through all of it. Nothing is invented: no review scores, no prices, no
   addresses, no dates that are not already written on a page. And the sitemap may never
   offer a page that says noindex, or hide a page that says index — the two must agree, or
   Search Console reports the contradiction for months. */

const ROOT = path.resolve(__dirname, '..');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'boasis-seo-'));
const SITE = 'https://boasis.ae';
let proc, base;

before(async () => {
  proc = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: '0', DATA_DIR: DATA, MAIL_DRY_RUN: '1', VISITOR_SALT: 'test-salt', RATE_LIMIT_FORMS_PER_MIN: '10000', RATE_LIMIT_VISITS_PER_MIN: '10000' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server did not start: ' + log)), 15000);
    proc.stdout.on('data', d => { log += d; if (/port \d{2,6}/.test(log)) { clearTimeout(t); res(); } });
    proc.on('exit', c => rej(new Error('exited ' + c + ': ' + log)));
  });
  base = 'http://127.0.0.1:' + /port (\d+)/.exec(log)[1];
});
after(() => { proc.kill('SIGTERM'); try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) {} });

const get = p => fetch(base + p);
const text = async p => (await get(p)).text();

/* every page of the site, and the one address each answers at */
const PAGES = [
  ['/', '/index.html', 'index'],
  ['/contact.html', '/contact.html', 'index'],
  ['/blog.html', '/blog.html', 'index'],
  ['/privacy.html', '/privacy.html', 'noindex'],
  ['/terms.html', '/terms.html', 'noindex'],
];
const indexable = PAGES.filter(p => p[2] === 'index').map(p => p[1]);

const attr = (html, re) => { const m = re.exec(html); return m ? m[1] : null; };
const meta = (html, name) => attr(html, new RegExp(`<meta name="${name}" content="([^"]*)"`));
const prop = (html, name) => attr(html, new RegExp(`<meta property="${name}" content="([^"]*)"`));
const jsonld = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));

/* ── the files a crawler asks for by name ──────────────────────────────────────────────── */
test('robots.txt is served, allows the site, and points at the sitemap', async () => {
  const r = await get('/robots.txt');
  assert.equal(r.status, 200, 'a crawler must be able to read it');
  assert.match(r.headers.get('content-type') || '', /text\/plain/, 'robots.txt is plain text');
  const txt = await r.text();
  assert.match(txt, /^User-agent: \*$/m, 'the wildcard group');
  assert.match(txt, /^Allow: \/$/m, 'everything public is open');
  assert.match(txt, /^Disallow: \/api\/$/m, 'the API is the one closed path');
  assert.match(txt, /^Sitemap: https:\/\/boasis\.ae\/sitemap\.xml$/m, 'the sitemap is declared, absolute');
  /* GEO: the AI answer engines are named, so an operator does not have to guess whether
     this site wants to be read by them. Search ranking does not depend on any of this. */
  for (const bot of ['GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'Bingbot']) {
    assert.match(txt, new RegExp('^User-agent: ' + bot + '$', 'm'), bot + ' is not named');
  }
  assert.ok(!/^Disallow: \/$/m.test(txt), 'nothing may close the whole site');
});

test('sitemap.xml is valid, absolute, and lists exactly the pages that may be indexed', async () => {
  const r = await get('/sitemap.xml');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') || '', /xml/, 'served as XML');
  const xml = await r.text();
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/, 'a declared, well-formed document');
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(xml, /<\/urlset>\s*$/, 'closed, with nothing after it');

  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.deepEqual(locs, [SITE + '/', SITE + '/contact.html', SITE + '/blog.html'],
    'the three indexable pages, in that order, and nothing else');
  for (const loc of locs) {
    assert.ok(loc.startsWith(SITE + '/'), loc + ' must be absolute, on the canonical host');
    assert.ok(!/[?#]/.test(loc), loc + ' must carry no query or fragment');
  }
  /* the same page must not be offered twice: /contact is /contact.html under another name */
  assert.ok(!locs.includes(SITE + '/contact'), 'the short path must not be listed as a second page');
  for (const p of ['privacy.html', 'terms.html']) {
    assert.ok(!locs.some(l => l.endsWith(p)), p + ' says noindex and must stay out of the sitemap');
  }
  /* The date is judged in the site's own timezone, not the runner's: on a box still on the
     15th in UTC, a lastmod of the 16th is today in Dubai, and calling that a lie would fail
     the build for being west of the business. */
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' }).format(new Date());
  for (const m of xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) {
    assert.match(m[1], /^\d{4}-\d{2}-\d{2}$/, 'lastmod is a plain date');
    assert.ok(m[1] <= today, 'lastmod ' + m[1] + ' is in the future (today is ' + today + ' in Dubai)');
  }
  /* and every URL it offers must actually answer */
  for (const loc of locs) {
    const r2 = await fetch(loc.replace(SITE, base));
    assert.equal(r2.status, 200, loc + ' is in the sitemap but does not load');
  }
});

test('llms.txt gives an assistant the same facts the site gives a visitor', async () => {
  const r = await get('/llms.txt');
  assert.equal(r.status, 200, 'the AI-readable summary must be reachable');
  assert.match(r.headers.get('content-type') || '', /text\/plain/);
  const txt = await r.text();
  assert.match(txt, /^# BOASIS$/m, 'a title, per the llms.txt convention');
  assert.match(txt, /^> /m, 'and a one-line summary under it');
  assert.match(txt, /Boasis - FZC/, 'who the company is');
  assert.match(txt, /support@boasis\.ae/, 'how to reach it');
  assert.match(txt, /https:\/\/boasis\.ae\//, 'the canonical host');
  for (const p of ['contact.html', 'blog.html', 'privacy.html', 'terms.html']) {
    assert.ok(txt.includes('https://boasis.ae/' + p), p + ' is not linked from llms.txt');
  }
  /* Only the disclaimer may mention reviews or scores. An assistant handed a number like
     "4.8 stars" would repeat it, and this site publishes none. */
  for (const line of txt.split('\n').filter(l => /\b(review|rating|score|stars?)\b/i.test(l))) {
    assert.match(line, /Nothing on this site is a review|BOASIS publishes no review/,
      'a claim about reviews that is not the disclaimer: ' + line);
  }
});

/* ── the head of every page ───────────────────────────────────────────────────────────── */
test('every page carries a title, a description and the canonical address, sized for the results page', async () => {
  for (const [url, file, mode] of PAGES) {
    const html = await text(url);
    const title = attr(html, /<title>([^<]*)<\/title>/);
    assert.ok(title && title.length >= 15 && title.length <= 65, `${url} title is ${title && title.length} chars: ${title}`);
    assert.ok(/BOASIS/.test(title), url + ' title must name the brand');
    assert.equal((html.match(/<title>/g) || []).length, 1, url + ' has more than one title');

    const desc = meta(html, 'description');
    assert.ok(desc, url + ' has no meta description');
    assert.ok(desc.length >= 50 && desc.length <= 160, `${url} description is ${desc.length} chars`);
    assert.equal((html.match(/<meta name="description"/g) || []).length, 1, url + ' has more than one description');

    const canonical = attr(html, /<link rel="canonical" href="([^"]+)">/);
    assert.equal(canonical, SITE + (file === '/index.html' ? '/' : file), url + ' canonical is wrong');
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1, url + ' has more than one canonical');

    const robots = meta(html, 'robots');
    assert.ok(robots && robots.startsWith(mode === 'index' ? 'index' : 'noindex'), `${url} robots says "${robots}"`);
    assert.ok(/follow/.test(robots), url + ' must let the links be followed either way');
    if (mode === 'index') assert.match(robots, /max-image-preview:large/, url + ' should allow the large preview');
  }
});

test('the link preview is complete and absolute, so a shared link looks right on every platform', async () => {
  for (const [url] of PAGES) {
    const html = await text(url);
    assert.equal(prop(html, 'og:type'), 'website', url);
    assert.equal(prop(html, 'og:site_name'), 'BOASIS', url);
    assert.match(prop(html, 'og:locale') || '', /^en(_AE)?$/, url + ' locale');
    assert.equal(prop(html, 'og:url'), meta(html, 'description') ? attr(html, /<link rel="canonical" href="([^"]+)">/) : null,
      url + ' og:url must be the canonical');
    for (const key of ['og:title', 'og:description', 'og:image', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) {
      assert.ok(prop(html, key) || meta(html, key), url + ' is missing ' + key);
    }
    assert.equal(prop(html, 'og:image'), SITE + '/assets/icons/link-preview-1200x630.png', url + ' og:image must be absolute');
    assert.equal(prop(html, 'og:image:width'), '1200', url);
    assert.equal(prop(html, 'og:image:height'), '630', url);
    assert.equal(meta(html, 'twitter:card'), 'summary_large_image', url);
    /* the title a platform shows the link with must be the page's own, not the brand alone */
    assert.equal(prop(html, 'og:title'), attr(html, /<title>([^<]*)<\/title>/), url + ' og:title must equal the title');
  }
});

test('the preview image is really 1200 by 630, and the favicons are the sizes they claim', async () => {
  const png = Buffer.from(await (await get('/assets/icons/link-preview-1200x630.png')).arrayBuffer());
  assert.equal(png.slice(1, 4).toString(), 'PNG', 'the preview must be a PNG');
  assert.equal(png.readUInt32BE(16), 1200, 'preview width');
  assert.equal(png.readUInt32BE(20), 630, 'preview height');
  const icon = Buffer.from(await (await get('/assets/icons/favicon-32.png')).arrayBuffer());
  assert.equal(icon.readUInt32BE(16), 32, 'favicon-32 width');
  assert.equal(icon.readUInt32BE(20), 32, 'favicon-32 height');
});

/* ── the structured data ──────────────────────────────────────────────────────────────── */
test('every page publishes valid JSON-LD, and the same company in every one', async () => {
  for (const [url, file] of PAGES) {
    const html = await text(url);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    assert.equal(blocks.length, 1, url + ' must carry exactly one structured-data block');
    const data = JSON.parse(blocks[0][1]);            // throws if the JSON is malformed
    assert.equal(data['@context'], 'https://schema.org', url);
    const types = data['@graph'].map(n => n['@type']);
    assert.deepEqual(types.slice(0, 2), ['Organization', 'WebSite'], url + ' must open with the company and the site');
    const org = data['@graph'][0];
    assert.equal(org['@id'], SITE + '/#organization', url);
    assert.equal(org.name, 'BOASIS', url);
    assert.equal(org.legalName, 'Boasis - FZC', url);
    assert.equal(org.url, SITE + '/', url);
    assert.equal(org.logo.url, SITE + '/assets/logo/orb-512.png', url + ' logo must be absolute');
    assert.equal(data['@graph'][1].publisher['@id'], org['@id'], url + ' the site is published by the company');
    /* the ids must be stable across pages, or an assistant reads three different companies */
    for (const node of data['@graph']) if (node['@id']) assert.match(node['@id'], new RegExp('^' + SITE.replace(/\./g, '\\.') + '/'));
  }
});

test('the home page says what the product is, and answers the questions it shows', async () => {
  const html = await text('/');
  const [data] = jsonld(html);
  const byType = t => data['@graph'].find(n => n['@type'] === t);

  const soft = byType('SoftwareApplication');
  assert.ok(soft, 'the product itself must be described');
  assert.equal(soft.applicationCategory, 'BusinessApplication');
  assert.ok(soft.featureList.length >= 4, 'what it does, listed');
  assert.ok(!('offers' in soft) && !('aggregateRating' in soft),
    'no price and no rating may be published: nothing on this site states either');

  const faq = byType('FAQPage');
  assert.ok(faq, 'the questions the page answers must be structured too');
  const dl = [...html.matchAll(/<dt>([^<]+)<\/dt><dd>([^<]+)<\/dd>/g)].map(m => [m[1], m[2]]);
  assert.ok(dl.length >= 5, 'expected the questions on the page, saw ' + dl.length);
  assert.equal(faq.mainEntity.length, dl.length, 'one question in the data per question on the page');
  /* each answer must be the page's own words, not a paraphrase written for the crawler */
  dl.forEach(([q, a], i) => {
    assert.equal(faq.mainEntity[i].name, q, 'question ' + (i + 1) + ' must be the visible one');
    assert.equal(faq.mainEntity[i].acceptedAnswer.text, a, 'the answer to "' + q + '" must be the visible one');
  });

  const org = byType('Organization');
  assert.equal(org.email, 'support@boasis.ae', 'the address on the page, not an invented one');
  assert.equal(org.address.addressCountry, 'AE');
  assert.deepEqual(org.address, { '@type': 'PostalAddress', addressCountry: 'AE' },
    'no street address may be invented: the site publishes none');
  assert.ok(!('sameAs' in org), 'no social profile may be claimed while the site still says data-soon');
});

test('the contact page is a contact page, and the blog lists the news it shows', async () => {
  const contact = await text('/contact.html');
  const c = jsonld(contact)[0]['@graph'].find(n => n['@type'] === 'ContactPage');
  assert.ok(c, 'the page must be typed as a contact page');
  assert.equal(c.url, SITE + '/contact.html');
  assert.equal(c.publisher['@id'], SITE + '/#organization');

  const blog = await text('/blog.html');
  const b = jsonld(blog)[0]['@graph'];
  const blogNode = b.find(n => n['@type'] === 'Blog');
  const list = b.find(n => n['@type'] === 'ItemList');
  assert.ok(blogNode && list, 'the blog page must describe itself and its list');
  assert.equal(list.numberOfItems, list.itemListElement.length);
  /* the entries must be the ones js/news.js renders, with their real dates. That file is a
     browser script (it assigns to window), so it is read here, not required. */
  const raw = fs.readFileSync(path.join(ROOT, 'js', 'news.js'), 'utf8');
  const titles = [...raw.matchAll(/title: '([^']+)'/g)].map(m => m[1]);
  assert.equal(list.itemListElement.length, titles.length, 'one entry per news item');
  titles.forEach((t, i) => {
    assert.equal(list.itemListElement[i].item.name, t, 'item ' + (i + 1) + ' must be the one on the page');
    assert.match(list.itemListElement[i].item.datePublished, /^\d{4}-\d{2}-\d{2}$/, 'with its real date');
  });
});

/* ── the two halves must agree ────────────────────────────────────────────────────────── */
test('the sitemap and the robots meta say the same thing about every page', async () => {
  const xml = await text('/sitemap.xml');
  const listed = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  for (const [url, file, mode] of PAGES) {
    const html = await text(url);
    const canonical = attr(html, /<link rel="canonical" href="([^"]+)">/);
    const robots = meta(html, 'robots') || '';
    if (mode === 'index') {
      assert.ok(listed.includes(canonical), canonical + ' is indexable but missing from the sitemap');
    } else {
      assert.ok(!listed.includes(canonical), canonical + ' is noindex but still in the sitemap');
      assert.match(robots, /^noindex/, canonical + ' must say noindex while it is unfinished');
    }
  }
});

/* ── the security posture is unchanged by all of this ────────────────────/* ── the security posture is unchanged by all of this ─────────────────────────────────── */
test('the new public files do not open anything else, and the guard still closes the rest', async () => {
  for (const p of ['/robots.txt', '/sitemap.xml', '/llms.txt']) {
    assert.equal((await get(p)).status, 200, p + ' must be reachable');
  }
  for (const p of ['/package.json', '/server.js', '/.env', '/.git/config', '/lib/protect.js',
                   '/config/env.js', '/docs/SEO.md', '/data/waitlist.json', '/data/contact.json',
                   '/secrets.txt', '/notes.txt', '/backup.xml', '/sitemap.xml.bak', '/indexnow.txt',
                   '/deadbeef.txt', '/css/notes.txt', '/assets/robots.txt']) {
    assert.equal((await get(p)).status, 404, p + ' must stay closed');
  }
  const r = await get('/sitemap.xml');
  assert.match(r.headers.get('content-security-policy') || '', /default-src 'self'/,
    'the security headers still ride on every response');
});

test('nothing in the head breaks the pages: every one still loads, and no inline script sneaks in', async () => {
  for (const [url] of PAGES) {
    const r = await get(url);
    assert.equal(r.status, 200, url);
    const html = await r.text();
    /* The CSP is script-src 'self', so every script tag must be a src, a JSON-LD block, or
       the page's own JSON data block (the home page keeps Mira's lines in one). A bare
       inline script would break in the browser while every other test still passed. */
    for (const m of html.matchAll(/<script([^>]*)>/g)) {
      assert.match(m[1], /src=|type="application\/(?:ld\+)?json"/,
        url + ' carries an inline script that script-src self would block: ' + m[0]);
    }
    /* and the head must stay in the head: a stray </head> would put meta tags in the body,
       where a crawler stops reading them */
    assert.equal((html.match(/<\/head>/g) || []).length, 1, url + ' must have exactly one head');
    assert.ok(html.indexOf('</head>') < html.indexOf('<body'), url + ' must not close the head inside the body');
  }
});
