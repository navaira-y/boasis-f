# BOASIS · SEO, GEO and getting indexed

Everything in this file is already done on the site. It is the record of *what* was done, and
the exact steps left for a person with a Google and a Bing account. Nothing here needs a
developer except the two verification tokens, which only those accounts can issue.

`/docs/` is closed to the browser by `lib/protect.js`, so this file is never served. That is
deliberate: it says things about the site that a visitor has no reason to read.

---

## 1 · What is in place

### Every page

| Page | Indexed | Canonical |
|---|---|---|
| `/` | yes | `https://boasis.ae/` |
| `/contact.html` | yes | `https://boasis.ae/contact.html` |
| `/blog.html` | yes | `https://boasis.ae/blog.html` |
| `/privacy.html` | **noindex, follow** — the page still says it is being prepared | `https://boasis.ae/privacy.html` |
| `/terms.html` | **noindex, follow** — same reason | `https://boasis.ae/terms.html` |

Each page carries: a `title` (15–65 characters), a `meta description` (50–160), one
`canonical`, `robots` with `max-image-preview:large` so a preview can be the full image, the
full Open Graph set (`og:type`, `og:site_name`, `og:locale`, `og:url`, `og:title`,
`og:description`, `og:image` at an absolute URL with its real 1200×630 size and alt text), and
the X/Twitter card set. Absolute URLs matter: a crawler resolves a relative `og:image` against
nothing, and the preview comes out empty.

### Structured data (JSON-LD)

One block per page, in the head, with stable `@id`s (`https://boasis.ae/#organization`,
`#website`, `#software`). It is a data block — never executed — so the site's own CSP
(`script-src 'self'`) does not touch it, and GSC/Bing read it from the raw HTML regardless.

- **Every page**: `Organization` (BOASIS / Boasis - FZC, UAE, support@boasis.ae) + `WebSite`.
- **Home**: `SoftwareApplication` (what the product does, in a `featureList`) + `WebPage` +
  `FAQPage` whose five questions and answers are **the page's own words**, verbatim.
- **Contact**: `ContactPage`.
- **Blog**: `Blog` + `ItemList` of the three news items with their real dates, read from
  `js/news.js`.

What is deliberately absent, because publishing it would be a lie:

- No `aggregateRating` / `review` — the site publishes no scores, and invented ones are a
  Google spam-manual violation.
- No `offers` / prices — the plans page says prices come at launch.
- No `sameAs` social profiles — the footer social links are still `data-soon`.
- No street address — the footer says only "United Arab Emirates".

### The three files a crawler fetches by name

- `robots.txt` — everything public is open, `/api/` is closed, the sitemap is declared, and the
  AI answer engines (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, PerplexityBot,
  Google-Extended, Applebot-Extended) are named. Naming them is the GEO choice: an unnamed bot
  operator reads `User-agent: *` as undecided and throttles. `Google-Extended` is the Gemini
  training switch, **not** a Search switch — allowing it cannot change a ranking, and
  disallowing it only removes BOASIS from the answers.
- `sitemap.xml` — the three indexable pages, absolute URLs, a real `lastmod`. No `changefreq`
  or `priority`: Google ignores both, and stale ones are worse than none.
- `llms.txt` — plain-language facts for assistants, per the emerging convention: what BOASIS
  is, who runs it, what Set up and Manage do, and the links.

`lib/protect.js` had to be told about these, and it was told the narrow way: the four names are
matched exactly (`robots.txt`, `sitemap.xml`, `llms.txt`, `BingSiteAuth.xml`) and an IndexNow
key file must be **hex, 16–64 characters**. `.txt` at the root is still closed in general, so a
note, an export or a dump dropped there stays unreachable.

### How it is kept honest

`test/seo.test.js` (12 tests) runs against the real server and fails if any of this drifts:
title and description lengths, one canonical per page, absolute preview image at a real
1200×630, valid JSON-LD with the company identical on every page, FAQ answers matching the
page's visible text word for word, news entries matching `js/news.js`, and — the one that
matters most — **the sitemap and the robots meta agreeing about every page**.

---

## 2 · Google Search Console

1. Add the property. **Domain property** (`boasis.ae`) is the better one: it covers `www`,
   `http`, `https` and every subdomain in one place, and it verifies by DNS TXT, so no file or
   meta tag is needed and nothing in the repo changes. A URL-prefix property
   (`https://boasis.ae`) is the alternative.
2. Verify. Any one of these:
   - **DNS TXT** (recommended, no code): add the `google-site-verification=...` TXT record at
     the registrar, wait for propagation, press Verify.
   - **Meta tag**: uncomment the line already sitting in every page's head and paste the token:
     ```
     <meta name="google-site-verification" content="PASTE-GOOGLE-TOKEN-HERE">
     ```
     It is commented out in all five pages, next to a note. One edit per page, then deploy.
   - **HTML file**: upload the file Google gives you to the repo root. It works as it is — the
     guard already serves any root `.html` page — but it adds a file to the repo, so DNS or the
     meta tag is tidier.
3. **Sitemaps → add `sitemap.xml`**. Status should go to *Success* within a few hours, with 3
   discovered URLs.
4. **URL inspection → Request indexing** for `/`, `/contact.html` and `/blog.html`. A brand-new
   domain can take days to weeks to be crawled; requesting each URL is what makes it days.
5. Check the **Rich results / structured data** report a week later. Expect the home page to be
   recognised as Organization/SoftwareApplication/FAQ, contact as ContactPage. FAQ rich results
   are limited by Google to health and government sites, so no FAQ snippet should be expected —
   the markup still helps machine reading and AI answers, which is why it is there.
6. `privacy.html` and `terms.html` will show as *Excluded by 'noindex'* in the Pages report.
   That is correct and intentional (see §6).

## 3 · Bing Webmaster Tools

Bing is the same site, a different door, and it feeds ChatGPT's search too.

1. Add `https://boasis.ae` at bing.com/webmasters.
2. Verify — easiest first:
   - **Import from Google Search Console** (one click, once GSC is verified). Nothing to change.
   - **Meta tag**: uncomment `<meta name="msvalidate.01" ...>` (already in every head) and paste
     the token.
   - **XML file**: download `BingSiteAuth.xml` and drop it in the repo root. The guard already
     serves it, so no code change is needed.
   - **DNS TXT**: same idea as Google.
3. **Sitemaps → submit `https://boasis.ae/sitemap.xml`**.
4. **URL submission → submit the three URLs** (Bing allows a daily quota of them).

## 4 · IndexNow (Bing and Yandex, instantly, and free)

Bing discovers new pages by crawling; IndexNow tells it instead. That matters when the blog gets
its first real post.

1. Generate a key at bing.com/indexnow (a GUID). Create a file named exactly
   `<key>.txt` in the repo root whose **contents are the key itself** — e.g.
   `b1a2c3d4e5f60718293a4b5c6d7e8f90.txt` containing `b1a2c3d4e5f60718293a4b5c6d7e8f90`.
   The guard serves it as long as the name is hex and 16–64 characters. Do not add a `.txt` of
   any other kind at the root: the guard will (correctly) refuse it.
2. Deploy it, then ping after any publish:
   ```
   curl "https://api.indexnow.org/indexnow?url=https://boasis.ae/blog.html&key=<key>"
   ```
   (or POST a JSON body with up to 10,000 URLs). No account, no key rotation, nothing to
   maintain.

## 5 · The other tools

- **Rich Results Test** (search.google.com/test/rich-results) — paste any URL to see the
  structured data parsed back as Google sees it.
- **Schema Markup Validator** (validator.schema.org) — stricter, checks the schema.org graph.
- **PageSpeed Insights** — the site is static and light; the fonts and the hero video are the
  only third parties.
- **Bing SEO Analyzer** inside Webmaster Tools — reports the same head basics this file covers.
- **Ahrefs / Semrush site audit** — a paid crawl; nothing in the head here should come back red.

---

## 6 · The two unfinished pages, and how to flip them

`privacy.html` and `terms.html` currently say *"This page is being prepared."* Indexing a page
that says that reads as a half-finished company, so both are `noindex,follow` and both are out
of the sitemap — the two must agree, or Search Console reports the contradiction for months.

When the real text is published, in each of the two files:

1. `<meta name="robots" content="noindex,follow">` → `index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1`
2. add its URL to `sitemap.xml`:
   ```xml
   <url>
     <loc>https://boasis.ae/privacy.html</loc>
     <lastmod>YYYY-MM-DD</lastmod>
   </url>
   ```
3. rewrite the `meta description` to describe the real text, and update the JSON-LD `description`.

`test/seo.test.js` will fail until both sides are changed — that is the point of it.

## 7 · Known issue, outside this pass: soft 404s

`server.js` ends with a catch-all: any path that reaches it is answered with `index.html` and a
**200**. The guard 404s everything that is not on the allow-list, so the paths that get through
are root `.html` names — meaning a typo like `/contct.html` answers **200 with the home page**
instead of 404. Google calls that a soft 404: harmless in small doses, but it can put the home
page in the index under several URLs and wastes crawl budget.

The fix is three lines in the catch-all (404 for a path that looks like a page and has no file,
keep the fallback for everything else). It was left alone here because it changes server
behaviour, and this pass was scoped to the head of the pages. Ask and it is a two-minute change.

## 8 · Rules for the next page

- One page, one canonical, listed in `sitemap.xml` if and only if it says `index`.
- Title 15–65 characters ending in `· BOASIS`; description 50–160, written for a person
  deciding whether to click — not a keyword list.
- Absolute `og:image`; re-use `/assets/icons/link-preview-1200x630.png` until there is a reason
  not to.
- Add the page to the JSON-LD `@graph` on the page itself, with the site's own `@id`s.
- Run `npm test` before pushing: it fails loudly on all of the above.
- If an Arabic version ever ships, that is `hreflang` plus a second canonical set — a job of its
  own, not a patch.
