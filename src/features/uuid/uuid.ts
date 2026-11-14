// UUID logic (no DOM): generate v4 (random) and v7 (time-ordered) UUIDs with
// the browser's cryptographic random generator, and inspect any UUID:
// version, variant and the time stored in v1, v6 and v7.

export type Version = 4 | 7;

/** Random bytes from the Web Crypto API (never Math.random). */
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const hyphenate = (h: string) => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;

export function uuidV4(): string {
  const b = random(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  return hyphenate(hex(b));
}

let lastMs = -1;
let lastCounter = 0;

/**
 * Version 7 (RFC 9562): 48-bit Unix time in ms, then random bits. Within the
 * same millisecond a 12-bit counter keeps the UUIDs in creation order.
 */
export function uuidV7(now = Date.now()): string {
  const b = random(16);
  let counter: number;
  if (now === lastMs && lastCounter < 0xfff) counter = ++lastCounter;
  else { counter = ((b[6] & 0x07) << 8) | b[7]; lastCounter = counter; lastMs = now; } // start low so it can grow
  const ms = BigInt(now);
  for (let i = 0; i < 6; i++) b[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  b[6] = 0x70 | ((counter >> 8) & 0x0f);
  b[7] = counter & 0xff;
  b[8] = (b[8] & 0x3f) | 0x80;
  return hyphenate(hex(b));
}

export interface FormatOptions { uppercase: boolean; hyphens: boolean; braces: boolean }

export function formatUuid(uuid: string, o: FormatOptions): string {
  let s = o.hyphens ? uuid : uuid.replace(/-/g, '');
  if (o.uppercase) s = s.toUpperCase();
  return o.braces ? `{${s}}` : s;
}

export function generate(version: Version, count: number, o: FormatOptions): string[] {
  const n = Math.min(1000, Math.max(1, Math.floor(count) || 1));
  return Array.from({ length: n }, () => formatUuid(version === 4 ? uuidV4() : uuidV7(), o));
}

// ───────────── Inspect ─────────────

export type Variant = 'ncs' | 'rfc' | 'microsoft' | 'future';

export interface UuidInfo {
  /** Canonical lower-case form with hyphens. */
  canonical: string;
  version: number;
  variant: Variant;
  special: 'nil' | 'max' | null;
  /** Creation time for time-based versions (1, 6, 7). */
  time: Date | null;
}

/** Accepts upper/lower case, with or without hyphens, braces or "urn:uuid:". */
export function inspectUuid(input: string): UuidInfo | null {
  const s = input.trim().replace(/^urn:uuid:/i, '').replace(/^\{(.*)\}$/, '$1');
  const compact = s.replace(/-/g, '');
  const hyphensOk = !s.includes('-') || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  if (!/^[0-9a-f]{32}$/i.test(compact) || !hyphensOk) return null;
  const h = compact.toLowerCase();
  const canonical = hyphenate(h);
  if (/^0{32}$/.test(h)) return { canonical, version: 0, variant: 'ncs', special: 'nil', time: null };
  if (/^f{32}$/.test(h)) return { canonical, version: 15, variant: 'future', special: 'max', time: null };

  const version = parseInt(h[12], 16);
  const v = parseInt(h[16], 16);
  const variant: Variant = v < 8 ? 'ncs' : v < 12 ? 'rfc' : v < 14 ? 'microsoft' : 'future';
  let time: Date | null = null;
  if (variant === 'rfc') {
    if (version === 7) time = new Date(parseInt(h.slice(0, 12), 16));
    else if (version === 1 || version === 6) {
      // 60-bit count of 100 ns intervals since 1582-10-15 (the Gregorian reform).
      const ticks = version === 1
        ? BigInt(`0x${h.slice(13, 16)}${h.slice(8, 12)}${h.slice(0, 8)}`)
        : BigInt(`0x${h.slice(0, 8)}${h.slice(8, 12)}${h.slice(13, 16)}`);
      const ms = Number(ticks / 10_000n) - 12_219_292_800_000;
      time = new Date(ms);
    }
  }
  return { canonical, version, variant, special: null, time };
}
