import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { t } from '@vscode/l10n';
import { afterEach, describe, expect, it } from 'vitest';
import { dateLocale, language, setLanguage } from './l10n';

const SPANISH: Record<string, string> = JSON.parse(readFileSync('l10n/bundle.l10n.es.json', 'utf8'));

afterEach(() => setLanguage('en', undefined));

describe('setLanguage', () => {
  it('keeps the English text and fills in the placeholders', () => {
    expect(t('{0} of {1}', '$1.00', '$2.00')).toBe('$1.00 of $2.00');
    expect(language()).toBe('en');
  });

  it('translates for any Spanish display language', () => {
    for (const displayLanguage of ['es', 'es-419', 'es-MX', 'ES']) {
      setLanguage(displayLanguage, SPANISH);
      expect(t('{0} of {1}', '$1.00', '$2.00')).toBe('$1.00 de $2.00');
    }
    expect(language()).toBe('es');
    expect(dateLocale('en-GB')).toBe('es');
  });

  it('stays in English for other languages, and without a bundle', () => {
    for (const [displayLanguage, bundle] of [['fr', { Offline: 'Hors ligne' }], ['est', SPANISH], ['es', undefined]] as const) {
      setLanguage(displayLanguage, bundle);
      expect(t('Offline')).toBe('Offline');
      expect(language()).toBe('en');
      expect(dateLocale('en-GB')).toBe('en-GB');
    }
  });

  it('goes back to English', () => {
    setLanguage('es', SPANISH);
    setLanguage('en', undefined);
    expect(t('Offline')).toBe('Offline');
  });
});

describe('Spanish bundle', () => {
  const sources = (readdirSync('src', { recursive: true }) as string[])
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    .map((file) => readFileSync(join('src', file), 'utf8'));
  const calls = sources.flatMap((source) => [...source.matchAll(/\bt\(\s*(.)/g)]);
  const keys = sources.flatMap((source) => [...source.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)].map((match) => match[1]));
  const placeholders = (text: string) => [...text.matchAll(/\{\d+\}/g)].map((match) => match[0]).sort();

  it('gets a literal text in every call, so the checks below see them all', () => {
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.filter((match) => match[1] !== "'")).toEqual([]);
  });

  it('translates every text the code passes to t', () => {
    expect(keys.filter((key) => !(key in SPANISH))).toEqual([]);
  });

  it('has no translation the code no longer uses', () => {
    expect(Object.keys(SPANISH).filter((key) => !keys.includes(key))).toEqual([]);
  });

  it('keeps the placeholders of each text', () => {
    const mismatched = Object.entries(SPANISH).filter(([key, text]) => placeholders(key).join() !== placeholders(text).join());
    expect(mismatched).toEqual([]);
  });
});
