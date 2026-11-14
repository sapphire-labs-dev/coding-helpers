// JSON toolkit logic (no DOM): a strict validator that reports where the
// problem is, plus format, minify, sort keys and string escaping.
//
// The validator is our own small recursive-descent parser instead of relying
// on JSON.parse error messages, which differ between browsers and often have
// no position. It also finds duplicate keys, which JSON.parse silently drops.

export type ErrorCode =
  | 'empty' | 'unexpectedChar' | 'unexpectedEnd' | 'unterminatedString' | 'badEscape' | 'controlChar'
  | 'badNumber' | 'expectedKey' | 'expectedColon' | 'expectedCommaOrEnd' | 'trailingComma' | 'extraContent' | 'tooDeep';

export interface JsonError { code: ErrorCode; line: number; column: number; offset: number; found: string }
export interface JsonStats { keys: number; values: number; depth: number; duplicateKeys: string[] }
export type ParseResult = { ok: true; value: unknown; stats: JsonStats } | { ok: false; error: JsonError };

/** Nesting deeper than this is refused (protects the page from stack overflows). */
export const MAX_DEPTH = 1000;

class Fail extends Error {
  constructor(readonly code: ErrorCode, readonly offset: number) { super(code); }
}

export function parseJson(text: string): ParseResult {
  let i = 0;
  const stats: JsonStats = { keys: 0, values: 0, depth: 0, duplicateKeys: [] };

  const ws = () => { while (i < text.length && ' \t\n\r'.includes(text[i])) i++; };
  const fail = (code: ErrorCode, at = i): never => { throw new Fail(i >= text.length && code === 'unexpectedChar' ? 'unexpectedEnd' : code, at); };

  function string(): string {
    i++; // opening quote
    let out = '';
    while (true) {
      if (i >= text.length) fail('unterminatedString');
      const c = text[i];
      if (c === '"') { i++; return out; }
      if (c === '\\') {
        const e = text[i + 1];
        const map: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
        if (e in map) { out += map[e]; i += 2; continue; }
        if (e === 'u' && /^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) { out += String.fromCharCode(parseInt(text.slice(i + 2, i + 6), 16)); i += 6; continue; }
        fail('badEscape');
      }
      if (c < ' ') fail(c === '\n' ? 'unterminatedString' : 'controlChar');
      out += c;
      i++;
    }
  }

  function number(): number {
    const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i, i + 400));
    if (!m) fail('badNumber');
    const next = text[i + m![0].length];
    if (next !== undefined && /[\w.+-]/.test(next)) fail('badNumber', i + m![0].length);
    i += m![0].length;
    return Number(m![0]);
  }

  function literal(word: string, value: unknown): unknown {
    if (text.startsWith(word, i)) { i += word.length; return value; }
    return fail('unexpectedChar');
  }

  function value(depth: number): unknown {
    if (depth > MAX_DEPTH) fail('tooDeep');
    stats.depth = Math.max(stats.depth, depth);
    stats.values++;
    ws();
    const c = text[i];
    if (c === '{') return object(depth);
    if (c === '[') return array(depth);
    if (c === '"') return string();
    if (c === '-' || (c >= '0' && c <= '9')) return number();
    if (c === 't') return literal('true', true);
    if (c === 'f') return literal('false', false);
    if (c === 'n') return literal('null', null);
    return fail('unexpectedChar');
  }

  function object(depth: number): Record<string, unknown> {
    i++;
    const out: Record<string, unknown> = {};
    const seen = new Set<string>();
    ws();
    if (text[i] === '}') { i++; return out; }
    while (true) {
      ws();
      if (text[i] !== '"') fail(text[i] === '}' ? 'trailingComma' : 'expectedKey');
      const keyAt = i;
      const key = string();
      if (seen.has(key)) stats.duplicateKeys.push(`${key} (${position(text, keyAt).line}:${position(text, keyAt).column})`);
      seen.add(key);
      stats.keys++;
      ws();
      if (text[i] !== ':') fail('expectedColon');
      i++;
      // defineProperty: a "__proto__" key must stay a plain key, not change the prototype.
      Object.defineProperty(out, key, { value: value(depth + 1), enumerable: true, writable: true, configurable: true });
      ws();
      if (text[i] === ',') { i++; continue; }
      if (text[i] === '}') { i++; return out; }
      fail('expectedCommaOrEnd');
    }
  }

  function array(depth: number): unknown[] {
    i++;
    const out: unknown[] = [];
    ws();
    if (text[i] === ']') { i++; return out; }
    while (true) {
      ws();
      if (text[i] === ']') fail('trailingComma');
      out.push(value(depth + 1));
      ws();
      if (text[i] === ',') { i++; continue; }
      if (text[i] === ']') { i++; return out; }
      fail('expectedCommaOrEnd');
    }
  }

  try {
    if (text.charCodeAt(0) === 0xfeff) i = 1; // byte order mark
    ws();
    if (i >= text.length) fail('empty');
    const v = value(1);
    ws();
    if (i < text.length) fail('extraContent');
    return { ok: true, value: v, stats };
  } catch (e) {
    if (!(e instanceof Fail)) throw e;
    const { line, column } = position(text, e.offset);
    return { ok: false, error: { code: e.code, line, column, offset: e.offset, found: describeChar(text[e.offset]) } };
  }
}

/** 1-based line and column of a character offset. */
export function position(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let k = 0; k < offset && k < text.length; k++) {
    if (text[k] === '\n') { line++; lineStart = k + 1; }
  }
  return { line, column: offset - lineStart + 1 };
}

function describeChar(c: string | undefined): string {
  if (c === undefined) return '';
  if (c === '\n') return '\\n';
  if (c === '\t') return '\\t';
  return c;
}

/** Recursively sort object keys (arrays keep their order). */
export function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort((a, b) => a.localeCompare(b))) {
      Object.defineProperty(out, k, { value: sortKeys((v as Record<string, unknown>)[k]), enumerable: true, writable: true, configurable: true });
    }
    return out;
  }
  return v;
}

export type Indent = 2 | 4 | 'tab';

export function format(value: unknown, indent: Indent): string {
  return JSON.stringify(value, null, indent === 'tab' ? '\t' : indent);
}

export const minify = (value: unknown) => JSON.stringify(value);

/** Text as a JSON string literal, e.g. to paste into code or another JSON. */
export const escapeString = (text: string) => JSON.stringify(text);

/** The text inside a JSON string literal (quotes optional). Throws on bad input. */
export function unescapeString(literal: string): string {
  const s = literal.trim();
  const quoted = s.startsWith('"') && s.endsWith('"') && s.length >= 2 ? s : `"${s}"`;
  const r = parseJson(quoted);
  if (!r.ok || typeof r.value !== 'string') throw new Error('not a JSON string');
  return r.value;
}

export const byteSize = (text: string) => new TextEncoder().encode(text).length;
