import { config, l10nJsonFormat } from '@vscode/l10n';

export type Language = 'en' | 'es';

let current: Language = 'en';

/**
 * Loads the bundle VS Code picked for its display language (none for English) and follows that
 * language for dates; any language other than Spanish (`es`, `es-419`…) stays in English.
 */
export function setLanguage(displayLanguage: string, bundle: l10nJsonFormat | undefined): void {
  current = bundle && /^es(-|$)/i.test(displayLanguage) ? 'es' : 'en';
  config({ contents: current === 'es' && bundle ? bundle : {} });
}

export function language(): Language {
  return current;
}

/** The locale for dates: Spanish, or the English one the caller formats with. */
export function dateLocale(english: string): string {
  return current === 'es' ? 'es' : english;
}
