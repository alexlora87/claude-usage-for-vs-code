import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { t } from '@vscode/l10n';
import { afterEach, describe, expect, it } from 'vitest';
import { dateLocale, language, setLanguage } from './l10n';

const BUNDLES: Array<[string, Record<string, string>]> = readdirSync('l10n').flatMap((file) => {
  const lang = file.match(/^bundle\.l10n\.(.+)\.json$/)?.[1];
  return lang ? [[lang, JSON.parse(readFileSync(join('l10n', file), 'utf8'))] as [string, Record<string, string>]] : [];
});
const SPANISH = Object.fromEntries(BUNDLES)['es'];

afterEach(() => setLanguage('en', undefined));

describe('setLanguage', () => {
  it('keeps the English text and fills in the placeholders', () => {
    expect(t('{0} of {1}', '$1.00', '$2.00')).toBe('$1.00 of $2.00');
    expect(language()).toBe('en');
  });

  it('translates with the bundle VS Code found and follows its language for dates', () => {
    setLanguage('es', SPANISH);
    expect(t('{0} of {1}', '$1.00', '$2.00')).toBe('$1.00 de $2.00');
    expect(language()).toBe('es');
    expect(dateLocale('en-GB')).toBe('es');
  });

  it('stays in English without a bundle', () => {
    setLanguage('fr-ca', undefined);
    expect(t('Offline')).toBe('Offline');
    expect(language()).toBe('en');
    expect(dateLocale('en-GB')).toBe('en-GB');
  });

  it('goes back to English', () => {
    setLanguage('es', SPANISH);
    setLanguage('en', undefined);
    expect(t('Offline')).toBe('Offline');
  });
});

describe('bundles', () => {
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

  it.each(BUNDLES)('%s translates every text the code passes to t, and nothing else', (_, bundle) => {
    expect(keys.filter((key) => !(key in bundle))).toEqual([]);
    expect(Object.keys(bundle).filter((key) => !keys.includes(key))).toEqual([]);
  });

  it.each(BUNDLES)('%s keeps the placeholders of each text', (_, bundle) => {
    const mismatched = Object.entries(bundle).filter(([key, text]) => placeholders(key).join() !== placeholders(text).join());
    expect(mismatched).toEqual([]);
  });

  it.each(BUNDLES)('%s formats dates in its own language', (lang, bundle) => {
    setLanguage(lang, bundle);
    expect(dateLocale('en-GB')).toBe(lang);
    expect(new Date(2026, 9, 23).toLocaleDateString(dateLocale('en-GB'), { month: 'short' })).not.toBe('Oct');
  });
});
