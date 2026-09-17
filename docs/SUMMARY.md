# What things did in email

3 forms, each one sends 2 emails. One to your team, one to the visitor.

## Book a demo (home page)

* Your team gets: name, email, phone, company, who they are, and the time.
* Pressing reply writes straight to the visitor.
* The visitor gets: "We have your demo request" and a thank you.

## Join early access (home page)

* Your team gets: name, email, phone, company yes or no, then their plans or how many companies plus the authority.
* The visitor gets: "You are on the early access list" and a thank you.

## Contact form

* Your team gets: name, email, phone, company, the time, and the full message.
* The visitor gets: "We have your message" and a thank you.

## What every email does the same way

* The record is saved on disk first, mailed second. So a mail problem never loses a lead.
* The visitor still sees success even when mail fails.
* The same email is never sent twice (6 hour memory).
* The mail is written in the site's own design, plus a plain text copy of the same words.
* Every field is escaped, so nobody can send code or fake headers through your forms.
* Dates are always Dubai time and say so.
* Bot filled forms get no email at all.
* You can preview any email with: npm run mail:check

## Email gaps, honestly

* No unsubscribe link. Every mail just says write to support@boasis.ae.
* If sending fails there is no retry and no bounce handling.
* One endpoint, /api/waitlist, is dead. No page uses it, but it is still open and still live.

# What things did in SEO

* Every page has its own title and description, checked for the right length.
* Every page says its one true address, so Google never sees two copies of one page.
* Privacy and Terms are marked do not index, because their real text is not written yet.
* Every page has link preview tags, so a shared link looks correct in WhatsApp, X and Facebook.
* The preview image is a real 1200 by 630 one.
* Every page carries structured data, so Google understands the company, the software and the common questions.
* Nothing is invented: no ratings, no prices, no street address, no social profiles.
* sitemap.xml lists the 3 real pages only.
* robots.txt allows the site and closes the API folder.
* A wrong address now gives a real 404 page, not the home page. That was the soft 404 problem, and it is fixed.
* A missing file gives 404 too, never the home page.
* The Google verification code is live in all 5 pages, and the same code is already in your DNS.
* docs/SEO.md holds the full steps for Search Console and Bing.

# What things did in GEO (getting cited by AI)

* llms.txt is written in plain words: what BOASIS is, who runs it, what Set up and Manage do.
* robots.txt lets the answer engines in by name: Googlebot, Bingbot, OAI SearchBot, ChatGPT User, Claude SearchBot, Claude User, PerplexityBot and Perplexity User.
* robots.txt refuses the training robots by name: GPTBot, ClaudeBot, Cohere, Common Crawl, Apple training, Meta, ByteDance, Amazon and Petal.
* The same policy is written in words, not only as rules.
* The FAQ answers on the page are used word for word, so an assistant can quote them as they are.
* One thing to know: refusing Google training also takes you out of Gemini answers. Google Search and AI Overviews are not affected.

# Still to do

* Push the branch so the live site gets all of this.
* Write Privacy and Terms, then flip them back on.
* Decide on the dead waitlist endpoint.
