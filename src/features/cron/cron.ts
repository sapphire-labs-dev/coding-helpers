// Cron logic (no DOM): parse a standard 5-field expression (minute hour
// day-of-month month day-of-week), describe it in English or Portuguese and
// list the next times it runs.
//
// Supports *, lists (1,15), ranges (1-5), steps (*/15, 0-30/10), month and
// weekday names (JAN, MON), 7 as Sunday, ? as *, and the @hourly … @yearly
// macros. As in Vixie cron, when both day-of-month and day-of-week are
// restricted, a day matches if EITHER matches.

export const FIELDS = ['minute', 'hour', 'dom', 'month', 'dow'] as const;
export type FieldName = (typeof FIELDS)[number];

const RANGES: Record<FieldName, [number, number]> = { minute: [0, 59], hour: [0, 23], dom: [1, 31], month: [1, 12], dow: [0, 6] };
const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export const MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *', '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@hourly': '0 * * * *',
};

export interface Field {
  /** Allowed values, sorted. */
  values: number[];
  /** True when the field was * (or ?), i.e. not restricted. */
  any: boolean;
  /** The step of a simple "*\/n" field, else null. */
  step: number | null;
  source: string;
}
export type Cron = Record<FieldName, Field>;

export type CronErrorCode = 'fieldCount' | 'badValue' | 'outOfRange' | 'badRange' | 'badStep' | 'empty';
export interface CronError { code: CronErrorCode; field: FieldName | null; part: string }
export type CronResult = { ok: true; cron: Cron; normalized: string } | { ok: false; error: CronError };

class Fail extends Error {
  constructor(readonly error: CronError) { super(error.code); }
}

function value(token: string, name: FieldName): number {
  const up = token.toUpperCase();
  if (name === 'month' && MONTH_NAMES.includes(up)) return MONTH_NAMES.indexOf(up) + 1;
  if (name === 'dow' && DAY_NAMES.includes(up)) return DAY_NAMES.indexOf(up);
  if (!/^\d+$/.test(token)) throw new Fail({ code: 'badValue', field: name, part: token });
  const n = Number(token);
  const [min, max] = RANGES[name];
  // Sunday may be written as 7.
  if (name === 'dow' && n === 7) return 0;
  if (n < min || n > max) throw new Fail({ code: 'outOfRange', field: name, part: token });
  return n;
}

function parseField(source: string, name: FieldName): Field {
  const [min, max] = RANGES[name];
  const set = new Set<number>();
  const any = source === '*' || source === '?';
  let simpleStep: number | null = null;
  for (const part of source.split(',')) {
    if (!part) throw new Fail({ code: 'badValue', field: name, part: source });
    const [rangePart, stepPart, extra] = part.split('/');
    if (extra !== undefined) throw new Fail({ code: 'badStep', field: name, part });
    let step = 1;
    if (stepPart !== undefined) {
      if (!/^\d+$/.test(stepPart) || Number(stepPart) < 1) throw new Fail({ code: 'badStep', field: name, part });
      step = Number(stepPart);
    }
    let lo: number;
    let hi: number;
    if (rangePart === '*' || rangePart === '?') {
      [lo, hi] = [min, name === 'dow' ? 6 : max];
      if (stepPart !== undefined && source.split(',').length === 1) simpleStep = step;
    } else if (rangePart.includes('-')) {
      const [a, b, more] = rangePart.split('-');
      if (more !== undefined || !a || !b) throw new Fail({ code: 'badRange', field: name, part });
      lo = value(a, name);
      // "MON-SUN" / "1-7": Sunday as the end of a weekday range means 7.
      hi = name === 'dow' && (b === '7' || b.toUpperCase() === 'SUN') ? 7 : value(b, name);
      if (lo > hi) throw new Fail({ code: 'badRange', field: name, part });
    } else {
      lo = value(rangePart, name);
      hi = stepPart !== undefined ? (name === 'dow' ? 6 : max) : lo;
    }
    for (let v = lo; v <= hi; v += step) set.add(name === 'dow' ? v % 7 : v);
  }
  return { values: [...set].sort((a, b) => a - b), any, step: simpleStep, source };
}

export function parseCron(expr: string): CronResult {
  const trimmed = expr.trim().replace(/\s+/g, ' ');
  if (!trimmed) return { ok: false, error: { code: 'empty', field: null, part: '' } };
  const expanded = MACROS[trimmed.toLowerCase()] ?? trimmed;
  const parts = expanded.split(' ');
  if (parts.length !== 5) return { ok: false, error: { code: 'fieldCount', field: null, part: String(parts.length) } };
  try {
    const cron = Object.fromEntries(FIELDS.map((f, i) => [f, parseField(parts[i], f)])) as Cron;
    return { ok: true, cron, normalized: expanded };
  } catch (e) {
    if (e instanceof Fail) return { ok: false, error: e.error };
    throw e;
  }
}

// ───────────── Next runs ─────────────

type Mode = 'local' | 'utc';

function dayMatches(c: Cron, d: Date, utc: boolean): boolean {
  const dom = utc ? d.getUTCDate() : d.getDate();
  const dow = utc ? d.getUTCDay() : d.getDay();
  const domOk = c.dom.values.includes(dom);
  const dowOk = c.dow.values.includes(dow);
  if (!c.dom.any && !c.dow.any) return domOk || dowOk;
  return domOk && dowOk;
}

/**
 * The next `count` times the expression fires after `from` (exclusive), in
 * the browser's time zone or in UTC. Searches at most ~5 years ahead.
 */
export function nextRuns(c: Cron, from: Date, count: number, mode: Mode = 'local'): Date[] {
  const utc = mode === 'utc';
  const get = {
    month: (d: Date) => (utc ? d.getUTCMonth() : d.getMonth()) + 1,
    hour: (d: Date) => (utc ? d.getUTCHours() : d.getHours()),
    minute: (d: Date) => (utc ? d.getUTCMinutes() : d.getMinutes()),
  };
  const d = new Date(from.getTime());
  if (utc) d.setUTCSeconds(0, 0); else d.setSeconds(0, 0);
  const bump = (unit: 'minute' | 'hour' | 'day' | 'month') => {
    if (unit === 'minute') { d.setTime(d.getTime() + 60_000); return; }
    if (unit === 'hour') { if (utc) d.setUTCHours(d.getUTCHours() + 1, 0, 0, 0); else d.setHours(d.getHours() + 1, 0, 0, 0); return; }
    if (unit === 'day') { if (utc) d.setUTCHours(24, 0, 0, 0); else d.setHours(24, 0, 0, 0); return; }
    if (utc) d.setUTCMonth(d.getUTCMonth() + 1, 1); else d.setMonth(d.getMonth() + 1, 1);
    if (utc) d.setUTCHours(0, 0, 0, 0); else d.setHours(0, 0, 0, 0);
  };
  bump('minute');
  const out: Date[] = [];
  const limit = from.getTime() + 5 * 366 * 86_400_000;
  while (out.length < count && d.getTime() <= limit) {
    if (!c.month.values.includes(get.month(d))) { bump('month'); continue; }
    if (!dayMatches(c, d, utc)) { bump('day'); continue; }
    if (!c.hour.values.includes(get.hour(d))) { bump('hour'); continue; }
    if (!c.minute.values.includes(get.minute(d))) { bump('minute'); continue; }
    out.push(new Date(d.getTime()));
    bump('minute');
  }
  return out;
}

// ───────────── Plain-language description ─────────────

type Lang = 'en' | 'pt';
const pad = (n: number) => String(n).padStart(2, '0');

const WORDS = {
  en: {
    everyMinute: 'Every minute', everyNMinutes: (n: number) => `Every ${n} minutes`,
    atMinutes: (m: string) => `At minute ${m} of every hour`, at: (t: string) => `At ${t}`,
    everyHourAt: (m: string) => `At minute ${m}`, everyNHours: (n: number) => `every ${n} hours`, hours: (h: string) => `past hour ${h}`,
    everyMinuteOfHours: (h: string) => `Every minute during hour ${h}`,
    onDom: (d: string) => `on day ${d} of the month`, onDow: (d: string) => `on ${d}`, or: 'or', inMonths: (m: string) => `in ${m}`,
    list: (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`),
    through: 'through',
  },
  pt: {
    everyMinute: 'A cada minuto', everyNMinutes: (n: number) => `A cada ${n} minutos`,
    atMinutes: (m: string) => `No minuto ${m} de cada hora`, at: (t: string) => `Às ${t}`,
    everyHourAt: (m: string) => `No minuto ${m}`, everyNHours: (n: number) => `a cada ${n} horas`, hours: (h: string) => `das ${h} h`,
    everyMinuteOfHours: (h: string) => `A cada minuto durante a hora ${h}`,
    onDom: (d: string) => `no dia ${d} do mês`, onDow: (d: string) => `em ${d}`, or: 'ou', inMonths: (m: string) => `em ${m}`,
    list: (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`),
    through: 'a',
  },
};

/** Compress consecutive values: [1,2,3,5] → ["1–3", "5"] using `fmt` for each value. */
function ranges(values: number[], fmt: (n: number) => string, through: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < values.length; i++) {
    let j = i;
    while (j + 1 < values.length && values[j + 1] === values[j] + 1) j++;
    out.push(j - i >= 2 ? `${fmt(values[i])} ${through} ${fmt(values[j])}` : j > i ? `${fmt(values[i])}, ${fmt(values[j])}` : fmt(values[i]));
    i = j;
  }
  return out;
}

export function describe(c: Cron, lang: Lang): string {
  const w = WORDS[lang];
  const monthName = (m: number) => new Date(2024, m - 1, 1).toLocaleDateString(lang === 'pt' ? 'pt-BR' : 'en', { month: 'long' });
  const dayName = (d: number) => new Date(2024, 0, 7 + d).toLocaleDateString(lang === 'pt' ? 'pt-BR' : 'en', { weekday: 'long' });
  const join = (xs: number[], fmt: (n: number) => string = String) => w.list(ranges(xs, fmt, w.through));

  let time: string;
  const m = c.minute;
  const h = c.hour;
  if (m.any && h.any) time = w.everyMinute;
  else if (m.step && h.any) time = w.everyNMinutes(m.step);
  else if (h.any) time = w.atMinutes(join(m.values));
  else if (m.any) time = w.everyMinuteOfHours(join(h.values));
  else if (h.step && m.values.length === 1) time = `${w.everyHourAt(String(m.values[0]))}, ${w.everyNHours(h.step)}`;
  else if (h.values.length * m.values.length <= 6) {
    const times = h.values.flatMap((hh) => m.values.map((mm) => `${pad(hh)}:${pad(mm)}`));
    time = w.at(w.list(times));
  } else time = `${w.everyHourAt(join(m.values))}, ${w.hours(join(h.values))}`;

  const days: string[] = [];
  const domPart = c.dom.any ? '' : w.onDom(join(c.dom.values));
  const dowPart = c.dow.any ? '' : w.onDow(join(c.dow.values, dayName));
  if (domPart && dowPart) days.push(`${domPart} ${w.or} ${dowPart}`);
  else if (domPart || dowPart) days.push(domPart || dowPart);
  if (!c.month.any) days.push(w.inMonths(join(c.month.values, monthName)));
  return [time, ...days].join(', ');
}
