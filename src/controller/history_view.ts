import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { Sample } from '../engine/history';
import { renderHistoryHtml } from './history_html';

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
    this.panel = vscode.window.createWebviewPanel('claudeUsage.history', 'Claude Usage History', vscode.ViewColumn.Active, {
      enableScripts: false,
      localResourceRoots: [],
    });
    this.panel.onDidDispose(() => {
      this.panel = undefined;
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
      this.panel.webview.html = renderHistoryHtml(this.readSamples(), Date.now(), randomBytes(16).toString('base64'));
    }
  }

  dispose(): void {
    this.panel?.dispose();
  }
}
