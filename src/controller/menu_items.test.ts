import { describe, expect, it } from 'vitest';
import { menuItems, scopeOf } from './menu_items';

describe('menuItems', () => {
  const now = new Date(2026, 9, 16, 12, 0).getTime();
  const state = { extended: false, notifications: true, now };

  it('offers refresh, the view switch, the history, the summary, the mute and the settings', () => {
    expect(menuItems(state).map((item) => item.command)).toEqual([
      'claudeUsage.refresh',
      'claudeUsage.toggleExtendedView',
      'claudeUsage.showHistory',
      'claudeUsage.copySummary',
      'claudeUsage.muteNotifications',
      'claudeUsage.openSettings',
    ]);
  });

  it('names the view the switch leads to', () => {
    expect(menuItems(state)[1].label).toContain('extended');
    expect(menuItems({ ...state, extended: true })[1].label).toContain('compact');
  });

  it('offers to unmute, and says until when, while the notifications are muted', () => {
    const items = menuItems({ ...state, mutedUntil: new Date(2026, 9, 16, 18, 45).getTime() });
    expect(items.map((item) => item.command)).toContain('claudeUsage.unmuteNotifications');
    expect(items.map((item) => item.command)).not.toContain('claudeUsage.muteNotifications');
    expect(items.find((item) => item.command === 'claudeUsage.unmuteNotifications')!.label).toContain('muted until today at 18:45');
  });

  it('offers neither when the notifications are off', () => {
    const commands = menuItems({ ...state, notifications: false, mutedUntil: now + 1000 }).map((item) => item.command);
    expect(commands).not.toContain('claudeUsage.muteNotifications');
    expect(commands).not.toContain('claudeUsage.unmuteNotifications');
  });
});

describe('scopeOf', () => {
  it('writes to the workspace only when it holds a value', () => {
    expect(scopeOf({ workspaceValue: false })).toBe('workspace');
    expect(scopeOf({ workspaceValue: undefined })).toBe('global');
    expect(scopeOf(undefined)).toBe('global');
  });
});
