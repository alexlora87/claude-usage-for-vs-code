import { config, l10nJsonFormat } from '@vscode/l10n';

let current = 'en';

/**
 * Loads the bundle VS Code found for its display language and follows that language for dates.
 * VS Code passes the language of the installed language pack (`es`, `pt-br`, `ja`…) and loads only
 * the bundle named exactly after it; without one, everything stays in English.
 */
export function setLanguage(displayLanguage: string, bundle: l10nJsonFormat | undefined): void {
  current = bundle ? displayLanguage.toLowerCase() : 'en';
  config({ contents: bundle ?? {} });
}

/** The language of the texts, for the `lang` of a page. */
export function language(): string {
  return current;
}

/** The locale for dates: the display language when translated, or the English one the caller formats with. */
export function dateLocale(english: string): string {
  return current === 'en' ? english : current;
}
