// UUID tools page (/uuid): bulk generator and inspector.

import { $, bindCopyTargets, downloadText } from '@sapphirelabs/ui/dom';
import { load, save } from '@sapphirelabs/ui/storage';
import { initI18n, locale, t, type Key } from '../../i18n';
import { generate, inspectUuid, type FormatOptions, type Version } from './uuid';

const checked = (id: string) => $<HTMLInputElement>(id).checked;
const version = (): Version => (document.querySelector<HTMLInputElement>('input[name="version"]:checked')?.value === '7' ? 7 : 4);
const options = (): FormatOptions => ({ uppercase: checked('uppercase'), hyphens: checked('hyphens'), braces: checked('braces') });

function regenerate(): void {
  const count = Number($<HTMLInputElement>('count').value);
  $<HTMLTextAreaElement>('generated').value = generate(version(), count, options()).join('\n');
  $('v7-hint').hidden = version() !== 7;
  save('uuid:prefs', { version: version(), count: Math.min(1000, Math.max(1, Math.floor(count) || 1)), ...options() });
}

function inspect(): void {
  const raw = $<HTMLInputElement>('inspect').value;
  const info = raw.trim() ? inspectUuid(raw) : null;
  $('invalid').hidden = !raw.trim() || info !== null;
  $('info').hidden = !info;
  if (!info) return;
  $('i-canonical').textContent = info.canonical;
  const vKey = info.special ? null : (`uuid.ver.${info.version}` as Key);
  $('i-version').textContent = info.special
    ? t(info.special === 'nil' ? 'uuid.nil' : 'uuid.max')
    : `${info.version} · ${info.version >= 1 && info.version <= 8 ? t(vKey!) : t('uuid.ver.unknown')}`;
  $('i-variant').textContent = t(`uuid.var.${info.variant}` as Key);
  $('i-time-label').hidden = !info.time;
  $('i-time').hidden = !info.time;
  if (info.time) {
    $('i-time').textContent = `${info.time.toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'medium' })} · ${info.time.toISOString()}`;
  }
}

export function initUuidPage(): void {
  initI18n();
  const prefs = load<Record<string, unknown> | null>('uuid:prefs', null);
  if (prefs && typeof prefs === 'object') {
    if (prefs.version === 7) document.querySelector<HTMLInputElement>('input[name="version"][value="7"]')!.checked = true;
    if (typeof prefs.count === 'number') $<HTMLInputElement>('count').value = String(prefs.count);
    for (const k of ['uppercase', 'hyphens', 'braces'] as const) if (typeof prefs[k] === 'boolean') $<HTMLInputElement>(k).checked = prefs[k] as boolean;
  }
  document.querySelectorAll<HTMLInputElement>('input[name="version"], #uppercase, #hyphens, #braces').forEach((el) => el.addEventListener('change', regenerate));
  $('count').addEventListener('change', regenerate);
  $('generate-btn').addEventListener('click', regenerate);
  $('download-btn').addEventListener('click', () => downloadText('uuids.txt', `${$<HTMLTextAreaElement>('generated').value}\n`));
  $('inspect').addEventListener('input', inspect);
  bindCopyTargets(document, () => t('common.copied'));
  window.addEventListener('langchange', inspect);
  regenerate();
}
