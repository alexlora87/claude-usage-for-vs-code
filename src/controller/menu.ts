import * as vscode from 'vscode';
import { menuItems, scopeOf, SettingScope } from './menu_items';
import { notificationsEnabled } from './settings';

const TARGETS: Record<SettingScope, vscode.ConfigurationTarget> = {
  workspace: vscode.ConfigurationTarget.Workspace,
  global: vscode.ConfigurationTarget.Global,
};

const config = () => vscode.workspace.getConfiguration('claudeUsage');

export async function showMenu(mutedUntil: () => number | undefined): Promise<void> {
  const state = { extended: config().get<boolean>('extendedView', false), notifications: notificationsEnabled(), mutedUntil: mutedUntil(), now: Date.now() };
  const pick = await vscode.window.showQuickPick(menuItems(state), { title: 'Claude Usage' });
  if (pick) {
    await vscode.commands.executeCommand(pick.command);
  }
}

export async function toggleExtendedView(): Promise<void> {
  const setting = config();
  await setting.update('extendedView', !setting.get<boolean>('extendedView', false), TARGETS[scopeOf(setting.inspect<boolean>('extendedView'))]);
}

export async function openSettings(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:alexlora87.claude-usage-vscode');
}
