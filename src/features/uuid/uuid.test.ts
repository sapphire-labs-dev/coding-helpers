import { describe, expect, it } from 'vitest';
import { formatUuid, generate, inspectUuid, uuidV4, uuidV7 } from './uuid';

const RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('generating UUIDs', () => {
  it('makes valid, unique version 4 UUIDs', () => {
    const ids = Array.from({ length: 500 }, uuidV4);
    expect(ids.every((id) => RE.test(id) && id[14] === '4')).toBe(true);
    expect(new Set(ids).size).toBe(500);
  });

  it('makes version 7 UUIDs that carry the time and sort in creation order', () => {
    const t = Date.UTC(2026, 10, 13, 12, 0, 0);
    const ids = Array.from({ length: 50 }, () => uuidV7(t));
    expect(ids.every((id) => RE.test(id) && id[14] === '7')).toBe(true);
    expect([...ids].sort()).toEqual(ids);
    expect(inspectUuid(ids[0])?.time?.getTime()).toBe(t);
    expect(uuidV7(t + 1) > ids[49]).toBe(true);
  });

  it('formats and limits bulk generation', () => {
    const id = '0190f2a1-7c3b-7d4e-8f00-1234567890ab';
    expect(formatUuid(id, { uppercase: true, hyphens: false, braces: true })).toBe('{0190F2A17C3B7D4E8F001234567890AB}');
    expect(generate(4, 5000, { uppercase: false, hyphens: true, braces: false })).toHaveLength(1000);
    expect(generate(7, 0, { uppercase: false, hyphens: true, braces: false })).toHaveLength(1);
  });
});

describe('inspecting UUIDs', () => {
  it('reads version, variant and the time of v1, v6 and v7', () => {
    expect(inspectUuid('C232AB00-9414-11EC-B3C8-9F6BDECED846')).toMatchObject({
      canonical: 'c232ab00-9414-11ec-b3c8-9f6bdeced846', version: 1, variant: 'rfc',
    });
    expect(inspectUuid('C232AB00-9414-11EC-B3C8-9F6BDECED846')?.time?.toISOString()).toBe('2022-02-22T19:22:22.000Z');
    expect(inspectUuid('1EC9414C-232A-6B00-B3C8-9F6BDECED846')?.time?.toISOString()).toBe('2022-02-22T19:22:22.000Z');
    expect(inspectUuid('017F22E2-79B0-7CC3-98C4-DC0C0C07398F')?.time?.toISOString()).toBe('2022-02-22T19:22:22.000Z');
    expect(inspectUuid('919108f7-52d1-4320-9bac-f847db4148a8')).toMatchObject({ version: 4, variant: 'rfc', time: null });
  });

  it('accepts common spellings and rejects malformed ones', () => {
    for (const s of ['{919108f7-52d1-4320-9bac-f847db4148a8}', 'urn:uuid:919108f7-52d1-4320-9bac-f847db4148a8', '919108F752D143209BACF847DB4148A8']) {
      expect(inspectUuid(s)?.canonical, s).toBe('919108f7-52d1-4320-9bac-f847db4148a8');
    }
    for (const s of ['919108f7-52d1-4320-9bac', '919108f7-52d14320-9bac-f847-db4148a8', 'zz9108f7-52d1-4320-9bac-f847db4148a8', '']) {
      expect(inspectUuid(s), s).toBeNull();
    }
  });

  it('recognises the nil and max UUIDs', () => {
    expect(inspectUuid('00000000-0000-0000-0000-000000000000')?.special).toBe('nil');
    expect(inspectUuid('FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF')?.special).toBe('max');
  });
});
