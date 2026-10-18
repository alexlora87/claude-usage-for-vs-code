import { formatResetTime } from './format';

export interface MenuItem {
  label: string;
  command: string;
}

export interface MenuState {
  extended: boolean;
  /** The `notifications` setting: with it off there is nothing to mute. */
  notifications: boolean;
  /** When the mute ends, if notifications are muted. */
  mutedUntil?: number;
  now: number;
}

export function menuItems({ extended, notifications, mutedUntil, now }: MenuState): MenuItem[] {
  const mute: MenuItem[] = !notifications
    ? []
    : mutedUntil !== undefined
      ? [{ label: `$(bell) Unmute notifications · muted until ${formatResetTime(new Date(mutedUntil), now)}`, command: 'claudeUsage.unmuteNotifications' }]
      : [{ label: '$(bell-slash) Mute notifications…', command: 'claudeUsage.muteNotifications' }];
  return [
    { label: '$(refresh) Refresh now', command: 'claudeUsage.refresh' },
    { label: extended ? '$(screen-normal) Switch to compact view' : '$(screen-full) Switch to extended view', command: 'claudeUsage.toggleExtendedView' },
    { label: '$(graph) Show usage history', command: 'claudeUsage.showHistory' },
    { label: '$(copy) Copy usage summary', command: 'claudeUsage.copySummary' },
    ...mute,
    { label: '$(gear) Open settings', command: 'claudeUsage.openSettings' },
  ];
}

export type SettingScope = 'workspace' | 'global';

/** Where a setting is currently set, so a change is written there and a more specific value cannot hide it. */
export function scopeOf(inspected?: { workspaceValue?: unknown }): SettingScope {
  return inspected?.workspaceValue !== undefined ? 'workspace' : 'global';
}
