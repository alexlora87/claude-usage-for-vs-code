import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { iconFor } from './icons';

const contributed = JSON.parse(readFileSync('package.json', 'utf8')).contributes.icons;

describe('iconFor', () => {
  it('rounds to the nearest 5% and pads the step', () => {
    expect(iconFor(0)).toBe('$(claude-usage-ring-00)');
    expect(iconFor(32)).toBe('$(claude-usage-ring-30)');
    expect(iconFor(33)).toBe('$(claude-usage-ring-35)');
    expect(iconFor(100)).toBe('$(claude-usage-ring-100)');
  });

  it('clamps out-of-range values', () => {
    expect(iconFor(-5)).toBe('$(claude-usage-ring-00)');
    expect(iconFor(140)).toBe('$(claude-usage-ring-100)');
  });

  it('only returns glyphs registered in package.json', () => {
    for (let percent = 0; percent <= 100; percent++) {
      const id = iconFor(percent).slice(2, -1);
      expect(contributed[id], id).toBeDefined();
    }
  });
});
