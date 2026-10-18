import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IconStyle, iconFor, iconStyleFrom } from './icons';

const contributed = JSON.parse(readFileSync('package.json', 'utf8')).contributes.icons;
const STYLES: IconStyle[] = ['ring', 'bar-small', 'bar-medium', 'bar-big'];

describe('iconFor', () => {
  it('rounds to the nearest 5% and pads the step', () => {
    expect(iconFor(0, 'ring')).toBe('$(claude-usage-ring-00)');
    expect(iconFor(32, 'ring')).toBe('$(claude-usage-ring-30)');
    expect(iconFor(33, 'ring')).toBe('$(claude-usage-ring-35)');
    expect(iconFor(100, 'ring')).toBe('$(claude-usage-ring-100)');
  });

  it('draws the bar in the same steps, in each length', () => {
    expect(iconFor(0, 'bar-small')).toBe('$(claude-usage-bar-small-00)');
    expect(iconFor(32, 'bar-medium')).toBe('$(claude-usage-bar-medium-30)');
    expect(iconFor(100, 'bar-big')).toBe('$(claude-usage-bar-big-100)');
  });

  it('clamps out-of-range values', () => {
    expect(iconFor(-5, 'ring')).toBe('$(claude-usage-ring-00)');
    expect(iconFor(140, 'bar-small')).toBe('$(claude-usage-bar-small-100)');
  });

  it('only returns glyphs registered in package.json', () => {
    for (const style of STYLES) {
      for (let percent = 0; percent <= 100; percent++) {
        const id = iconFor(percent, style).slice(2, -1);
        expect(contributed[id], id).toBeDefined();
      }
    }
  });

  it('registers 105 glyphs, each with its own character', () => {
    const characters = Object.values<{ default: { fontCharacter: string } }>(contributed).map((icon) => icon.default.fontCharacter);
    expect(characters).toHaveLength(105);
    expect(new Set(characters).size).toBe(105);
  });

  it('registers every glyph in one font file that exists', () => {
    const fonts = new Set(Object.values<{ default: { fontPath: string } }>(contributed).map((icon) => icon.default.fontPath));
    expect(fonts.size).toBe(1);
    expect(existsSync([...fonts][0])).toBe(true);
  });
});

describe('iconStyleFrom', () => {
  it('uses the ring unless the indicator is the bar, whatever the bar size', () => {
    expect(iconStyleFrom('ring', 'big')).toBe('ring');
    expect(iconStyleFrom('foo', 'big')).toBe('ring');
  });

  it('picks the bar of the chosen size', () => {
    expect(iconStyleFrom('bar', 'small')).toBe('bar-small');
    expect(iconStyleFrom('bar', 'medium')).toBe('bar-medium');
    expect(iconStyleFrom('bar', 'big')).toBe('bar-big');
  });

  it('falls back to the small bar for an unknown size', () => {
    expect(iconStyleFrom('bar', 'xyz')).toBe('bar-small');
    expect(iconStyleFrom('bar', '')).toBe('bar-small');
  });
});
