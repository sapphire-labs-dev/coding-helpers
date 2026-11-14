// Timestamp converter page (/time): input → formats, a list of time zones
// (saved in this browser) and a meeting planner across those zones.

import { $, bindCopyTargets, h } from '@sapphirelabs/ui/dom';
import { load, save } from '@sapphirelabs/ui/storage';
import { initI18n, locale, t, type Key } from '../../i18n';
import {
  allZones, formatOffset, isoInZone, isoWeek, isValidZone, parseTimeInput, relativeTime, wallTimeToInstant, zoneOffset, type Unit,
} from './time';

const ZONES_KEY = 'time:zones';
const MAX_ZONES = 20;
const myZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

let zones: string[] = [];
/** The instant shown in the zone list (the parsed input, or now). */
let shown: Date | null = null;

const unit = (): Unit | 'auto' => (document.querySelector<HTMLInputElement>('input[name="unit"]:checked')?.value ?? 'auto') as Unit | 'auto';

function renderClock(): void {
  const now = Date.now();
  $('now-s').textContent = String(Math.floor(now / 1000));
  $('now-ms').textContent = String(now);
}

function renderResult(): void {
  const raw = $<HTMLInputElement>('input').value;
  const now = Date.now();
  const parsed = parseTimeInput(raw, now, unit());
  const status = $('status');
  const results = $('results');
  results.hidden = !parsed;
  if (!parsed) {
    status.className = `status-line${raw.trim() ? ' bad' : ''}`;
    status.textContent = raw.trim() ? t('time.invalid') : '';
    shown = null;
    renderZones();
    return;
  }
  const d = parsed.date;
  shown = d;
  status.className = 'status-line';
  status.textContent = parsed.unit ? t('time.detected', { unit: t(`time.unit.${parsed.unit}` as Key) }) : '';
  $('r-local').textContent = d.toLocaleString(locale(), { dateStyle: 'full', timeStyle: 'long' });
  $('r-relative').textContent = relativeTime(d, now, locale());
  $('r-s').textContent = String(Math.floor(d.getTime() / 1000));
  $('r-ms').textContent = String(d.getTime());
  $('r-iso').textContent = d.toISOString();
  $('r-iso-local').textContent = isoInZone(d, myZone);
  $('r-rfc').textContent = d.toUTCString();
  const w = isoWeek(d);
  $('r-week').textContent = t('time.weekValue', { week: w.week, year: w.year });
  renderZones();
}

function renderZones(): void {
  const at = shown ?? new Date();
  const timeFmt = (zone: string) => new Intl.DateTimeFormat(locale(), { timeZone: zone, hour: '2-digit', minute: '2-digit' });
  const dateFmt = (zone: string) => new Intl.DateTimeFormat(locale(), { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short' });
  $('zones').replaceChildren(...zones.map((zone, i) =>
    h('li', { 'data-zone': zone },
      h('span', { class: 'z-name' }, zone.replace(/_/g, ' '), zone === myZone ? h('small', { text: `(${t('time.yours')})` }) : null),
      h('span', { class: 'z-date', text: dateFmt(zone).format(at) }),
      h('span', { class: 'z-time', text: timeFmt(zone).format(at) }),
      h('span', { class: 'z-off', text: `UTC${formatOffset(zoneOffset(zone, at))}` }),
      h('button', { type: 'button', class: 'row-btn', 'data-act': 'up', title: t('common.moveUp'), 'aria-label': t('common.moveUp'), disabled: i === 0, text: '↑' }),
      h('button', { type: 'button', class: 'row-btn danger', 'data-act': 'remove', title: t('common.remove'), 'aria-label': `${t('common.remove')} ${zone}`, text: '✕' }),
    ),
  ));
  const sel = $<HTMLSelectElement>('plan-zone');
  const keep = sel.value;
  sel.replaceChildren(...zones.map((z) => h('option', { value: z, text: z.replace(/_/g, ' ') })));
  sel.value = zones.includes(keep) ? keep : zones[0] ?? '';
}

function persistZones(): void {
  save(ZONES_KEY, zones);
  renderZones();
}

function bindZones(): void {
  const list = allZones();
  $('zone-list').replaceChildren(...list.map((z) => h('option', { value: z })));
  $('zone-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $<HTMLInputElement>('zone-input');
    const typed = input.value.trim().replace(/ /g, '_');
    const zone = list.find((z) => z.toLowerCase() === typed.toLowerCase()) ?? (isValidZone(typed) ? typed : null);
    $('zone-error').hidden = !!zone;
    if (!zone) return;
    if (!zones.includes(zone) && zones.length < MAX_ZONES) zones.push(zone);
    input.value = '';
    persistZones();
  });
  $('zones').addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
    const zone = btn?.closest<HTMLElement>('[data-zone]')?.dataset.zone;
    if (!btn || !zone) return;
    const i = zones.indexOf(zone);
    if (btn.dataset.act === 'remove') zones.splice(i, 1);
    else if (btn.dataset.act === 'up' && i > 0) [zones[i - 1], zones[i]] = [zones[i], zones[i - 1]];
    persistZones();
  });
  $('plan-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const at = wallTimeToInstant($<HTMLInputElement>('plan-at').value, $<HTMLSelectElement>('plan-zone').value || myZone);
    if (!at) return;
    $<HTMLInputElement>('input').value = isoInZone(at, $<HTMLSelectElement>('plan-zone').value || myZone);
    renderResult();
  });
}

export function initTimePage(): void {
  initI18n();
  const saved = load<unknown>(ZONES_KEY, null);
  zones = Array.isArray(saved) ? saved.filter((z): z is string => typeof z === 'string' && isValidZone(z)).slice(0, MAX_ZONES) : [];
  if (!zones.length) zones = [...new Set([myZone, 'UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo'])];

  $('input').addEventListener('input', renderResult);
  document.querySelectorAll<HTMLInputElement>('input[name="unit"]').forEach((r) => r.addEventListener('change', renderResult));
  $('now-btn').addEventListener('click', () => {
    $<HTMLInputElement>('input').value = String(Math.floor(Date.now() / 1000));
    renderResult();
  });
  bindZones();
  bindCopyTargets(document, () => t('common.copied'));
  window.addEventListener('langchange', renderResult);
  window.setInterval(() => { renderClock(); if (!shown) renderZones(); }, 1000);

  const now = new Date();
  $<HTMLInputElement>('plan-at').value = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  renderClock();
  renderResult();
}
