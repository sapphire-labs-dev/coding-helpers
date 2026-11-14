// Timestamp and time-zone logic (no DOM): read a Unix timestamp or a date in
// many spellings, show it in several formats and time zones, and convert a
// wall-clock time in one zone to the same instant everywhere.

export type Unit = 's' | 'ms' | 'us' | 'ns';
export interface ParsedTime { date: Date; source: 'unix' | 'text'; unit: Unit | null }

/** Guess the unit of a Unix timestamp from its size (dates between 1973 and 5138). */
export function guessUnit(n: number): Unit {
  const a = Math.abs(n);
  if (a < 1e11) return 's';
  if (a < 1e14) return 'ms';
  if (a < 1e17) return 'us';
  return 'ns';
}

const UNIT_MS: Record<Unit, number> = { s: 1000, ms: 1, us: 1e-3, ns: 1e-6 };

/**
 * Accepts "now", Unix timestamps (seconds, milliseconds, microseconds or
 * nanoseconds; `unit` forces one), ISO 8601 and the formats Date.parse knows.
 */
export function parseTimeInput(input: string, now: number, unit: Unit | 'auto' = 'auto'): ParsedTime | null {
  const s = input.trim();
  if (!s) return null;
  if (/^now$/i.test(s) || /^agora$/i.test(s)) return { date: new Date(now), source: 'text', unit: null };
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    const u = unit === 'auto' ? guessUnit(n) : unit;
    const ms = n * UNIT_MS[u];
    const date = new Date(Math.round(ms));
    return Number.isNaN(date.getTime()) ? null : { date, source: 'unix', unit: u };
  }
  // "2026-11-13 10:00" → ISO with a T so every browser reads it the same way.
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s) ? s.replace(' ', 'T') : s;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : { date: new Date(ms), source: 'text', unit: null };
}

/** Offset of a time zone from UTC at an instant, in minutes (e.g. -180 for São Paulo). */
export function zoneOffset(zone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const a = Math.abs(minutes);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

/**
 * The instant at which the clock in `zone` shows this wall time
 * ("2026-11-13T09:30"). In a DST gap the later valid time is used.
 */
export function wallTimeToInstant(wall: string, zone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(wall);
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  let instant = guess - zoneOffset(zone, new Date(guess)) * 60_000;
  // Recheck with the offset in force at that instant (DST changes).
  instant = guess - zoneOffset(zone, new Date(instant)) * 60_000;
  return new Date(instant);
}

/** ISO 8601 with the zone's offset, e.g. 2026-11-13T09:30:00-03:00. */
export function isoInZone(date: Date, zone: string): string {
  const offset = zoneOffset(zone, date);
  const local = new Date(date.getTime() + offset * 60_000);
  const iso = local.toISOString().slice(0, 19);
  return offset === 0 && zone === 'UTC' ? `${iso}Z` : `${iso}${formatOffset(offset)}`;
}

/** ISO week number and year (weeks start on Monday; week 1 has the year's first Thursday). */
export function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return { year: d.getUTCFullYear(), week: Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7) };
}

/** "3 hours ago" / "in 2 days" in the given locale. */
export function relativeTime(date: Date, now: number, locale: string): string {
  const diff = (date.getTime() - now) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3600], ['minute', 60]];
  for (const [unit, secs] of steps) if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  return rtf.format(Math.round(diff), 'second');
}

/** All IANA time zones the browser knows (with UTC first). */
export function allZones(): string[] {
  const list = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return ['UTC', ...list.filter((z) => z !== 'UTC')];
}

export function isValidZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
