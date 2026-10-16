import * as vscode from 'vscode';
import { ViewState } from '../engine/scheduler';
import { buildView, Level } from './format';
import { iconFor } from './icons';

const BACKGROUNDS: Record<Level, vscode.ThemeColor | undefined> = {
  ok: undefined,
  warning: new vscode.ThemeColor('statusBarItem.warningBackground'),
  critical: new vscode.ThemeColor('statusBarItem.errorBackground'),
};

export class StatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  private state: ViewState = { stale: false, loading: true };

  constructor() {
    this.item.command = 'claudeUsage.refresh';
    this.render();
    this.item.show();
  }

  update(state: ViewState): void {
    this.state = state;
    this.render();
  }

  /** Re-renders with the last state, e.g. after the extendedView setting changes. */
  render(): void {
    const extended = vscode.workspace.getConfiguration('claudeUsage').get<boolean>('extendedView', false);
    const view = buildView(this.state, extended, iconFor, Date.now());
    this.item.text = view.text;
    this.item.tooltip = view.tooltip;
    this.item.backgroundColor = BACKGROUNDS[view.level];
  }

  dispose(): void {
    this.item.dispose();
  }
}
