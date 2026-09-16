const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inspect } = require('../lib/protect');

const ok = p => inspect(p).ok;

/* ── the leak we closed: every one of these returned 200 before this change ── */
test('the exposed files are now refused', () => {
  for (const p of [
    '/data/waitlist.json', '/data/contact.json', '/data/visitors.json',
    '/.git/config', '/.git/HEAD', '/.git/packed-refs', '/.gitignore',
    '/server.js', '/package.json', '/package-lock.json', '/.env', '/.env.example',
    '/lib/mailer.js', '/lib/protect.js', '/config/env.js', '/scripts/mail-check.js',
    '/docs/EMAIL.md', '/README.md', '/js/../server.js',
  ]) assert.equal(ok(p), false, `must refuse ${p}`);
});

test('the site still works: every file the page actually loads is allowed', () => {
  for (const p of [
    '/', '/index.html',
    '/css/tokens.css', '/css/site.css',
    '/js/site.js', '/js/news.js', '/js/yara-orb.js',
    '/assets/icons/favicon.ico', '/assets/icons/favicon-32.png', '/assets/icons/apple-touch-icon.png',
    '/assets/icons/link-preview-1200x630.png',
    '/assets/logo/orb-160.png', '/assets/logo/orb-512.png',
    '/assets/img/setup-poster.jpg', '/assets/img/manage-poster.jpg',
    '/assets/orb/orb.mp4',
    '/assets/video/welcome.mp4', '/assets/video/setup-film.mp4', '/assets/video/manage-film.mp4',
  ]) assert.equal(ok(p), true, `must allow ${p}`);
});

test('client scripts are served, server scripts are not', () => {
  assert.equal(ok('/js/site.js'), true, 'the browser needs its own JS');
  assert.equal(ok('/lib/mailer.js'), false, 'server-side JS stays private');
  assert.equal(ok('/api/waitlist'), true);
  assert.equal(ok('/api/contact'), true);
  assert.equal(ok('/api/demo'), true, 'the demo dialog posts here');
  assert.equal(ok('/api/manage'), true, 'the early access dialog posts here');
});

/* ── the ways people try to get around a path check ─────────────────────────── */
test('encoded traversal does not slip past the prefix tests', () => {
  for (const p of [
    '/css/..%2f..%2f.git%2fconfig', '/js/../../server.js', '/js/..%2Fserver.js',
    '/assets/%2e%2e/%2e%2e/etc/passwd', '/..%2f..%2fpackage.json',
    '/js/%2e%2e/server.js', '/assets/....//....//server.js',
    '/css//..//..//.git/config', '/%2e%2e%2f%2e%2e%2f.git%2fconfig',
  ]) assert.equal(ok(p), false, `must refuse ${p}`);
});

test('null bytes, broken escapes and non-strings are refused, not thrown on', () => {
  assert.equal(inspect('/css/site.css\0.png').ok, false, 'nul byte');
  assert.equal(inspect('/%c0%ae%c0%ae/server.js').ok, false, 'invalid utf-8');
  assert.equal(inspect('/assets/x.png\n.css').ok, false, 'a newline in a path');
  assert.equal(inspect('%').ok, false);
  assert.equal(inspect('///').ok, true, '/// is just / and Express serves it as the homepage');
  assert.equal(inspect('///index.html').ok, true);
  assert.equal(inspect('//assets//icons//favicon.ico').ok, true, 'repeated slashes normalise');
  assert.equal(inspect('css/site.css').ok, false, 'no leading slash is not a path we serve');
  assert.equal(inspect('').ok, false, 'the empty string must not become /');
  assert.equal(inspect(undefined).ok, false);
  assert.equal(inspect(null).ok, false);
  assert.equal(inspect(0).ok, false);
  assert.equal(inspect({}).ok, false);
  assert.equal(inspect(['/server.js']).ok, false, 'an array coerces to a string, still refused');
});

test('query strings and fragments do not confuse it', () => {
  assert.equal(ok('/js/site.js?v=3'), true);
  assert.equal(ok('/data/waitlist.json?x=1'), false);
  assert.equal(ok('/server.js#top'), false);
});

test('double extensions are judged by the last one', () => {
  assert.equal(ok('/assets/img/x.png'), true);
  // /assets/ only serves media, so a stray page or script dropped there stays unreachable
  assert.equal(ok('/assets/x.html'), false, 'no html from /assets');
  assert.equal(ok('/assets/shell.php'), false);
  assert.equal(ok('/assets/evil.svg.js'), false);
  assert.equal(ok('/assets/x.txt'), false, 'a text file is not an asset');
  assert.equal(ok('/assets/backup.zip'), false);
  assert.equal(ok('/css/site.css'), true);
  assert.equal(ok('/css/notes.txt'), false);
});

test('dotfiles are hidden, except what must answer', () => {
  assert.equal(ok('/.env'), false);
  assert.equal(ok('/assets/.hidden'), false);
  assert.equal(ok('/.well-known/acme-challenge/token123'), true, 'HTTPS issuance must not break');
});

test('a future page at the root is allowed, a future file is not', () => {
  assert.equal(ok('/about.html'), true);
  assert.equal(ok('/privacy-policy.html'), true);
  assert.equal(ok('/data.html'), true, 'still only an html name at the root');
  assert.equal(ok('/server.html'), true, 'a page by that name is a page');
});

/* 16 September · a bare root name is a page request (/blog, /privacy, /contact). serve-static
   is what decides whether the page exists, and the not-found page answers when it does not,
   so this rule opens no file: only letters, digits, dash and underscore are accepted, and a
   path carrying a dot, a slash or an extension is judged by the rules around it. */
test('a bare page name is a page, and nothing else gets in with it', () => {
  for (const p of ['/blog', '/privacy', '/terms', '/contact', '/about', '/a-b_c9']) {
    assert.equal(ok(p), true, p + ' is a page request');
  }
  /* A bare name is only ever a *request*. `/data` is allowed as a page and then finds no
     data.html, so over the wire it is a 404 — the folder stays closed, which is what the
     `/data/` rule is for, and test/seo.test.js checks the real answer. */
  /* a trailing slash is normalised away before any rule runs, so `/data/` is `/data`: a page
     request that finds no data.html. The folder is closed by the `/data/` *prefix* rule,
     which is what refuses every file inside it. */
  assert.equal(ok('/data'), true, 'a bare name is a page request, not the folder');
  assert.equal(ok('/data/'), true, 'and the trailing slash is normalised away');
  assert.equal(ok('/data/index.html'), false, 'a file inside the folder is what stays closed');
  /* `/api` and `/api/` normalise to the same bare name, and the fallback answers both in
     JSON — an API path must never answer with a page (test/seo.test.js checks it live) */
  assert.equal(ok('/api'), true, 'a bare name, answered by the fallback, not by static');
  for (const p of ['/api/health', '/api/first-visit', '/api/waitlist', '/api/contact', '/api/demo', '/api/manage']) {
    assert.equal(ok(p), true, p + ' is a real route, and the API is reached over the guard');
  }
  for (const p of ['/server.js', '/.env', '/config/env', '/lib/mailer', '/package.json',
                   '/js/site', '/css/site', '/assets/logo/orb-160', '/blog.html/x',
                   '/blog\\u0000', '/api/unknown', '/api/health/extra', '/api/manage/x',
                   '/nope.php', '/data/waitlist.json']) {
    assert.equal(ok(p), false, p + ' must stay closed');
  }
});

/* 16 September · SEO. Four files became public on purpose, and each of them is matched by
   name rather than by extension, so nothing else at the root was opened with them. */
test('the files a search engine asks for by name are served, and only those', () => {
  for (const p of ['/robots.txt', '/sitemap.xml', '/llms.txt', '/BingSiteAuth.xml']) {
    assert.equal(ok(p), true, p + ' must be readable or a crawler cannot do its job');
  }
  /* IndexNow: Bing's instant-indexing key file. Hex, long, one level — and never .txt alone. */
  assert.equal(ok('/b1a2c3d4e5f60718293a4b5c6d7e8f90.txt'), true, 'an IndexNow key file');
  for (const p of ['/deadbeef.txt', '/indexnow.txt', '/secrets.txt', '/notes.txt', '/passwords.txt',
                   '/backup.xml', '/sitemap.xml.bak', '/robots.txt.gz', '/llms.txt/../.env',
                   '/assets/robots.txt', '/css/robots.txt', '/data/robots.txt']) {
    assert.equal(ok(p), false, p + ' must stay closed');
  }
});

test('it never throws, whatever it is handed', () => {
  for (const junk of ['', ' ', '/', 0, {}, [], 'x'.repeat(5000), '/*', '\\\\', '\r\n/']) {
    assert.doesNotThrow(() => inspect(junk));
  }
});
