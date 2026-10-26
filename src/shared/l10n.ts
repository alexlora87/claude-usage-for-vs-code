import { ES } from './l10n_es';

export type Language = 'en' | 'es';

let current: Language = 'en';

/** Follows the VS Code display language (`es`, `es-419`…); any language without translations stays in English. */
export function setLanguage(displayLanguage: string): void {
  current = /^es(-|$)/i.test(displayLanguage) ? 'es' : 'en';
}

export function language(): Language {
  return current;
}

/** The locale for dates: Spanish, or the English one the caller formats with. */
export function dateLocale(english: string): string {
  return current === 'es' ? 'es' : english;
}

/** The text in the display language, with `{0}`, `{1}`… replaced by `args`. The English text is the key. */
export function t(message: string, ...args: Array<string | number>): string {
  const text = current === 'es' ? ES[message] ?? message : message;
  return text.replace(/\{(\d+)\}/g, (match, index: string) => (Number(index) < args.length ? String(args[Number(index)]) : match));
}
