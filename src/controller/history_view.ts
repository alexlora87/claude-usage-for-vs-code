import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { t } from '@vscode/l10n';
import { Sample } from '../engine/history';
import { renderHistoryHtml, SeriesKey } from './history_html';
import { readChartSize, readOptions } from './settings';

/** The history panel: a static page without scripts, rebuilt when a new reading arrives. */
export class HistoryView implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;

  constructor(private readonly readSamples: () => Sample[]) {}

  show(): void {
    if (this.panel) {
      this.panel.reveal();
      this.render();
      return;
    }
    this.panel = vscode.window.createWebviewPanel('claudeUsage.history', t('Claude Usage History'), vscode.ViewColumn.Active, {
      enableScripts: false,
      localResourceRoots: [],
    });
    this.panel.onDidDispose(() => {
      this.panel = undefined;
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
      this.panel.webview.html = renderHistoryHtml(this.readSamples(), Date.now(), randomBytes(16).toString('base64'), allowed, readChartSize());
    }
  }

  dispose(): void {
    this.panel?.dispose();
  }
}
