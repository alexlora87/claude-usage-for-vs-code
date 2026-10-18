import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const properties: Record<string, { order?: number }> = JSON.parse(readFileSync('package.json', 'utf8')).contributes.configuration.properties;

describe('settings schema', () => {
  // Without `order`, the Settings editor lists the settings alphabetically.
  it('gives every setting its own position in the Settings editor', () => {
    const orders = Object.values(properties).map((setting) => setting.order);
    expect(orders.every((order) => Number.isInteger(order))).toBe(true);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('lists the settings in the documented order', () => {
    const listed = Object.entries(properties)
      .sort(([, a], [, b]) => a.order! - b.order!)
      .map(([key]) => key.replace('claudeUsage.', ''));
    expect(listed).toEqual([
      'refreshInterval',
      'windows',
      'extendedView',
      'indicator',
      'barSize',
      'showSpend',
      'notifications',
      'warningThreshold',
      'criticalThreshold',
    ]);
  });
});
