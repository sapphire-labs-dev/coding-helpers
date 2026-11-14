import { describe, expect, it } from 'vitest';
import { byteSize, escapeString, format, MAX_DEPTH, minify, parseJson, sortKeys, unescapeString } from './json';

const err = (text: string) => {
  const r = parseJson(text);
  if (r.ok) throw new Error('expected an error');
  return r.error;
};

describe('JSON validator', () => {
  it('accepts what JSON.parse accepts and returns the same value', () => {
    for (const text of ['{"a":[1,2.5e3,-0.1,true,false,null,"x\\n\\u00e9"]}', '[]', '"s"', ' 42 ', '{"nested":{"deep":[{}]}}']) {
      const r = parseJson(text);
      expect(r.ok, text).toBe(true);
      if (r.ok) expect(r.value).toEqual(JSON.parse(text));
    }
  });

  it('reports where the problem is', () => {
    expect(err('{\n  "a": 1,\n}')).toMatchObject({ code: 'trailingComma', line: 3, column: 1 });
    expect(err('[1, 2,]')).toMatchObject({ code: 'trailingComma', line: 1, column: 7 });
    expect(err('{"a" 1}')).toMatchObject({ code: 'expectedColon', column: 6, found: '1' });
    expect(err("{'a': 1}")).toMatchObject({ code: 'expectedKey', column: 2, found: "'" });
    expect(err('{"a": 1 "b": 2}')).toMatchObject({ code: 'expectedCommaOrEnd', column: 9 });
    expect(err('{"a": "x')).toMatchObject({ code: 'unterminatedString' });
    expect(err('"bad \\x escape"')).toMatchObject({ code: 'badEscape', column: 6 });
    expect(err('[01]')).toMatchObject({ code: 'badNumber' });
    expect(err('[1.]')).toMatchObject({ code: 'badNumber' });
    expect(err('{"a": tru}')).toMatchObject({ code: 'unexpectedChar' });
    expect(err('{"a": 1} x')).toMatchObject({ code: 'extraContent', column: 10 });
    expect(err('{"a": ')).toMatchObject({ code: 'unexpectedEnd' });
    expect(err('   ')).toMatchObject({ code: 'empty' });
    expect(err('"tab\there"')).toMatchObject({ code: 'controlChar', found: '\\t' });
  });

  it('counts keys and depth and finds duplicate keys', () => {
    const r = parseJson('{"a": 1, "b": {"c": [1, 2]}, "a": 3}');
    expect(r.ok && r.stats).toEqual({ keys: 4, values: 7, depth: 4, duplicateKeys: ['a (1:30)'] });
  });

  it('refuses absurd nesting instead of crashing', () => {
    expect(err('['.repeat(MAX_DEPTH + 5) + ']'.repeat(MAX_DEPTH + 5)).code).toBe('tooDeep');
  });

  it('keeps "__proto__" as an ordinary key', () => {
    const r = parseJson('{"__proto__": {"polluted": true}}');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.keys(r.value as object)).toEqual(['__proto__']);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      expect(format(sortKeys(r.value), 2)).toContain('"__proto__"');
    }
  });

  it('skips a byte order mark', () => {
    expect(parseJson('﻿{"a":1}').ok).toBe(true);
  });
});

describe('JSON transforms', () => {
  const v = { b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } };

  it('formats, minifies and sorts keys deeply', () => {
    expect(minify(v)).toBe('{"b":1,"a":{"d":[3,{"z":1,"y":2}],"c":null}}');
    expect(minify(sortKeys(v))).toBe('{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}');
    expect(format({ a: 1 }, 4)).toBe('{\n    "a": 1\n}');
    expect(format({ a: 1 }, 'tab')).toBe('{\n\t"a": 1\n}');
  });

  it('escapes and unescapes string literals', () => {
    const text = 'Line 1\n"quoted"\tand \\ backslash';
    expect(escapeString(text)).toBe('"Line 1\\n\\"quoted\\"\\tand \\\\ backslash"');
    expect(unescapeString(escapeString(text))).toBe(text);
    expect(unescapeString('a\\nb')).toBe('a\nb');
    expect(() => unescapeString('"bad \\q"')).toThrow();
  });

  it('measures UTF-8 size', () => {
    expect(byteSize('é€')).toBe(5);
  });
});
