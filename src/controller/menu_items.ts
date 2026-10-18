export interface MenuItem {
  label: string;
  command: string;
}

export function menuItems(extended: boolean): MenuItem[] {
  return [
    { label: '$(refresh) Refresh now', command: 'claudeUsage.refresh' },
    { label: extended ? '$(screen-normal) Switch to compact view' : '$(screen-full) Switch to extended view', command: 'claudeUsage.toggleExtendedView' },
    { label: '$(graph) Show usage history', command: 'claudeUsage.showHistory' },
    { label: '$(copy) Copy usage summary', command: 'claudeUsage.copySummary' },
    { label: '$(gear) Open settings', command: 'claudeUsage.openSettings' },
  ];
}

export type SettingScope = 'workspace' | 'global';

/** Where a setting is currently set, so a change is written there and a more specific value cannot hide it. */
export function scopeOf(inspected?: { workspaceValue?: unknown }): SettingScope {
  return inspected?.workspaceValue !== undefined ? 'workspace' : 'global';
}
