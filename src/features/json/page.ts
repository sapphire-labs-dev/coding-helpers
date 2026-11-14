// JSON toolkit page (/json). The input is never saved; only the indent choice is.

import { $, bindCopyTargets, downloadText, formatBytes } from '@sapphirelabs/ui/dom';
import { load, save } from '@sapphirelabs/ui/storage';
import { initI18n, t, type Key } from '../../i18n';
import { byteSize, escapeString, format, minify, parseJson, sortKeys, unescapeString, type Indent, type JsonError } from './json';

let lastError: JsonError | null = null;
/** The last indent-dependent action, repeated when the indent changes. */
let lastLayout: 'format' | 'sort' | null = null;

const input = () => $<HTMLTextAreaElement>('input');
const indent = (): Indent => {
  const v = document.querySelector<HTMLInputElement>('input[name="indent"]:checked')?.value;
  return v === '4' ? 4 : v === 'tab' ? 'tab' : 2;
};

function setStatus(text: string, kind: 'ok' | 'bad' | '' = ''): void {
  const el = $('status');
  el.textContent = text;
  el.className = `status-line${kind ? ` ${kind}` : ''}`;
}

function errorText(e: JsonError): string {
  const message = t(`json.err.${e.code}` as Key) + (e.found && e.code === 'unexpectedChar' ? t('json.found', { found: e.found }) : '');
  return e.code === 'empty' ? message : t('json.errorAt', { line: e.line, column: e.column, message });
}

/** Validate the input and show the result; returns the parsed value when valid. */
function check(): { value: unknown } | null {
  const text = input().value;
  const dup = $('duplicates');
  lastError = null;
  $('goto-btn').hidden = true;
  dup.hidden = true;
  if (!text.trim()) { setStatus(''); return null; }
  const r = parseJson(text);
  if (!r.ok) {
    lastError = r.error;
    setStatus(errorText(r.error), 'bad');
    $('goto-btn').hidden = r.error.code === 'empty';
    return null;
  }
  setStatus(t('json.valid', { size: formatBytes(byteSize(text)), keys: r.stats.keys, depth: r.stats.depth }), 'ok');
  if (r.stats.duplicateKeys.length) {
    dup.hidden = false;
    dup.textContent = t('json.duplicates', { keys: r.stats.duplicateKeys.slice(0, 10).join(', ') });
  }
  return { value: r.value };
}

function output(text: string): void {
  $<HTMLTextAreaElement>('output').value = text;
}

function transform(fn: (value: unknown) => string): void {
  const r = check();
  if (r) output(fn(r.value));
}

let timer: number | undefined;

export function initJsonPage(): void {
  initI18n();
  const saved = load<unknown>('json:indent', 2);
  document.querySelectorAll<HTMLInputElement>('input[name="indent"]').forEach((r) => {
    r.checked = r.value === String(saved);
    r.addEventListener('change', () => {
      save('json:indent', indent());
      if (lastLayout === 'format') transform((v) => format(v, indent()));
      else if (lastLayout === 'sort') transform((v) => format(sortKeys(v), indent()));
    });
  });

  input().addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(check, 150);
  });
  $('format-btn').addEventListener('click', () => { lastLayout = 'format'; transform((v) => format(v, indent())); });
  $('minify-btn').addEventListener('click', () => { lastLayout = null; transform(minify); });
  $('sort-btn').addEventListener('click', () => { lastLayout = 'sort'; transform((v) => format(sortKeys(v), indent())); });
  $('escape-btn').addEventListener('click', () => { lastLayout = null; output(escapeString(input().value)); });
  $('unescape-btn').addEventListener('click', () => {
    lastLayout = null;
    try {
      output(unescapeString(input().value));
    } catch {
      setStatus(t('json.unescapeError'), 'bad');
    }
  });
  $('clear-btn').addEventListener('click', () => {
    input().value = '';
    output('');
    check();
    input().focus();
  });
  $('goto-btn').addEventListener('click', () => {
    if (!lastError) return;
    const el = input();
    el.focus();
    el.setSelectionRange(lastError.offset, Math.min(el.value.length, lastError.offset + 1));
    // Scroll the error into view: place it about a third from the top.
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
    el.scrollTop = Math.max(0, (lastError.line - 4) * lineHeight);
  });
  $('download-btn').addEventListener('click', () => {
    const text = $<HTMLTextAreaElement>('output').value;
    if (text) downloadText('data.json', text, 'application/json');
  });
  bindCopyTargets(document, () => t('common.copied'));
  window.addEventListener('langchange', () => { check(); });
}
