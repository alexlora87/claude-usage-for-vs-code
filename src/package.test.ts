import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { menuItems } from './controller/menu_items';

const { contributes } = JSON.parse(readFileSync('package.json', 'utf8'));
const properties: Record<string, { order?: number }> = contributes.configuration.properties;

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
      'criticalModal',
      'warningThreshold',
      'criticalThreshold',
      'historyChartSize',
    ]);
  });
});

describe('commands', () => {
  it('declares every command the menu runs, so it is also in the Command Palette', () => {
    const declared = contributes.commands.map((command: { command: string }) => command.command);
    const state = { extended: false, notifications: true, now: 0 };
    const items = [...menuItems(state), ...menuItems({ ...state, mutedUntil: 1 })];
    for (const item of items) {
      expect(declared).toContain(item.command);
    }
  });
});
