import { t } from '@vscode/l10n';
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
      ? [{ label: `$(bell) ${t('Unmute notifications · muted until {0}', formatResetTime(new Date(mutedUntil), now))}`, command: 'claudeUsage.unmuteNotifications' }]
      : [{ label: `$(bell-slash) ${t('Mute notifications…')}`, command: 'claudeUsage.muteNotifications' }];
  return [
    { label: `$(refresh) ${t('Refresh now')}`, command: 'claudeUsage.refresh' },
    { label: extended ? `$(screen-normal) ${t('Switch to compact view')}` : `$(screen-full) ${t('Switch to extended view')}`, command: 'claudeUsage.toggleExtendedView' },
    { label: `$(graph) ${t('Show usage history')}`, command: 'claudeUsage.showHistory' },
    { label: `$(copy) ${t('Copy usage summary')}`, command: 'claudeUsage.copySummary' },
    ...mute,
    { label: `$(gear) ${t('Open settings')}`, command: 'claudeUsage.openSettings' },
  ];
}

export type SettingScope = 'workspace' | 'global';

/** Where a setting is currently set, so a change is written there and a more specific value cannot hide it. */
export function scopeOf(inspected?: { workspaceValue?: unknown }): SettingScope {
  return inspected?.workspaceValue !== undefined ? 'workspace' : 'global';
}
