// All strings of the site: shared layout words from @sapphirelabs/ui plus
// one group per tool. `t()` only accepts keys defined here.
import { createTranslator, mergeStrings, uiStrings } from '@sapphirelabs/ui/i18n';
import { common } from './common';
import { cron } from './cron';
import { json } from './json';
import { jwt } from './jwt';
import { time } from './time';
import { uuid } from './uuid';

export const dict = mergeStrings(uiStrings, common, json, cron, uuid, jwt, time);
export type Key = keyof typeof dict.en & string;
export const t = createTranslator(dict);

export { applyTitle, getLang, initI18n, locale } from '@sapphirelabs/ui/i18n';
