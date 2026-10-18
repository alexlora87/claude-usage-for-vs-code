import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import * as vscode from 'vscode';
import { computeForecasts, Forecasts } from './controller/forecast';
import { formatSummary, visibleUsage } from './controller/format';
import { claimCrossing, crossings, pruneMarkers } from './controller/notifier';
import { notificationsEnabled, readOptions, SETTINGS_KEYS } from './controller/settings';
import { exportFileName, forExport, toCsv, toJson } from './controller/history_export';
import { HistoryView } from './controller/history_view';
import { openSettings, showMenu, toggleExtendedView } from './controller/menu';
import { StatusBar } from './controller/status_bar';
import { configDir, readAccessToken } from './engine/credentials';
import { UsageScheduler } from './engine/scheduler';
import { History, historyFile } from './engine/history';
import { accountId, cacheFile, SharedCache } from './engine/shared_cache';
import { fetchUsage } from './engine/usage_api';
import { Usage } from './shared/types';
import type { ViewState } from './engine/scheduler';

/** Windows poll the shared cache this often; network requests are still limited by refreshInterval. */
const POLL_MS = 10_000;

function refreshIntervalMs(): number {
  const seconds = vscode.workspace.getConfiguration('claudeUsage').get<number>('refreshInterval', 120);
  return Math.min(3600, Math.max(30, seconds)) * 1000;
}

/** Tells once per window cycle and level; windows of VS Code share the markers, so only one of them shows it. */
function notify(storageDir: string, account: string, usage: Usage, now: number): void {
  if (!notificationsEnabled()) {
    return;
  }
  const options = readOptions();
  for (const crossing of crossings(visibleUsage(usage, options), options.thresholds, now)) {
    if (claimCrossing(storageDir, account, crossing)) {
      const text = `Claude Usage: ${crossing.message}`;
      void (crossing.level === 'critical' ? vscode.window.showErrorMessage(text) : vscode.window.showWarningMessage(text));
    }
  }
}

async function copySummary(state: ViewState): Promise<void> {
  const summary = state.usage && formatSummary(state.usage, readOptions(), Date.now());
  if (!summary) {
    void vscode.window.showInformationMessage('Claude Usage: no usage to copy yet.');
    return;
  }
  const asOf = state.stale && state.fetchedAt !== undefined ? ` (as of ${new Date(state.fetchedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })})` : '';
  await vscode.env.clipboard.writeText(summary + asOf);
  vscode.window.setStatusBarMessage('Claude Usage: summary copied', 3000);
}

/** Saves the readings as CSV or JSON, whichever the chosen file name ends with. */
async function exportHistory(history: History): Promise<void> {
  const options = readOptions();
  const samples = forExport(history.read(), options.showSpend);
  if (!samples.length) {
    void vscode.window.showInformationMessage('Claude Usage: no history to export yet.');
    return;
  }
  const now = Date.now();
  const name = `${exportFileName(now)}.csv`;
  // The workspace folder, not the home folder, so the dialog also opens in a remote window.
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
  const uri = await vscode.window.showSaveDialog({
    defaultUri: folder ? vscode.Uri.joinPath(folder, name) : vscode.Uri.file(join(homedir(), name)),
    filters: { CSV: ['csv'], JSON: ['json'] },
    title: 'Export Claude Usage history',
  });
  if (!uri) {
    return;
  }
  const text = uri.path.toLowerCase().endsWith('.json') ? toJson(samples, now) : toCsv(samples);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'));
  void vscode.window.showInformationMessage(`Claude Usage: exported ${samples.length} readings to ${basename(uri.path)}.`);
}

export function activate(context: vscode.ExtensionContext): void {
  const storageDir = context.globalStorageUri.fsPath;
  const account = accountId(configDir());
  pruneMarkers(storageDir, Date.now());
  const statusBar = new StatusBar();
  const cache = new SharedCache(cacheFile(context.globalStorageUri.fsPath, configDir()));
  const history = new History(historyFile(context.globalStorageUri.fsPath, configDir()));
  const historyView = new HistoryView(() => history.read());
  const scheduler = new UsageScheduler({
    readCache: () => cache.read(),
    writeCache: (patch) => cache.write(patch),
    fetchUsage: async () => fetchUsage(await readAccessToken()),
    intervalMs: refreshIntervalMs,
    now: Date.now,
  });

  let busy = false;
  let forcedWhileBusy = false;
  let recordedAt: number | undefined;
  let forecasts: Forecasts = {};
  let lastState: ViewState = { stale: false, loading: true };
  const tick = async (force = false) => {
    if (busy) {
      // A manual refresh must not be lost: it runs as soon as the current request ends.
      forcedWhileBusy ||= force;
      return;
    }
    busy = true;
    try {
      const state = await scheduler.tick(force);
      // Once per new reading: the history file is read and parsed in full.
      if (state.usage && state.fetchedAt !== undefined && !state.stale && state.fetchedAt !== recordedAt) {
        recordedAt = state.fetchedAt;
        forecasts = computeForecasts(history.record(state.usage, state.fetchedAt), state.usage, state.fetchedAt);
        historyView.refresh();
        notify(storageDir, account, state.usage, Date.now());
      }
      lastState = state;
      statusBar.update(state, forecasts);
    } finally {
      busy = false;
    }
    if (forcedWhileBusy) {
      forcedWhileBusy = false;
      await tick(true);
    }
  };

  const timer = setInterval(() => void tick(), POLL_MS);
  void tick();

  context.subscriptions.push(
    statusBar,
    historyView,
    { dispose: () => clearInterval(timer) },
    vscode.commands.registerCommand('claudeUsage.refresh', () => tick(true)),
    vscode.commands.registerCommand('claudeUsage.showHistory', () => historyView.show()),
    vscode.commands.registerCommand('claudeUsage.showMenu', showMenu),
    vscode.commands.registerCommand('claudeUsage.toggleExtendedView', toggleExtendedView),
    vscode.commands.registerCommand('claudeUsage.exportHistory', () => exportHistory(history)),
    vscode.commands.registerCommand('claudeUsage.copySummary', () => copySummary(lastState)),
    vscode.commands.registerCommand('claudeUsage.openSettings', openSettings),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (SETTINGS_KEYS.some((key) => e.affectsConfiguration(`claudeUsage.${key}`))) {
        statusBar.render();
        historyView.refresh();
      }
    }),
  );
}

export function deactivate(): void {}
