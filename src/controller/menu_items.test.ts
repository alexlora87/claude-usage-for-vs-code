import { describe, expect, it } from 'vitest';
import { menuItems, scopeOf } from './menu_items';

describe('menuItems', () => {
  it('offers refresh, the view switch, the history and the settings', () => {
    expect(menuItems(false).map((item) => item.command)).toEqual([
      'claudeUsage.refresh',
      'claudeUsage.toggleExtendedView',
      'claudeUsage.showHistory',
      'claudeUsage.openSettings',
    ]);
  });

  it('names the view the switch leads to', () => {
    expect(menuItems(false)[1].label).toContain('extended');
    expect(menuItems(true)[1].label).toContain('compact');
  });
});

describe('scopeOf', () => {
  it('writes to the workspace only when it holds a value', () => {
    expect(scopeOf({ workspaceValue: false })).toBe('workspace');
    expect(scopeOf({ workspaceValue: undefined })).toBe('global');
    expect(scopeOf(undefined)).toBe('global');
  });
});
