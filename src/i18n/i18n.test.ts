import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { translationProblems, usedI18nKeys } from '@sapphirelabs/ui/testing';
import { ALGS, CLAIM_KEYS } from '../features/jwt/jwt';
import { dict } from './index';

describe('translations', () => {
  it('are complete, consistent and cover every key the code uses', () => {
    const used = usedI18nKeys(fileURLToPath(new URL('../', import.meta.url)));
    expect(used.size).toBeGreaterThan(50); // sanity check that the scan found the code
    expect(translationProblems(dict, used)).toEqual([]);
  });

  it('cover keys that are built at runtime', () => {
    const built = [
      ...['empty', 'unexpectedChar', 'unexpectedEnd', 'unterminatedString', 'badEscape', 'controlChar', 'badNumber', 'expectedKey', 'expectedColon', 'expectedCommaOrEnd', 'trailingComma', 'extraContent', 'tooDeep'].map((c) => `json.err.${c}`),
      ...['fieldCount', 'badValue', 'outOfRange', 'badRange', 'badStep', 'empty'].map((c) => `cron.err.${c}`),
      ...['minute', 'hour', 'dom', 'month', 'dow'].map((f) => `cron.field.${f}`),
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((v) => `uuid.ver.${v}`),
      ...['rfc', 'ncs', 'microsoft', 'future'].map((v) => `uuid.var.${v}`),
      ...['parts', 'base64', 'json', 'notObject'].map((c) => `jwt.err.${c}`),
      ...['header', 'payload', 'signature'].map((p) => `jwt.part.${p}`),
      ...['valid', 'expired', 'notYetValid', 'noExpiry'].map((s) => `jwt.status.${s}`),
      ...['valid', 'invalid', 'unsupportedAlg', 'noneAlg', 'badKey'].map((v) => `jwt.v.${v}`),
      ...Object.values(CLAIM_KEYS),
      ...['s', 'ms', 'us', 'ns'].map((u) => `time.unit.${u}`),
    ];
    expect(built.filter((k) => !(k in dict.en))).toEqual([]);
    expect(Object.keys(ALGS).length).toBeGreaterThan(10);
  });
});
