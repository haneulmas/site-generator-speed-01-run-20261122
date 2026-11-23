// Fast drop-in for makefun-site 1.0.0 (site-generator-speed-01-run-20261122).
// Same answers as the house baseline, byte for byte, on every case; written
// from the baseline's README and code, then optimised where the baseline
// wastes work: inline Markdown no longer escapes one character at a time,
// slugs are cached with an ASCII fast path, front matter and the Markdown
// lexer use character tests instead of a regex per line, template rendering
// appends to an array instead of concatenating strings, and each page's
// card is built once instead of once per layout that reads it.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const ESC_RE = /[&<>"']/g;
const ESC_TEST = /[&<>"']/;
export function escapeHtml(text) {
  return ESC_TEST.test(text) ? text.replace(ESC_RE, (c) => ESCAPES[c]) : text;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function longDate(date) {
  return `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
}

/** Per-case slug cache, reset at the start of run(). */
let slugCache = new Map();

export function slugify(text) {
  const hit = slugCache.get(text);
  if (hit !== undefined) return hit;
  let out = '';
  let ascii = true;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) > 127) { ascii = false; break; }
  if (ascii) {
    let gap = false;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      let keep = 0;
      if (c >= 65 && c <= 90) keep = c + 32;
      else if ((c >= 97 && c <= 122) || (c >= 48 && c <= 57)) keep = c;
      if (keep === 0) { gap = out.length > 0; continue; }
      if (gap) out += '-';
      gap = false;
      out += String.fromCharCode(keep);
    }
  } else {
    const plain = text.normalize('NFKD').replace(/\p{M}/gu, '');
    let gap = false;
    for (const ch of plain) {
      let keep = null;
      if (ch >= 'A' && ch <= 'Z') keep = ch.toLowerCase();
      else if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')) keep = ch;
      if (keep === null) { gap = out.length > 0; continue; }
      if (gap) out += '-';
      gap = false;
      out += keep;
    }
  }
  let end = 64;
  if (out.length > 64) {
    end = 64;
    while (end > 0 && out[end - 1] === '-') end--;
    out = out.slice(0, end);
  } else if (out.length === 64) {
    while (end > 0 && out[end - 1] === '-') end--;
    out = out.slice(0, end);
  }
  if (out === '') out = 'untitled';
  slugCache.set(text, out);
  return out;
}

export function uniqueSlug(slug, taken) {
  let out = slug;
  for (let n = 2; taken.has(out); n++) out = `${slug}-${n}`;
  taken.add(out);
  return out;
}

const byCodeUnits = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Whether a code unit is JS whitespace (\s). */
function isWSCode(c) {
  return (c >= 9 && c <= 13) || c === 32 || c === 160 || c === 5760 || (c >= 8192 && c <= 8202) || c === 8239 || c === 8287 || c === 12288 || c === 65279;
}

/** The words of a body: its runs of characters other than whitespace. */
function wordsOf(text) {
  let n = 0;
  let inWord = false;
  for (let i = 0; i < text.length; i++) {
    if (isWSCode(text.charCodeAt(i))) inWord = false;
    else if (!inWord) { inWord = true; n++; }
  }
  return n;
}

// Front matter

const KEYS = ['title', 'date', 'tags', 'draft', 'layout', 'slug', 'summary'];

function daysIn(y, m) {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}

function stringOf(raw) {
  if (raw.charCodeAt(0) === 34) {
    if (raw.length < 2 || raw.charCodeAt(raw.length - 1) !== 34) return { error: 'a quoted string is not closed' };
    let out = '';
    for (let i = 1; i < raw.length - 1; i++) {
      const c = raw[i];
      if (c === '\\') {
        if (i + 1 >= raw.length - 1) return { error: 'a quoted string holds an escape other than \\" or \\\\' };
        const n = raw[i + 1];
        if (n !== '"' && n !== '\\') return { error: 'a quoted string holds an escape other than \\" or \\\\' };
        out += n;
        i++;
      } else if (c === '"') return { error: 'a quoted string holds a stray quote' };
      else out += c;
    }
    return { value: out };
  }
  if (raw.charCodeAt(0) === 91) return { error: 'a bare string opens on [' };
  return { value: raw };
}

function valueOf(key, raw) {
  switch (key) {
    case 'title':
    case 'summary': {
      const s = stringOf(raw);
      return 'error' in s ? { error: `key "${key}": ${s.error}` } : s;
    }
    case 'date': {
      if (raw.length !== 10 || raw.charCodeAt(4) !== 45 || raw.charCodeAt(7) !== 45) return { error: 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)' };
      for (let i = 0; i < 10; i++) {
        if (i === 4 || i === 7) continue;
        const c = raw.charCodeAt(i);
        if (c < 48 || c > 57) return { error: 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)' };
      }
      const y = Number(raw.slice(0, 4));
      const mo = Number(raw.slice(5, 7));
      const d = Number(raw.slice(8, 10));
      if (y < 1970 || y > 2099 || mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return { error: 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)' };
      return { value: raw };
    }
    case 'tags': {
      if (raw.charCodeAt(0) !== 91 || raw.charCodeAt(raw.length - 1) !== 93) return { error: 'key "tags": not a list [a, b]' };
      const inner = raw.slice(1, -1);
      if (inner.trim() === '') return { value: [] };
      const tags = inner.split(',').map((t) => t.trim());
      for (const t of tags) {
        if (t === '' || t.indexOf('"') !== -1 || t.indexOf('[') !== -1 || t.indexOf(']') !== -1) return { error: 'key "tags": an empty tag, or one holding " [ or ]' };
      }
      return { value: tags };
    }
    case 'draft':
      return raw === 'true' ? { value: true } : raw === 'false' ? { value: false } : { error: 'key "draft": true or false' };
    case 'layout': {
      if (raw.length === 0) return { error: 'key "layout": not a template name' };
      for (let i = 0; i < raw.length; i++) {
        const c = raw.charCodeAt(i);
        if (!((c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 45)) return { error: 'key "layout": not a template name' };
      }
      return { value: raw };
    }
    case 'slug': {
      if (raw.length === 0 || raw.length > 64) return { error: 'key "slug": not a slug' };
      let prevDash = true;
      for (let i = 0; i < raw.length; i++) {
        const c = raw.charCodeAt(i);
        if (c === 45) {
          if (prevDash) return { error: 'key "slug": not a slug' };
          prevDash = true;
        } else if ((c >= 97 && c <= 122) || (c >= 48 && c <= 57)) prevDash = false;
        else return { error: 'key "slug": not a slug' };
      }
      if (prevDash) return { error: 'key "slug": not a slug' };
      return { value: raw };
    }
    default:
      return { error: `unknown key "${key}"` };
  }
}

function rtrimSpacesTabs(s) {
  let e = s.length;
  while (e > 0 && (s.charCodeAt(e - 1) === 32 || s.charCodeAt(e - 1) === 9)) e--;
  return s.slice(0, e);
}

function isBlankLine(line) {
  for (let i = 0; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}

export function parseFrontMatter(text) {
  // Split only the front-matter lines; slice the body instead of
  // splitting and re-joining it.
  if (!text.startsWith('---\n')) {
    return text === '---' ? { error: 'the front matter is not closed' } : { error: 'no front matter' };
  }
  let closeStart = -1;
  let from = 3;
  for (;;) {
    const p = text.indexOf('\n---', from);
    if (p === -1) break;
    const after = p + 4;
    if (after === text.length || text.charCodeAt(after) === 10) { closeStart = p + 1; break; }
    from = p + 1;
  }
  if (closeStart === -1) return { error: 'the front matter is not closed' };
  const fmText = closeStart === 4 ? '' : text.slice(4, closeStart - 1);
  const lines = fmText === '' ? [] : fmText.split('\n');
  const data = {};
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const i = li + 1;
    if (isBlankLine(line) || line.charCodeAt(0) === 35) continue;
    let k = 0;
    while (k < line.length) {
      const c = line.charCodeAt(k);
      if ((c >= 97 && c <= 122) || c === 95) k++;
      else break;
    }
    if (k === 0 || k >= line.length || line.charCodeAt(k) !== 58) return { error: `line ${i + 1} is not "key: value"` };
    const key = line.slice(0, k);
    let raw;
    if (k + 1 === line.length) raw = '';
    else if (line.charCodeAt(k + 1) === 32) raw = rtrimSpacesTabs(line.slice(k + 2));
    else return { error: `line ${i + 1} is not "key: value"` };
    if (!KEYS.includes(key)) return { error: `unknown key "${key}"` };
    if (Object.hasOwn(data, key)) return { error: `key "${key}" is given twice` };
    if (raw === '') return { error: `key "${key}" has no value` };
    const v = valueOf(key, raw);
    if ('error' in v) return v;
    data[key] = v.value;
  }
  if (!Object.hasOwn(data, 'title')) return { error: 'no title' };
  let bodyStart = closeStart + 3;
  if (text.charCodeAt(bodyStart) === 10) bodyStart++;
  return { data, body: text.slice(bodyStart) };
}

// Markdown

const ESCAPABLE = new Set(['\\', '`', '*', '_', '[', ']', '(', ')', '#', '+', '-', '.', '!', '>']);

function findUnescaped(s, what, from) {
  for (let j = from; j <= s.length - what.length; j++) {
    if (s[j] === '\\' && j + 1 < s.length && ESCAPABLE.has(s[j + 1])) { j++; continue; }
    if (s.startsWith(what, j)) return j;
  }
  return -1;
}

function findSingleStar(s, from) {
  for (let j = from; j < s.length; j++) {
    const c = s[j];
    if (c === '\\' && j + 1 < s.length && ESCAPABLE.has(s[j + 1])) { j++; continue; }
    if (c !== '*') continue;
    if (s[j + 1] === '*') { j++; continue; }
    return j;
  }
  return -1;
}

const INLINE_PLAIN = /^[^\]\\*\[`&<>"']*$/;
export function inline(s, env) {
  // Fast path: no Markdown marker and nothing to escape.
  if (INLINE_PLAIN.test(s)) return s;
  const out = [];
  let i = 0;
  let start = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === '\\' && i + 1 < n && ESCAPABLE.has(s[i + 1])) {
      if (i > start) out.push(escapeHtml(s.slice(start, i)));
      out.push(escapeHtml(s[i + 1]));
      i += 2;
      start = i;
      continue;
    }
    if (c === '`') {
      const j = s.indexOf('`', i + 1);
      if (j > i + 1) {
        if (i > start) out.push(escapeHtml(s.slice(start, i)));
        out.push('<code>', escapeHtml(s.slice(i + 1, j)), '</code>');
        i = j + 1;
        start = i;
      } else i++;
      continue;
    }
    if (c === '*') {
      if (s[i + 1] === '*') {
        const j = findUnescaped(s, '**', i + 2);
        if (j > i + 2) {
          if (i > start) out.push(escapeHtml(s.slice(start, i)));
          out.push('<strong>', inline(s.slice(i + 2, j), env), '</strong>');
          i = j + 2;
          start = i;
        } else i += 2;
        continue;
      }
      const j = findSingleStar(s, i + 1);
      if (j > i + 1) {
        if (i > start) out.push(escapeHtml(s.slice(start, i)));
        out.push('<em>', inline(s.slice(i + 1, j), env), '</em>');
        i = j + 1;
        start = i;
      } else i++;
      continue;
    }
    if (c === '[') {
      const k = findUnescaped(s, ']', i + 1);
      const m = k !== -1 && s[k + 1] === '(' ? s.indexOf(')', k + 2) : -1;
      const target = m === -1 ? '' : s.slice(k + 2, m);
      if (target !== '' && !/\s/.test(target)) {
        if (i > start) out.push(escapeHtml(s.slice(start, i)));
        out.push('<a href="', escapeHtml(env.link(target)), '">', inline(s.slice(i + 1, k), env), '</a>');
        i = m + 1;
        start = i;
        continue;
      }
      i++;
      continue;
    }
    i++;
  }
  if (n > start) out.push(escapeHtml(s.slice(start, n)));
  return out.join('');
}

function trimLine(line) {
  let a = 0;
  let b = line.length;
  while (a < b && (line.charCodeAt(a) === 32 || line.charCodeAt(a) === 9)) a++;
  while (b > a && (line.charCodeAt(b - 1) === 32 || line.charCodeAt(b - 1) === 9)) b--;
  return line.slice(a, b);
}

function fenceOpen(line) {
  if (line.charCodeAt(0) !== 96 || line.charCodeAt(1) !== 96 || line.charCodeAt(2) !== 96) return null;
  for (let i = 3; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95 || c === 43 || c === 45) continue;
    if (c === 32 || c === 9) {
      for (let j = i + 1; j < line.length; j++) {
        const d = line.charCodeAt(j);
        if (d !== 32 && d !== 9) return null;
      }
      return line.slice(3, i);
    }
    return null;
  }
  return line.slice(3);
}

function isFenceClose(line) {
  if (line.charCodeAt(0) !== 96 || line.charCodeAt(1) !== 96 || line.charCodeAt(2) !== 96) return false;
  for (let i = 3; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}

function headingOf(line) {
  let k = 0;
  while (k < line.length && line.charCodeAt(k) === 35) k++;
  if (k === 0 || k > 6) return null;
  const c = line.charCodeAt(k);
  if (c !== 32 && c !== 9) return null;
  const text = trimLine(line.slice(k));
  if (text === '') return null;
  return { depth: k, text };
}

function isHR(line) {
  if (!line.startsWith('---') && !line.startsWith('***')) return false;
  for (let i = 3; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}

function endsParagraph(line) {
  if (line.length === 0) return true;
  const c = line.charCodeAt(0);
  if (c === 32 || c === 9) return isBlankLine(line);
  if (c === 35) return headingOf(line) !== null;
  if (c === 96) return fenceOpen(line) !== null;
  if (c === 45 || c === 42) return isHR(line);
  return false;
}

function bulletOf(line) {
  const c = line.charCodeAt(0);
  if ((c === 45 || c === 42) && line.charCodeAt(1) === 32) return { text: line.slice(2) };
  return null;
}

function orderedOf(line) {
  let k = 0;
  while (k < line.length && line.charCodeAt(k) >= 48 && line.charCodeAt(k) <= 57) k++;
  if (k === 0 || k > 9) return null;
  if (line.charCodeAt(k) !== 46 || line.charCodeAt(k + 1) !== 32) return null;
  return { start: Number(line.slice(0, k)), text: line.slice(k + 2) };
}

function isContinued(line) {
  let k = 0;
  while (k < line.length && line.charCodeAt(k) === 32) k++;
  return k >= 2 && k < line.length && !isWSCode(line.charCodeAt(k));
}

export function renderMarkdown(src, env) {
  const lines = src.split('\n');
  const blocks = [];
  const toc = [];
  let excerpt = null;
  const ids = new Set();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const first = line.length === 0 ? 0 : line.charCodeAt(0);
    if (first === 0 || first === 32 || first === 9) {
      if (isBlankLine(line)) { i++; continue; }
    } else if (first === 35) {
      const heading0 = headingOf(line);
      if (heading0 !== null) {
        const id = uniqueSlug(slugify(heading0.text), ids);
        const html = inline(heading0.text, env);
        blocks.push(`<h${heading0.depth} id="${id}">${html}</h${heading0.depth}>`);
        if (heading0.depth === 2 || heading0.depth === 3) toc.push({ level: heading0.depth, id, html });
        i++;
        continue;
      }
    } else if (first === 96) {
      const fence0 = fenceOpen(line);
      if (fence0 !== null) {
        const body = [];
        i++;
        while (i < lines.length && !isFenceClose(lines[i])) body.push(lines[i++]);
        i++;
        let s = '<pre><code';
        if (fence0 !== '') s += ` class="language-${escapeHtml(fence0)}"`;
        s += '>';
        for (const l of body) { s += escapeHtml(l); s += '\n'; }
        s += '</code></pre>';
        blocks.push(s);
        continue;
      }
    } else if (first === 45 || first === 42) {
      if (isHR(line)) { blocks.push('<hr>'); i++; continue; }
    } else if (first === 62) {
      const body = [];
      while (i < lines.length && lines[i].charCodeAt(0) === 62) {
        let l = lines[i++];
        l = l.slice(1);
        if (l.charCodeAt(0) === 32) l = l.slice(1);
        body.push(trimLine(l));
      }
      const ls = body.filter((l) => l !== '');
      blocks.push(ls.length === 0 ? '<blockquote>\n</blockquote>' : `<blockquote>\n<p>${inline(ls.join('\n'), env)}</p>\n</blockquote>`);
      continue;
    }
    const fence = first === 96 ? null : fenceOpen(line);
    if (fence !== null) {
      const body = [];
      i++;
      while (i < lines.length && !isFenceClose(lines[i])) body.push(lines[i++]);
      i++;
      let s = '<pre><code';
      if (fence !== '') s += ` class="language-${escapeHtml(fence)}"`;
      s += '>';
      for (const l of body) { s += escapeHtml(l); s += '\n'; }
      s += '</code></pre>';
      blocks.push(s);
      continue;
    }
    const heading = headingOf(line);
    if (heading !== null) {
      const id = uniqueSlug(slugify(heading.text), ids);
      const html = inline(heading.text, env);
      blocks.push(`<h${heading.depth} id="${id}">${html}</h${heading.depth}>`);
      if (heading.depth === 2 || heading.depth === 3) toc.push({ level: heading.depth, id, html });
      i++;
      continue;
    }
    if (isHR(line)) { blocks.push('<hr>'); i++; continue; }
    if (line.charCodeAt(0) === 62) {
      const body = [];
      while (i < lines.length && lines[i].charCodeAt(0) === 62) {
        let l = lines[i++];
        l = l.slice(1);
        if (l.charCodeAt(0) === 32) l = l.slice(1);
        body.push(trimLine(l));
      }
      const ls = body.filter((l) => l !== '');
      blocks.push(ls.length === 0 ? '<blockquote>\n</blockquote>' : `<blockquote>\n<p>${inline(ls.join('\n'), env)}</p>\n</blockquote>`);
      continue;
    }
    const bullet = bulletOf(line);
    const ordered = bullet === null ? orderedOf(line) : null;
    if (bullet !== null || ordered !== null) {
      const isOrdered = ordered !== null;
      const startNum = isOrdered ? ordered.start : 1;
      const items = [];
      while (i < lines.length) {
        const m = isOrdered ? orderedOf(lines[i]) : bulletOf(lines[i]);
        if (m !== null) { items.push([trimLine(m.text)]); i++; }
        else if (isContinued(lines[i])) { items[items.length - 1].push(trimLine(lines[i])); i++; }
        else break;
      }
      const tag = isOrdered ? 'ol' : 'ul';
      const open = isOrdered && startNum !== 1 ? `<ol start="${startNum}">` : `<${tag}>`;
      let s = `${open}\n`;
      for (const item of items) s += `<li>${inline(item.join('\n'), env)}</li>\n`;
      s += `</${tag}>`;
      blocks.push(s);
      continue;
    }
    const body = [trimLine(line)];
    i++;
    while (i < lines.length && !endsParagraph(lines[i])) body.push(trimLine(lines[i++]));
    const html = inline(body.join('\n'), env);
    if (excerpt === null) excerpt = html;
    blocks.push(`<p>${html}</p>`);
  }
  return { html: blocks.map((b) => `${b}\n`).join(''), toc, excerpt: excerpt ?? '' };
}

// Templates

export const INCLUDE_DEPTH = 8;

const PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const FOR = /^for ([A-Za-z_][A-Za-z0-9_]*) in (\S+)$/;
const IF = /^if (not )?(\S+)$/;
const INCLUDE = /^include "([a-z0-9-]+)"$/;

export class TemplateError extends Error {}

function pathOf(name, text) {
  if (!PATH.test(text)) throw new TemplateError(`template "${name}": ${JSON.stringify(text)} is not a path`);
  return text.split('.');
}

function tokenize(name, src) {
  const tokens = [];
  let text = '';
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open === -1 || open === src.length - 1) { text += src.slice(i); break; }
    const next = src[open + 1];
    if (next !== '{' && next !== '%') { text += src.slice(i, open + 1); i = open + 1; continue; }
    text += src.slice(i, open);
    if (next === '{') {
      const raw = src[open + 2] === '{';
      const close = src.indexOf(raw ? '}}}' : '}}', open + (raw ? 3 : 2));
      if (close === -1) throw new TemplateError(`template "${name}": a ${raw ? '{{{' : '{{'} is not closed`);
      if (text !== '') tokens.push({ t: 'text', text });
      text = '';
      tokens.push({ t: raw ? 'raw' : 'var', path: pathOf(name, src.slice(open + (raw ? 3 : 2), close).trim()) });
      i = close + (raw ? 3 : 2);
      continue;
    }
    const close = src.indexOf('%}', open + 2);
    if (close === -1) throw new TemplateError(`template "${name}": a {% is not closed`);
    const end = close + 2;
    const lineStart = src.lastIndexOf('\n', open - 1) + 1;
    const nl = src.indexOf('\n', end);
    const lineEnd = nl === -1 ? src.length : nl;
    const standalone = /^[ \t]*$/.test(src.slice(lineStart, open)) && /^[ \t]*$/.test(src.slice(end, lineEnd));
    if (standalone) text = text.slice(0, text.length - (open - lineStart));
    if (text !== '') tokens.push({ t: 'text', text });
    text = '';
    tokens.push({ t: 'tag', tag: src.slice(open + 2, close).trim() });
    i = standalone ? (nl === -1 ? src.length : nl + 1) : end;
  }
  if (text !== '') tokens.push({ t: 'text', text });
  return tokens;
}

export function parseTemplate(name, src) {
  const root = { kind: 'root', body: [] };
  const stack = [root];
  let body = root.body;
  for (const tok of tokenize(name, src)) {
    if (tok.t === 'text') body.push({ kind: 'text', text: tok.text });
    else if (tok.t === 'var' || tok.t === 'raw') body.push({ kind: tok.t, path: tok.path });
    else {
      const tag = tok.tag;
      const top = stack[stack.length - 1];
      let m;
      if ((m = FOR.exec(tag)) !== null) {
        const node = { kind: 'for', name: m[1], path: pathOf(name, m[2]), body: [] };
        body.push(node);
        stack.push(node);
        body = node.body;
      } else if ((m = IF.exec(tag)) !== null) {
        const node = { kind: 'if', not: m[1] !== undefined, path: pathOf(name, m[2]), then: [], else: null };
        body.push(node);
        stack.push(node);
        body = node.then;
      } else if (tag === 'else') {
        if (top.kind !== 'if' || top.else !== null) throw new TemplateError(`template "${name}": an else outside an if`);
        top.else = [];
        body = top.else;
      } else if (tag === 'endfor' || tag === 'endif') {
        if (top.kind !== (tag === 'endfor' ? 'for' : 'if')) throw new TemplateError(`template "${name}": an ${tag} with no open ${tag.slice(3)}`);
        stack.pop();
        const parent = stack[stack.length - 1];
        body = parent.kind === 'root' ? parent.body : parent.kind === 'for' ? parent.body : parent.else ?? parent.then;
      } else if ((m = INCLUDE.exec(tag)) !== null) body.push({ kind: 'include', name: m[1] });
      else throw new TemplateError(`template "${name}": {% ${tag} %} is not a tag`);
    }
  }
  if (stack.length > 1) throw new TemplateError(`template "${name}": a ${stack[stack.length - 1].kind} is not closed`);
  return root.body;
}

function lookup(scope, path) {
  let s = scope;
  while (s !== null && !Object.hasOwn(s.vars, path[0])) s = s.parent;
  if (s === null) return undefined;
  let v = s.vars[path[0]];
  for (let k = 1; k < path.length; k++) {
    if (v === null || typeof v !== 'object' || !Object.hasOwn(v, path[k])) return undefined;
    v = v[path[k]];
  }
  return v;
}

function textOf(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.map(textOf).join(', ');
  return '';
}

function truthy(v) {
  if (Array.isArray(v)) return v.length > 0;
  return v !== undefined && v !== null && v !== false && v !== '' && v !== 0;
}

function renderNodes(nodes, scope, ctx, depth, out) {
  for (const n of nodes) {
    switch (n.kind) {
      case 'text':
        out.push(n.text);
        break;
      case 'var':
        out.push(escapeHtml(textOf(lookup(scope, n.path))));
        break;
      case 'raw':
        out.push(textOf(lookup(scope, n.path)));
        break;
      case 'if': {
        const v = truthy(lookup(scope, n.path));
        const branch = v !== n.not ? n.then : n.else;
        if (branch !== null) renderNodes(branch, scope, ctx, depth, out);
        break;
      }
      case 'for': {
        const xs = lookup(scope, n.path);
        if (!Array.isArray(xs)) break;
        for (let k = 0; k < xs.length; k++) {
          const vars = { [n.name]: xs[k], loop: { index: k + 1, first: k === 0, last: k === xs.length - 1, length: xs.length } };
          renderNodes(n.body, { vars, parent: scope }, ctx, depth, out);
        }
        break;
      }
      case 'include': {
        const t = ctx.templates.get(n.name);
        if (t !== undefined && depth < INCLUDE_DEPTH) renderNodes(t, scope, ctx, depth + 1, out);
        break;
      }
    }
  }
}

// Template codegen: each template compiles once per case to a JS function.
// Includes are inlined at their static depth (top-level renders start at
// depth 0, so static depth is runtime depth). If compilation fails, render()
// falls back to the interpreter, so codegen can only speed things up.

let TEMPLATES = new Map();
let compiledCache = new Map();
let codegenFailed = false;
let uidCounter = 0;

function pathExpr(path, env) {
  const first = path[0];
  let base;
  if (first === 'loop') {
    base = env.length > 0 ? env[env.length - 1].loopId : 'undefined';
  } else {
    base = null;
    for (let k = env.length - 1; k >= 0; k--) {
      if (env[k].name === first) { base = env[k].varId; break; }
    }
    if (base === null) base = `V.${first}`;
  }
  let expr = base;
  for (let k = 1; k < path.length; k++) expr += `?.${path[k]}`;
  return expr;
}

function compileNodes(nodes, depth, env, parts) {
  for (const n of nodes) {
    if (n.kind === 'text') {
      parts.push(`out.push(${JSON.stringify(n.text)});`);
    } else if (n.kind === 'var' || n.kind === 'raw') {
      // textOf inlined for the common cases (string, number, boolean);
      // txt() only handles arrays and everything else.
      const tmp = `_t${uidCounter++}`;
      const expr = pathExpr(n.path, env);
      const val = `(typeof ${tmp}==='string'?${tmp}:typeof ${tmp}==='number'?String(${tmp}):typeof ${tmp}==='boolean'?(${tmp}?'true':'false'):txt(${tmp}))`;
      parts.push(`{const ${tmp}=${expr};out.push(${n.kind === 'var' ? `esc(${val})` : val});}`);
    } else if (n.kind === 'if') {
      const tmp = `_c${uidCounter++}`;
      parts.push(`{const ${tmp}=${pathExpr(n.path, env)};const ${tmp}t=${tmp}!==undefined&&${tmp}!==null&&${tmp}!==false&&${tmp}!==''&&${tmp}!==0&&!(Array.isArray(${tmp})&&${tmp}.length===0);if(${n.not ? `!${tmp}t` : `${tmp}t`}){`);
      compileNodes(n.then, depth, env, parts);
      parts.push('}');
      if (n.else !== null) {
        parts.push('else{');
        compileNodes(n.else, depth, env, parts);
        parts.push('}');
      }
      parts.push('}');
    } else if (n.kind === 'for') {
      const arr = `_a${uidCounter++}`;
      const idx = `_i${uidCounter++}`;
      const varId = `_v${uidCounter++}`;
      const loopId = `_l${uidCounter++}`;
      parts.push(`{const ${arr}=${pathExpr(n.path, env)};if(Array.isArray(${arr})){for(let ${idx}=0;${idx}<${arr}.length;${idx}++){const ${varId}=${arr}[${idx}];const ${loopId}={index:${idx}+1,first:${idx}===0,last:${idx}===${arr}.length-1,length:${arr}.length};`);
      env.push({ name: n.name, varId, loopId });
      compileNodes(n.body, depth, env, parts);
      env.pop();
      parts.push('}}}');
    } else if (n.kind === 'include') {
      if (depth < INCLUDE_DEPTH) {
        const target = TEMPLATES.get(n.name);
        if (target !== undefined) compileNodes(target, depth + 1, env, parts);
      }
    }
  }
}

function getCompiled(name) {
  if (compiledCache.has(name)) return compiledCache.get(name);
  const nodes = TEMPLATES.get(name);
  if (nodes === undefined) { compiledCache.set(name, null); return null; }
  const parts = [];
  compileNodes(nodes, 0, [], parts);
  const fn = new Function('out', 'V', 'esc', 'txt', parts.join(''));
  compiledCache.set(name, fn);
  return fn;
}

// Build

export const REPORT_FILE = 'build-report.txt';
export const RESERVED = Object.freeze(['posts', 'tags', 'page']);

function resolvePath(dir, rel) {
  const parts = dir === '' ? [] : dir.split('/');
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join('/');
}

const dirOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

export function run(input) {
  slugCache = new Map();
  compiledCache = new Map();
  codegenFailed = false;
  uidCounter = 0;
  const templates = new Map();
  const report = [];
  for (const name of Object.keys(input.templates).sort(byCodeUnits)) {
    try {
      templates.set(name, parseTemplate(name, input.templates[name]));
    } catch (err) {
      if (!(err instanceof TemplateError)) throw err;
      report.push(err.message);
    }
  }
  const b = {
    input,
    base: input.site.base_url.replace(/\/+$/, ''),
    templates,
    sources: [],
    statics: [],
    bySource: new Map(),
    broken: new Set(),
    report,
    posts: [],
    tags: [],
    output: {},
  };

  // Sources, in code-unit order of their paths.
  const files = [...input.files].sort((x, y) => byCodeUnits(x.path, y.path));
  for (const f of files) {
    if (f.path.endsWith('.md')) b.sources.push({ path: f.path, text: f.content.indexOf('\r') === -1 ? f.content : f.content.replace(/\r\n?/g, '\n') });
    else b.statics.push({ path: f.path, content: f.content });
  }

  // Front matter.
  const kept = [];
  for (const s of b.sources) {
    const fm = parseFrontMatter(s.text);
    if ('error' in fm) { b.report.push(`refused ${s.path}: ${fm.error}`); continue; }
    s.data = fm.data;
    s.body = fm.body;
    s.post = s.path.startsWith('posts/');
    const own = RESERVED.find((d) => d !== 'posts' && s.path.startsWith(`${d}/`));
    if (own !== undefined) { b.report.push(`refused ${s.path}: ${own}/ is the generator's own`); continue; }
    if (s.post && !Object.hasOwn(s.data, 'date')) { b.report.push(`refused ${s.path}: a post needs a date`); continue; }
    const layout = s.data.layout ?? (s.post ? 'post' : 'page');
    if (!b.templates.has(layout)) { b.report.push(`refused ${s.path}: layout "${layout}" is no template that parses`); continue; }
    s.layout = layout;
    if (s.data.draft === true) { b.report.push(`draft ${s.path}`); continue; }
    kept.push(s);
  }
  b.sources = kept;

  // Permalinks.
  const taken = new Map();
  const takenIn = (dir) => {
    if (!taken.has(dir)) taken.set(dir, new Set(dir === '' ? RESERVED : []));
    return taken.get(dir);
  };
  for (const s of b.sources) {
    const dir = s.post ? 'posts' : dirOf(s.path);
    const slug = uniqueSlug(s.data.slug ?? slugify(s.data.title), takenIn(dir));
    s.slug = slug;
    s.outDir = dir === '' ? slug : `${dir}/${slug}`;
    s.url = `${b.base}/${s.outDir}/`;
    b.bySource.set(s.path, s);
  }

  // Markdown, links resolved.
  const staticPaths = new Set(b.statics.map((f) => f.path));
  for (const s of b.sources) {
    const dir = dirOf(s.path);
    const env = {
      link: (target) => {
        if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(target) || target.startsWith('/') || target.startsWith('#')) return target;
        const hash = target.indexOf('#');
        const rel = hash === -1 ? target : target.slice(0, hash);
        const frag = hash === -1 ? '' : target.slice(hash);
        const path = rel === '' ? null : resolvePath(dir, rel);
        if (path !== null && b.bySource.has(path)) return `${b.bySource.get(path).url}${frag}`;
        if (path !== null && staticPaths.has(path)) return `${b.base}/${path}${frag}`;
        b.broken.add(`broken-link ${s.path} -> ${target}`);
        return target;
      },
    };
    const md = renderMarkdown(s.body, env);
    s.html = md.html;
    s.toc = md.toc;
    s.excerpt = md.excerpt;
  }

  // Collections.
  const posts = b.sources.filter((s) => s.post);
  posts.sort((x, y) => byCodeUnits(y.data.date, x.data.date) || byCodeUnits(x.slug, y.slug));
  b.posts = posts;
  posts.forEach((p, k) => {
    p.newer = k === 0 ? null : posts[k - 1];
    p.older = k === posts.length - 1 ? null : posts[k + 1];
  });

  // Tags.
  const bySlug = new Map();
  const ownTags = (s) => {
    const seen = new Set();
    const list = [];
    for (const name of s.data.tags ?? []) {
      const slug = slugify(name);
      if (seen.has(slug)) continue;
      seen.add(slug);
      list.push({ name, slug });
    }
    return list;
  };
  for (const p of b.posts) {
    p.tagRefs = [];
    for (const { name, slug } of ownTags(p)) {
      if (!bySlug.has(slug)) bySlug.set(slug, { name, slug, url: `${b.base}/tags/${slug}/`, posts: [] });
      const tag = bySlug.get(slug);
      tag.posts.push(p);
      p.tagRefs.push(tag);
    }
  }
  for (const s of b.sources) {
    if (!s.post) s.tagRefs = ownTags(s).map(({ name, slug }) => bySlug.get(slug) ?? { name, slug, url: '', posts: [] });
  }
  b.tags = [...bySlug.values()].sort((x, y) => y.posts.length - x.posts.length || byCodeUnits(x.slug, y.slug));

  // Layouts. Each source's card is built once here and reused.
  for (const s of b.sources) {
    s.card = {
      title: s.data.title,
      url: s.url,
      date: s.data.date ?? '',
      date_long: s.data.date === undefined ? '' : longDate(s.data.date),
      summary: s.data.summary ?? '',
      excerpt: s.excerpt,
      reading_minutes: Math.max(1, Math.ceil(wordsOf(s.body) / 200)),
      tags: s.tagRefs.map((t) => ({ name: t.name, slug: t.slug, url: t.url })),
    };
  }
  const linkOf = (s) => (s === null ? null : { title: s.data.title, url: s.url, date: s.data.date ?? '', date_long: s.data.date === undefined ? '' : longDate(s.data.date) });
  const site = { title: b.input.site.title, base_url: b.base };
  const allTags = b.tags.map((t) => ({ name: t.name, slug: t.slug, url: t.url, count: t.posts.length }));
  const recent = b.posts.slice(0, b.input.site.recent).map((p) => p.card);
  TEMPLATES = b.templates;
  const ctx = { templates: b.templates, escape: escapeHtml };
  const render = (name, vars) => {
    const nodes = b.templates.get(name);
    if (nodes === undefined) return null;
    const V = { site, tags: allTags, recent, ...vars };
    if (!codegenFailed) {
      try {
        const fn = getCompiled(name);
        if (fn !== null) {
          const out = [];
          fn(out, V, escapeHtml, textOf);
          return out.join('');
        }
      } catch (e) {
        codegenFailed = true;
      }
    }
    const out = [];
    renderNodes(nodes, { vars: V, parent: null }, ctx, 0, out);
    return out.join('');
  };
  for (const s of b.sources) {
    const c = s.card;
    const page = {
      title: c.title, url: c.url, date: c.date, date_long: c.date_long, summary: c.summary,
      excerpt: c.excerpt, reading_minutes: c.reading_minutes, tags: c.tags,
      slug: s.slug, content: s.html,
      toc: s.toc.map((h) => ({ level: h.level, id: h.id, html: h.html })),
      newer: linkOf(s.newer ?? null), older: linkOf(s.older ?? null), is_post: s.post,
    };
    b.output[`${s.outDir}/index.html`] = render(s.layout, { page });
  }
  const per = b.input.site.per_page;
  const pages = Math.max(1, Math.ceil(b.posts.length / per));
  const indexUrl = (k) => (k === 1 ? `${b.base}/` : `${b.base}/page/${k}/`);
  for (let k = 1; k <= pages; k++) {
    const html = render('index', {
      posts: b.posts.slice((k - 1) * per, k * per).map((p) => p.card),
      pager: { number: k, total: pages, url: indexUrl(k), newer_url: k === 1 ? '' : indexUrl(k - 1), older_url: k === pages ? '' : indexUrl(k + 1) },
    });
    if (html !== null) b.output[k === 1 ? 'index.html' : `page/${k}/index.html`] = html;
  }
  for (const t of b.tags) {
    const html = render('tag', { tag: { name: t.name, slug: t.slug, url: t.url, count: t.posts.length, posts: t.posts.map((p) => p.card) } });
    if (html !== null) b.output[`tags/${t.slug}/index.html`] = html;
  }
  const tagsHtml = render('tags', {});
  if (tagsHtml !== null) b.output['tags/index.html'] = tagsHtml;
  for (const f of b.statics) {
    if (Object.hasOwn(b.output, f.path)) b.report.push(`shadowed ${f.path}: a built page has its path`);
    else b.output[f.path] = f.content;
  }

  const lines = [...b.report, ...b.broken].sort(byCodeUnits);
  const pageCount = b.sources.filter((s) => !s.post).length;
  lines.push(`built ${pageCount} pages, ${b.posts.length} posts, ${b.tags.length} tags and ${b.statics.length} static files`);
  b.output[REPORT_FILE] = `${lines.join('\n')}\n`;
  return b.output;
}
