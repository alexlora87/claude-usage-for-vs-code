import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { dateLocale, language, setLanguage, t } from './l10n';
import { ES } from './l10n_es';

afterEach(() => setLanguage('en'));

describe('t', () => {
  it('keeps the English text and fills in the placeholders', () => {
    expect(t('{0} of {1}', '$1.00', '$2.00')).toBe('$1.00 of $2.00');
  });

  it('translates for any Spanish display language', () => {
    for (const displayLanguage of ['es', 'es-419', 'es-MX', 'ES']) {
      setLanguage(displayLanguage);
      expect(t('{0} of {1}', '$1.00', '$2.00')).toBe('$1.00 de $2.00');
    }
    expect(language()).toBe('es');
    expect(dateLocale('en-GB')).toBe('es');
  });

  it('stays in English for other languages', () => {
    for (const displayLanguage of ['en', 'fr', 'pt-br', 'est']) {
      setLanguage(displayLanguage);
      expect(t('Offline')).toBe('Offline');
      expect(language()).toBe('en');
      expect(dateLocale('en-GB')).toBe('en-GB');
    }
  });

  it('leaves a placeholder without a value as it is', () => {
    expect(t('{0} of {1}', '$1.00')).toBe('$1.00 of {1}');
  });
});

describe('Spanish translations', () => {
  const sources = (readdirSync('src', { recursive: true }) as string[])
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    .map((file) => readFileSync(join('src', file), 'utf8'));
  const calls = sources.flatMap((source) => [...source.matchAll(/(?<!function )\bt\(\s*(.)/g)]);
  const keys = sources.flatMap((source) => [...source.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)].map((match) => match[1]));
  const placeholders = (text: string) => [...text.matchAll(/\{\d+\}/g)].map((match) => match[0]).sort();

  it('gets a literal text in every call, so the check below sees them all', () => {
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.filter((match) => match[1] !== "'")).toEqual([]);
  });

  it('translates every text the code passes to t', () => {
    expect(keys.filter((key) => !(key in ES))).toEqual([]);
  });

  it('has no translation the code no longer uses', () => {
    expect(Object.keys(ES).filter((key) => !keys.includes(key))).toEqual([]);
  });

  it('keeps the placeholders of each text', () => {
    const mismatched = Object.entries(ES).filter(([key, text]) => placeholders(key).join() !== placeholders(text).join());
    expect(mismatched).toEqual([]);
  });
});
