// JWT inspector page (/jwt). The token and keys live only in the page: they
// are never saved, logged or sent anywhere.

import { $, bindCopyTargets, h } from '@sapphirelabs/ui/dom';
import { initI18n, locale, t, type Key } from '../../i18n';
import { relativeTime } from '../time/time';
import { CLAIM_KEYS, decodeJwt, isSymmetric, timeClaims, verifyJwt, type DecodedJwt } from './jwt';

let current: DecodedJwt | null = null;
let lastToken = '';

const TAG_CLASS: Record<string, string> = { valid: 'ok', expired: 'bad', notYetValid: 'warn', noExpiry: '' };

function claimValue(key: string, value: unknown, now: number): (Node | string)[] {
  if ((key === 'exp' || key === 'nbf' || key === 'iat') && typeof value === 'number') {
    const d = new Date(value * 1000);
    return [String(value), h('small', { text: `${d.toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'medium' })} · ${relativeTime(d, now, locale())}` })];
  }
  return [typeof value === 'string' ? value : JSON.stringify(value)];
}

function render(): void {
  const raw = $<HTMLTextAreaElement>('token').value;
  const err = $('error');
  current = null;
  // A verification result belongs to one token: hide it when the token changes.
  if (raw !== lastToken) $('verify-result').hidden = true;
  lastToken = raw;
  if (!raw.trim()) { err.hidden = true; $('decoded').hidden = true; $('alg-none').hidden = true; return; }
  const r = decodeJwt(raw);
  if (!r.ok) {
    err.hidden = false;
    err.textContent = t(`jwt.err.${r.code}` as Key, { part: r.part ? t(`jwt.part.${r.part}` as Key) : '' });
    $('decoded').hidden = true;
    $('alg-none').hidden = true;
    return;
  }
  err.hidden = true;
  current = r.jwt;
  const { header, payload } = r.jwt;
  const now = Date.now();
  $('decoded').hidden = false;
  $('header').textContent = JSON.stringify(header, null, 2);
  $('payload').textContent = JSON.stringify(payload, null, 2);

  const alg = String(header.alg ?? '?');
  $('alg-none').hidden = alg.toLowerCase() !== 'none';
  $('alg-tag').textContent = `alg ${alg}`;
  const times = timeClaims(payload, now);
  const tag = $('status-tag');
  tag.textContent = t(`jwt.status.${times.status}` as Key);
  tag.className = `tag ${TAG_CLASS[times.status]}`.trim();
  $('status-when').textContent = times.exp
    ? t(times.status === 'expired' ? 'jwt.expiredAgo' : 'jwt.expiresIn', { when: relativeTime(times.exp, now, locale()) })
    : '';

  const rows: Node[] = [];
  for (const [key, value] of [...Object.entries(header).filter(([k]) => k !== 'typ'), ...Object.entries(payload)]) {
    const label = CLAIM_KEYS[key] ? `${t(CLAIM_KEYS[key] as Key)} (${key})` : key;
    rows.push(h('dt', { text: label }), h('dd', {}, ...claimValue(key, value, now)));
  }
  $('claims').replaceChildren(...rows);

  const symmetric = isSymmetric(alg);
  $('key-label').textContent = symmetric ? t('jwt.secret') : t('jwt.publicKey');
  $<HTMLTextAreaElement>('key').placeholder = symmetric ? t('jwt.secretPlaceholder') : t('jwt.keyPlaceholder');
  $('b64-row').hidden = !symmetric;
}

async function verify(): Promise<void> {
  if (!current) return;
  const result = await verifyJwt(current, $<HTMLTextAreaElement>('key').value, { secretIsBase64: $<HTMLInputElement>('b64').checked });
  const el = $('verify-result');
  el.hidden = false;
  el.textContent = t(`jwt.v.${result}` as Key);
  el.className = `tag ${result === 'valid' ? 'ok' : 'bad'}`;
}

export function initJwtPage(): void {
  initI18n();
  const token = $<HTMLTextAreaElement>('token');
  token.addEventListener('input', render);
  $('clear-btn').addEventListener('click', () => {
    token.value = '';
    $<HTMLTextAreaElement>('key').value = '';
    render();
    token.focus();
  });
  $('verify-form').addEventListener('submit', (e) => { e.preventDefault(); void verify(); });
  $('key').addEventListener('input', () => { $('verify-result').hidden = true; });
  bindCopyTargets(document, () => t('common.copied'));
  window.addEventListener('langchange', render);
  // Keep "expires in …" current.
  window.setInterval(() => { if (current) render(); }, 30_000);
  render();
}
