import { describe, expect, it } from 'vitest';
import { formatOffset, guessUnit, isoInZone, isoWeek, isValidZone, parseTimeInput, relativeTime, wallTimeToInstant, zoneOffset } from './time';

const NOW = Date.UTC(2026, 10, 13, 12, 0, 0);

describe('reading time input', () => {
  it('guesses the unit of a timestamp', () => {
    expect(['1763035200', '1763035200000', '1763035200000000', '1763035200000000000'].map((s) => guessUnit(Number(s)))).toEqual(['s', 'ms', 'us', 'ns']);
    for (const s of ['1763035200', '1763035200000', '1763035200000000', '1763035200000000000']) {
      expect(parseTimeInput(s, NOW)?.date.toISOString(), s).toBe('2025-11-13T12:00:00.000Z');
    }
  });

  it('can force a unit and accepts negative and fractional seconds', () => {
    expect(parseTimeInput('1763035200', NOW, 'ms')?.date.toISOString()).toBe('1970-01-21T09:43:55.200Z');
    expect(parseTimeInput('-86400', NOW)?.date.toISOString()).toBe('1969-12-31T00:00:00.000Z');
    expect(parseTimeInput('1.5', NOW)?.date.getTime()).toBe(1500);
  });

  it('reads dates in common formats and "now"', () => {
    expect(parseTimeInput('2026-11-13T09:30:00-03:00', NOW)?.date.toISOString()).toBe('2026-11-13T12:30:00.000Z');
    expect(parseTimeInput('2026-11-13T12:30:00Z', NOW)?.date.toISOString()).toBe('2026-11-13T12:30:00.000Z');
    expect(parseTimeInput('Fri, 13 Nov 2026 12:30:00 GMT', NOW)?.date.toISOString()).toBe('2026-11-13T12:30:00.000Z');
    expect(parseTimeInput('now', NOW)?.date.getTime()).toBe(NOW);
    expect(parseTimeInput('not a date', NOW)).toBeNull();
    expect(parseTimeInput('', NOW)).toBeNull();
  });
});

describe('time zones', () => {
  it('knows offsets including daylight saving time', () => {
    expect(zoneOffset('America/Sao_Paulo', new Date(NOW))).toBe(-180);
    expect(zoneOffset('Asia/Kolkata', new Date(NOW))).toBe(330);
    expect(zoneOffset('America/New_York', new Date(Date.UTC(2026, 6, 1)))).toBe(-240);
    expect(zoneOffset('America/New_York', new Date(Date.UTC(2026, 0, 1)))).toBe(-300);
    expect(formatOffset(330)).toBe('+05:30');
    expect(formatOffset(-180)).toBe('-03:00');
  });

  it('converts a wall time in one zone to the instant', () => {
    expect(wallTimeToInstant('2026-11-13T09:30', 'America/Sao_Paulo')?.toISOString()).toBe('2026-11-13T12:30:00.000Z');
    expect(wallTimeToInstant('2026-07-01T09:00', 'Europe/Berlin')?.toISOString()).toBe('2026-07-01T07:00:00.000Z');
    expect(wallTimeToInstant('2026-01-01T09:00', 'Europe/Berlin')?.toISOString()).toBe('2026-01-01T08:00:00.000Z');
    expect(wallTimeToInstant('13/11/2026', 'UTC')).toBeNull();
  });

  it('writes ISO with the zone offset', () => {
    expect(isoInZone(new Date(NOW), 'America/Sao_Paulo')).toBe('2026-11-13T09:00:00-03:00');
    expect(isoInZone(new Date(NOW), 'UTC')).toBe('2026-11-13T12:00:00Z');
    expect(isoInZone(new Date(NOW), 'Asia/Tokyo')).toBe('2026-11-13T21:00:00+09:00');
  });

  it('validates zone names', () => {
    expect(isValidZone('Europe/Lisbon')).toBe(true);
    expect(isValidZone('Mars/Olympus')).toBe(false);
  });
});

describe('calendar helpers', () => {
  it('computes ISO weeks', () => {
    expect(isoWeek(new Date(Date.UTC(2026, 10, 13)))).toEqual({ year: 2026, week: 46 });
    expect(isoWeek(new Date(Date.UTC(2027, 0, 1)))).toEqual({ year: 2026, week: 53 });
  });

  it('says how long ago', () => {
    expect(relativeTime(new Date(NOW - 3 * 3600_000), NOW, 'en')).toBe('3 hours ago');
    expect(relativeTime(new Date(NOW + 2 * 86_400_000), NOW, 'en')).toBe('in 2 days');
    expect(relativeTime(new Date(NOW - 86_400_000), NOW, 'pt-BR')).toBe('ontem');
  });
});
