# BOASIS · SEO, GEO and getting indexed

Everything in this file is already done on the site. It is the record of *what* was done, and
the exact steps left for a person with a Google and a Bing account.

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
`og:description`, `og:image` at an absolute URL with its real 1200×630 size and alt text), the
X/Twitter card set, and the Search Console proof (`google-site-verification`).

Absolute URLs matter: a crawler resolves a relative `og:image` against nothing, and the preview
comes out empty.

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

- `robots.txt` — see §2: citable, not trainable.
- `sitemap.xml` — the three indexable pages, absolute URLs, a real `lastmod`. No `changefreq`
  or `priority`: Google ignores both, and stale ones are worse than none.
- `llms.txt` — plain-language facts for assistants, per the emerging convention: what BOASIS
  is, who runs it, what Set up and Manage do, the links, and the usage line (citation welcome,
  training not licensed).

`lib/protect.js` had to be told about these, and it was told the narrow way: the four names are
matched exactly (`robots.txt`, `sitemap.xml`, `llms.txt`, `BingSiteAuth.xml`) and an IndexNow
key file must be **hex, 16–64 characters**. `.txt` at the root is still closed in general, so a
note, an export or a dump dropped there stays unreachable.

### Missing pages are 404s (the soft-404 fix)

`server.js` used to end with `app.get('*', …index.html)`: every unknown address answered with
the home page and a **200**. A typo like `/contct.html` therefore looked, to a browser and to
Google, exactly like the home page — a soft 404, which can put the home page into the index
under several addresses and spends crawl budget on pages that do not exist.

Now:

- an address that does not exist answers **404** with `404.html`, a real page of the site
  (`noindex,follow`, the same header and footer as everywhere else);
- an API path that is not a route answers `{ ok: false, errors: ["not-found"] }` as JSON — the
  API never answers with a page;
- a page asked for by its bare name resolves (`/blog` serves `blog.html`, exactly as `/contact`
  has always served `contact.html`), and the page's own canonical says which address should be
  indexed, so the two never compete;
- everything else is still refused by `lib/protect.js` before a file is read.

## 2 · The AI policy: citable, not trainable

The owner's line, and it is implemented in `robots.txt` by name rather than by wildcard:

| Allowed (they cite what they read) | Refused (they collect training data) |
|---|---|
| `Googlebot`, `Bingbot` | `GPTBot` (OpenAI training) |
| `OAI-SearchBot`, `ChatGPT-User` | `ClaudeBot`, `anthropic-ai` (Anthropic training) |
| `Claude-SearchBot`, `Claude-User` | `Google-Extended`, `Applebot-Extended` |
| `PerplexityBot`, `Perplexity-User` | `CCBot`, `Bytespider`, `Amazonbot`, `PetalBot`, `Meta-ExternalAgent`, `FacebookBot` |

Two things worth knowing:

- **Google does not split training from grounding.** `Google-Extended` covers both "train
  Gemini" and "let Gemini answer with your page", so refusing training also removes the site
  from Gemini's answers. Google **Search** — including AI Overviews — is a different crawler
  (`Googlebot`, allowed) and is unaffected. To trade back the other way, delete the
  `User-agent: Google-Extended` / `Disallow: /` pair; the cost is that Gemini may then train on
  the site.
- **A robots.txt is a request, not a lock.** Every operator named here honours it; one that
  lies about its name can still crawl. The legal layer is the terms and the copyright notice,
  and the usage line in `llms.txt` says the same thing in words to an assistant that reads it.

## 3 · Getting the site into Google and Bing

### The DNS records, as they stand today (checked 16 September 2026)

| What | Type | Value | Where |
|---|---|---|---|
| Apex | `A` | `147.79.120.68`, `92.112.198.147` | Hostinger |
| Apex | `AAAA` | the two `2a02:4780:…` addresses | Hostinger |
| Apex | `TXT` | `google-site-verification=vdS7qgiTi2dTNArJdBm8tzGG1LHP2k_5977IL0VHTvU` | added |
| Apex | `TXT` | `v=spf1 include:_spf.google.com ~all` | Google Workspace mail |
| Apex | `TXT` | `6aaa05a440d9590b90b9962a2f70ff4a` | see below — origin not confirmed |
| www | `CNAME` | `www.boasis.ae.cdn.hstgr.net` | Hostinger's CDN — correct, not wrong |
| www | `A` / `AAAA` | published by that CDN | — |

The `www` record is **not** the problem it looks like: a `CNAME` to
`…cdn.hstgr.net` is Hostinger's own CDN target and is the normal Hostinger setup. What makes
`www` behave is the redirect, not the DNS record — DNS cannot redirect. The site's own
`server.js` answers any request whose Host is `www.boasis.ae` with a **301 to
`https://boasis.ae` + the same path and query**, which is verified live
(`www.boasis.ae/blog.html?x=1` → `boasis.ae/blog.html?x=1`). The apex is therefore the only
address that serves content, which is what the canonicals assume.

The third TXT, `6aaa05a440d9590b90b9962a2f70ff4a`, is a 32-character hex value: that shape is
either Bing's verification value or an IndexNow key. Nobody has confirmed which, so treat it as
unknown and do not delete it. If it is an IndexNow key, the file `/<key>.txt` containing exactly
that string must exist at the root or the ping below will be refused (see §5).

### Google Search Console

1. Add the property as a **Domain property** (`boasis.ae`): it covers `www`, `http`, `https`
   and every subdomain in one place.
2. Verify — **the DNS TXT record is already published**, so press Verify; nothing needs to be
   created. (That is the exact value in the table above and the recommended method: no file,
   no code, no deploy. The same proof is also carried as
   `<meta name="google-site-verification" content="vdS7qgiTi2dTNArJdBm8tzGG1LHP2k_5977IL0VHTvU">`
   in every page's head, so tidying the DNS later cannot un-verify the property.)

   **The Verify button is in Search Console, never in the DNS panel.** The DNS zone editor is
   only the drawer the token lives in: it has no verify step and needs none. The click path is
   Add property → **Domain** → type `boasis.ae` → it shows the TXT value (already published, so
   do not touch the side) → **Verify**. A property that is already created but unverified is
   verified from inside it: **Settings → Ownership verification → the `boasis.ae` row → Verify**.
   If it reports "verification failed" on the first try it is DNS caching, not a wrong record —
   wait 30–60 minutes and press it again. And the record type is **TXT**, not DS: DS is a
   DNSSEC record, a different thing entirely, and this zone has none (normal).
3. **Sitemaps → add `sitemap.xml`**. Expect 3 discovered URLs.
4. **URL inspection → Request indexing** for `/`, `/contact.html`, `/blog.html`. On a new
   domain this is what turns weeks into days.
5. Check the structured-data report a week later: expect Organization, SoftwareApplication and
   FAQ on the home page, ContactPage on contact. FAQ rich results are Google-restricted to
   health and government sites, so no FAQ snippet should be expected — the markup is there for
   machine reading and AI answers.
6. `privacy.html` and `terms.html` will report as *Excluded by 'noindex'*. Correct, and §7 says
   how to flip them.

### Bing Webmaster Tools

1. Add `https://boasis.ae` at bing.com/webmasters.
2. Verify — easiest first (the button is in Bing Webmaster Tools, as with Google; DNS only
   holds the record):
   - **Import from Google Search Console** once GSC is verified: one click, nothing to change.
   - **TXT**: value `6aaa05a440d9590b90b9962a2f70ff4a`, if that is where it came from — already
     published.
   - **Meta tag**: uncomment the `msvalidate.01` line (it is in every head, commented, next to
     the note) and paste Bing's value.
   - **XML file**: download `BingSiteAuth.xml` and drop it in the repo root; the guard already
     serves that exact name, so no code change is needed.
3. **Sitemaps → submit `https://boasis.ae/sitemap.xml`**.
4. **URL submission → submit the three URLs** (there is a daily quota).

## 4 · IndexNow (Bing and Yandex, instantly, and free)

Bing discovers new pages by crawling; IndexNow tells it instead. That matters when the blog gets
its first real post.

1. Generate a key at bing.com/indexnow (a GUID). Create a file named exactly `<key>.txt` in the
   repo root whose **contents are the key itself** — e.g.
   `b1a2c3d4e5f60718293a4b5c6d7e8f90.txt` containing `b1a2c3d4e5f60718293a4b5c6d7e8f90`.
   The guard serves it as long as the name is hex and 16–64 characters. Do not add any other
   `.txt` at the root: the guard will (correctly) refuse it.
2. Deploy it, then ping after any publish:
   ```
   curl "https://api.indexnow.org/indexnow?url=https://boasis.ae/blog.html&key=<key>"
   ```
   (or POST a JSON body with up to 10,000 URLs). No account, no rotation, nothing to maintain.

## 5 · The other tools

- **Rich Results Test** (search.google.com/test/rich-results) — paste a URL to see the
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

`test/seo.test.js` fails until both sides are changed — that is the point of it.

## 7 · Known limits

- **www is a redirect, not a second site.** Nothing serves there; it 301s to the apex. That is
  the intended shape, and it is why no canonical points at a `www` address.
- **`/contact` and `/blog` answer 200 as well as their `.html` addresses.** Each page's
  canonical names the `.html` address, which is what consolidates them. If the owner ever wants
  a permanent redirect for the bare names instead, that is a three-line change in `server.js`;
  it was left alone because `/contact` has answered 200 since the page shipped.
- **No `BingSiteAuth.xml`, no `msvalidate.01` meta, no IndexNow key file yet** — each needs a
  value only the owner's Bing account can issue. All three routes are prepared (§3, §4).

## 8 · Rules for the next page

- One page, one canonical, listed in `sitemap.xml` if and only if it says `index`.
- Title 15–65 characters ending in `· BOASIS`; description 50–160, written for a person
  deciding whether to click — not a keyword list.
- Absolute `og:image`; re-use `/assets/icons/link-preview-1200x630.png` until there is a reason
  not to. It is the logo on the brand navy (#163652), and its dimensions are pinned by
  `test/seo.test.js`.
- Add the page to the JSON-LD `@graph` on the page itself, with the site's own `@id`s.
- Add the page to `test/seo.test.js`'s `PAGES` list, so its head is checked like the rest.
- Run `npm test` before pushing: it fails loudly on all of the above, including a page that
  answers 200 where it should answer 404.
- If an Arabic version ever ships, that is `hreflang` plus a second canonical set — a job of its
  own, not a patch.
