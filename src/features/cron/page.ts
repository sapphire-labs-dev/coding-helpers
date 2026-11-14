// Cron builder page (/cron): the expression and the five field inputs stay in
// sync; the description and next runs update as you type.

import { $, bindCopyTargets, h } from '@sapphirelabs/ui/dom';
import { load, save } from '@sapphirelabs/ui/storage';
import { getLang, initI18n, locale, t, type Key } from '../../i18n';
import { describe, FIELDS, nextRuns, parseCron, type FieldName } from './cron';
import { relativeTime } from '../time/time';

const exprInput = () => $<HTMLInputElement>('expr');
const fieldInput = (f: FieldName) => document.querySelector<HTMLInputElement>(`input[data-field="${f}"]`)!;
const mode = (): 'local' | 'utc' => (document.querySelector<HTMLInputElement>('input[name="tz"]:checked')?.value === 'utc' ? 'utc' : 'local');

function render(syncFields: boolean): void {
  const expr = exprInput().value;
  const r = parseCron(expr);
  const err = $('error');
  FIELDS.forEach((f) => fieldInput(f).removeAttribute('aria-invalid'));
  if (!r.ok) {
    err.hidden = false;
    const field = r.error.field ? t(`cron.field.${r.error.field}` as Key) : '';
    err.textContent = t(`cron.err.${r.error.code}` as Key, { field, part: r.error.part });
    if (r.error.field) fieldInput(r.error.field).setAttribute('aria-invalid', 'true');
    $('describe').textContent = '';
    $('runs').replaceChildren();
    exprInput().setAttribute('aria-invalid', 'true');
    return;
  }
  err.hidden = true;
  exprInput().removeAttribute('aria-invalid');
  if (syncFields) {
    const parts = r.normalized.split(' ');
    FIELDS.forEach((f, i) => { if (document.activeElement !== fieldInput(f)) fieldInput(f).value = parts[i]; });
  }
  $('describe').textContent = describe(r.cron, getLang());
  document.querySelectorAll<HTMLButtonElement>('#presets .chip').forEach((c) => c.classList.toggle('on', c.dataset.expr === r.normalized));

  const now = Date.now();
  const m = mode();
  const runs = nextRuns(r.cron, new Date(now), 10, m);
  const fmt = new Intl.DateTimeFormat(locale(), {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: m === 'utc' ? 'UTC' : undefined,
  });
  $('runs').replaceChildren(...(runs.length
    ? runs.map((d) => h('li', {}, fmt.format(d), h('span', { text: relativeTime(d, now, locale()) })))
    : [h('li', { text: t('cron.none') })]));
  $('zone').textContent = m === 'utc' ? 'UTC' : Intl.DateTimeFormat().resolvedOptions().timeZone;
  save('cron:expr', expr);
}

export function initCronPage(): void {
  initI18n();
  const saved = load<unknown>('cron:expr', null);
  if (typeof saved === 'string' && saved.length < 200) exprInput().value = saved;
  if (load<unknown>('cron:tz', 'local') === 'utc') document.querySelector<HTMLInputElement>('input[name="tz"][value="utc"]')!.checked = true;

  exprInput().addEventListener('input', () => render(true));
  FIELDS.forEach((f) => fieldInput(f).addEventListener('input', () => {
    exprInput().value = FIELDS.map((g) => fieldInput(g).value.trim() || '*').join(' ');
    render(false);
  }));
  $('presets').addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLButtonElement>('.chip');
    if (!chip) return;
    exprInput().value = chip.dataset.expr!;
    render(true);
  });
  document.querySelectorAll<HTMLInputElement>('input[name="tz"]').forEach((r) => r.addEventListener('change', () => {
    save('cron:tz', mode());
    render(false);
  }));
  bindCopyTargets(document, () => t('common.copied'));
  window.addEventListener('langchange', () => render(false));
  // Keep "in 5 minutes" fresh.
  window.setInterval(() => render(false), 30_000);
  render(true);
}
