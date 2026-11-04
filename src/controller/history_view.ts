import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { t } from '@vscode/l10n';
import { Sample } from '../engine/history';
import { renderHistoryHtml, SeriesKey } from './history_html';
import { readChartSize, readOptions } from './settings';

/** The history panel: a page rebuilt when a new reading arrives; its only script reports the weekly cycle chosen. */
export class HistoryView implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  /** The reset time of the weekly cycle on show; 0 is the newest one. */
  private weeklyCycle = 0;

  constructor(private readonly readSamples: () => Sample[]) {}

  show(): void {
    if (this.panel) {
      this.panel.reveal();
      this.render();
      return;
    }
    this.panel = vscode.window.createWebviewPanel('claudeUsage.history', t('Claude Usage History'), vscode.ViewColumn.Active, {
      enableScripts: true,
      localResourceRoots: [],
    });
    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.weeklyCycle = 0;
    });
    this.panel.webview.onDidReceiveMessage((message: { cycle: number }) => {
      this.weeklyCycle = message.cycle;
      this.render();
    });
    // A hidden panel keeps its last page, so it is rebuilt when it becomes visible again.
    this.panel.onDidChangeViewState((e) => {
      if (e.webviewPanel.visible) {
        this.render();
      }
    });
    this.render();
  }

  /** Re-renders only while the panel is visible, so a new reading does not flicker a hidden one. */
  refresh(): void {
    if (this.panel?.visible) {
      this.render();
    }
  }

  private render(): void {
    if (this.panel) {
      const { windows, showSpend } = readOptions();
      const allowed: SeriesKey[] = [];
      if (windows !== 'weekly') {
        allowed.push('session');
      }
      if (windows !== 'session') {
        allowed.push('weekly');
      }
      if (showSpend) {
        allowed.push('spend');
      }
      this.panel.webview.html = renderHistoryHtml(this.readSamples(), Date.now(), randomBytes(16).toString('base64'), allowed, readChartSize(), this.weeklyCycle);
    }
  }

  dispose(): void {
    this.panel?.dispose();
  }
}
