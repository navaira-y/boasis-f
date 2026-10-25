#!/usr/bin/env node
/* the same functions, without the comments, for pasting into the Supabase dashboard
 *
 * Why a second copy exists: the commented one in demo/supabase/dashboard is what a test recomposes and
 * what the repo reads, and a long file of prose is not what anybody wants to scroll while a stand is
 * being set up. So the generator writes both, and this script is the only difference between them, a
 * pass that takes comments out and puts nothing else in.
 *
 * It is a scanner rather than a regular expression, because the things that make a naive strip wrong
 * are all in these files: `//` inside a URL in a string, a `/` inside a character class, a `/*` that a
 * person wrote inside a message. So the text is walked once with the strings, templates, regular
 * expressions and escapes tracked, and only the parts outside them are looked at for comment starts.
 *
 * And it cannot be quietly wrong, because it returns what it kept: the generator compares the tokens it
 * kept against the tokens in the output, and a test recomposes both copies, so a strip that ate a line
 * of code fails the run rather than failing on the 28th of October.
 */
'use strict';

/* is a `/` here a regular expression or a division? the honest answer is "look at what came before" */
const BEFORE_REGEX = /[(,=:[!&|?{};+\-*%~^<>]$/;
const KEYWORD_BEFORE = /(?:^|[^A-Za-z0-9_$])(?:return|typeof|instanceof|in|of|new|delete|void|case|do|else|yield|await)$/;

function tokens(src) {
  const out = [];
  let i = 0, kept = '';
  const n = src.length;
  const push = (kind, text) => { out.push({ kind, text }); if (kind === 'code') kept += text; };

  while (i < n) {
    const c = src[i], d = src[i + 1];

    if (c === '/' && d === '/') {                       // to the end of the line, and no newline taken
      let j = i + 2;
      while (j < n && src[j] !== '\n') j += 1;
      push('line', src.slice(i, j)); i = j; continue;
    }
    if (c === '/' && d === '*') {                       // to the closing pair, or to the end of all
      let j = i + 2;
      while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j += 1;
      j = Math.min(n, j + 2);
      push('block', src.slice(i, j)); i = j; continue;
    }
    if (c === '"' || c === "'") {                       // one quoted string, escapes and all
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue }
        if (src[j] === c) { j += 1; break }
        if (src[j] === '\n') break;                     // an unterminated string is not ours to fix
        j += 1;
      }
      push('code', src.slice(i, j)); i = j; continue;
    }
    if (c === '`') {                                     // a template, with ${ } counted because it
      let j = i + 1, depth = 0;                          // can hold a URL, a comment marker or anything
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue }
        if (depth === 0 && src[j] === '`') { j += 1; break }
        if (src[j] === '$' && src[j + 1] === '{') { depth += 1; j += 2; continue }
        if (src[j] === '{') { depth += 1; j += 1; continue }
        if (src[j] === '}') { depth = Math.max(0, depth - 1); j += 1; continue }
        j += 1;
      }
      push('code', src.slice(i, j)); i = j; continue;
    }
    if (c === '/' && (BEFORE_REGEX.test(kept) || KEYWORD_BEFORE.test(kept))) {   // a regular expression
      let j = i + 1, cls = false;
      while (j < n) {
        const e = src[j];
        if (e === '\\') { j += 2; continue }
        if (e === '\n') break;                            // no regex crosses a line, so a stray / is code
        if (cls) { if (e === ']') cls = false; j += 1; continue }
        if (e === '[') { cls = true; j += 1; continue }
        if (e === '/') { j += 1; break }
        j += 1;
      }
      while (j < n && /[a-z]/i.test(src[j])) j += 1;      // the flags
      const text = src.slice(i, j);
      push('code', text); i = j; continue;
    }
    push('code', c); i += 1;
  }
  return { out, kept };
}

const squeeze = s => s.replace(/\s+/g, ' ').replace(/\s*([(){}\[\],;:.?])\s*/g, '$1').trim();

function strip(src) {
  const { out } = tokens(src);
  let text = '';
  for (const t of out) {
    if (t.kind === 'code') { text += t.text; continue }
    /* a comment that ran over four lines leaves those four lines behind rather than pulling the rest
       of the file up, which is the difference between a stripped file that is still findable by eye
       and one that is a wall */
    const nl = (t.text.match(/\n/g) || []).length;
    if (nl) text += '\n'.repeat(nl); else text += '';
  }
  const code = out.filter(t => t.kind === 'code').map(t => t.text).join('');
  const lines = text.split('\n').map(l => l.replace(/[ \t]+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n');
  /* the proof, and the only reason this file is allowed to exist: run the scanner over what it
     produced and every string, every regular expression and every line of code has to still be there,
     in the same order. A strip that swallowed a quote or mistook a URL for a comment fails here, and a
     test does the same thing again on every run of the suite */
  if (squeeze(tokens(lines).out.filter(t => t.kind === 'code').map(t => t.text).join('')) !== squeeze(code)) {
    throw new Error('the comment strip would have changed the code, so it stopped');
  }
  return lines.replace(/^\n+/, '').trimEnd() + '\n';
}

module.exports = { strip, tokens };

if (require.main === module) {
  const f = process.argv[2];
  if (!f) { console.error('usage: node scripts/strip-comments.js file.js'); process.exit(2) }
  process.stdout.write(strip(require('fs').readFileSync(f, 'utf8')));
}
