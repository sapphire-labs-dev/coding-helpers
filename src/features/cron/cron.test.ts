import { describe as group, expect, it } from 'vitest';
import { describe, nextRuns, parseCron, type Cron } from './cron';

const cron = (expr: string): Cron => {
  const r = parseCron(expr);
  if (!r.ok) throw new Error(`${expr}: ${r.error.code}`);
  return r.cron;
};
const utcRuns = (expr: string, from: string, n = 3) => nextRuns(cron(expr), new Date(from), n, 'utc').map((d) => d.toISOString().slice(0, 16));

group('parsing cron expressions', () => {
  it('expands lists, ranges, steps and names', () => {
    expect(cron('*/15 9-17 * * MON-FRI').minute.values).toEqual([0, 15, 30, 45]);
    expect(cron('*/15 9-17 * * MON-FRI').hour.values).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(cron('0 0 * * MON-FRI').dow.values).toEqual([1, 2, 3, 4, 5]);
    expect(cron('0 0 1,15 JAN,jul *').month.values).toEqual([1, 7]);
    expect(cron('5-30/10 * * * *').minute.values).toEqual([5, 15, 25]);
    expect(cron('0 0 * * 7').dow.values).toEqual([0]);
    expect(cron('0 0 * * 5-7').dow.values).toEqual([0, 5, 6]);
    expect(cron('0 0 ? * *').dom.any).toBe(true);
  });

  it('expands macros', () => {
    expect(parseCron('@daily')).toMatchObject({ ok: true, normalized: '0 0 * * *' });
    expect(parseCron('@weekly')).toMatchObject({ ok: true, normalized: '0 0 * * 0' });
  });

  it('explains what is wrong', () => {
    expect(parseCron('* * * *')).toMatchObject({ ok: false, error: { code: 'fieldCount' } });
    expect(parseCron('60 * * * *')).toMatchObject({ ok: false, error: { code: 'outOfRange', field: 'minute', part: '60' } });
    expect(parseCron('* 5-2 * * *')).toMatchObject({ ok: false, error: { code: 'badRange', field: 'hour' } });
    expect(parseCron('*/0 * * * *')).toMatchObject({ ok: false, error: { code: 'badStep' } });
    expect(parseCron('* * * FOO *')).toMatchObject({ ok: false, error: { code: 'badValue', field: 'month' } });
    expect(parseCron('* * 0 * *')).toMatchObject({ ok: false, error: { code: 'outOfRange', field: 'dom' } });
    expect(parseCron('')).toMatchObject({ ok: false, error: { code: 'empty' } });
  });
});

group('next runs', () => {
  it('steps through minutes, hours and days', () => {
    expect(utcRuns('*/15 * * * *', '2026-11-13T10:07:30Z')).toEqual(['2026-11-13T10:15', '2026-11-13T10:30', '2026-11-13T10:45']);
    expect(utcRuns('30 9 * * MON-FRI', '2026-11-13T10:00:00Z')).toEqual(['2026-11-16T09:30', '2026-11-17T09:30', '2026-11-18T09:30']);
    expect(utcRuns('0 0 1 * *', '2026-11-13T00:00:00Z', 2)).toEqual(['2026-12-01T00:00', '2027-01-01T00:00']);
  });

  it('is exclusive of the start minute', () => {
    expect(utcRuns('0 12 * * *', '2026-11-13T12:00:00Z', 1)).toEqual(['2026-11-14T12:00']);
  });

  it('matches day-of-month OR day-of-week when both are set', () => {
    // 13th of the month or any Friday: 2026-11-13 is a Friday.
    expect(utcRuns('0 8 13 * FRI', '2026-11-13T09:00:00Z', 3)).toEqual(['2026-11-20T08:00', '2026-11-27T08:00', '2026-12-04T08:00']);
    expect(utcRuns('0 8 15 * MON', '2026-11-13T09:00:00Z', 2)).toEqual(['2026-11-15T08:00', '2026-11-16T08:00']);
  });

  it('finds rare dates and gives up on impossible ones', () => {
    expect(utcRuns('0 0 29 2 *', '2026-01-01T00:00:00Z', 1)).toEqual(['2028-02-29T00:00']);
    expect(utcRuns('0 0 31 2 *', '2026-01-01T00:00:00Z', 1)).toEqual([]);
  });
});

group('describing cron expressions', () => {
  it('in English', () => {
    expect(describe(cron('* * * * *'), 'en')).toBe('Every minute');
    expect(describe(cron('*/5 * * * *'), 'en')).toBe('Every 5 minutes');
    expect(describe(cron('30 9 * * MON-FRI'), 'en')).toBe('At 09:30, on Monday through Friday');
    expect(describe(cron('0 0 1 1 *'), 'en')).toBe('At 00:00, on day 1 of the month, in January');
    expect(describe(cron('15 * * * *'), 'en')).toBe('At minute 15 of every hour');
    expect(describe(cron('0 */6 * * *'), 'en')).toBe('At minute 0, every 6 hours');
    expect(describe(cron('0 9,18 * * 1,3'), 'en')).toBe('At 09:00 and 18:00, on Monday and Wednesday');
  });

  it('in Portuguese', () => {
    expect(describe(cron('*/10 * * * *'), 'pt')).toBe('A cada 10 minutos');
    expect(describe(cron('30 9 * * 1-5'), 'pt')).toBe('Às 09:30, em segunda-feira a sexta-feira');
    expect(describe(cron('0 0 1,15 * *'), 'pt')).toBe('Às 00:00, no dia 1 e 15 do mês');
  });
});
