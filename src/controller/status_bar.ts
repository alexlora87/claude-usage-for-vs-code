import * as vscode from 'vscode';
import { ViewState } from '../engine/scheduler';
import { Forecasts } from './forecast';
import { buildView, Level } from './format';
import { iconFor } from './icons';
import { readOptions } from './settings';

const BACKGROUNDS: Record<Level, vscode.ThemeColor | undefined> = {
  ok: undefined,
  warning: new vscode.ThemeColor('statusBarItem.warningBackground'),
  critical: new vscode.ThemeColor('statusBarItem.errorBackground'),
};

export class StatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  private state: ViewState = { stale: false, loading: true };
  private forecasts: Forecasts = {};

  constructor() {
    this.item.command = 'claudeUsage.refresh';
    this.render();
    this.item.show();
  }

  update(state: ViewState, forecasts: Forecasts): void {
    this.state = state;
    this.forecasts = forecasts;
    this.render();
  }

  /** Re-renders with the last state, e.g. after the extendedView setting changes. */
  render(): void {
    const view = buildView(this.state, readOptions(this.forecasts), iconFor, Date.now());
    this.item.text = view.text;
    this.item.tooltip = view.tooltip ? new vscode.MarkdownString(view.tooltip) : undefined;
    this.item.backgroundColor = BACKGROUNDS[view.level];
  }

  dispose(): void {
    this.item.dispose();
  }
}
