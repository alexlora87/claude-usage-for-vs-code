import * as vscode from 'vscode';
import { computeForecasts, Forecasts } from './controller/forecast';
import { visibleUsage } from './controller/format';
import { claimCrossing, crossings, pruneMarkers } from './controller/notifier';
import { notificationsEnabled, readOptions, SETTINGS_KEYS } from './controller/settings';
import { HistoryView } from './controller/history_view';
import { openSettings, showMenu, toggleExtendedView } from './controller/menu';
import { StatusBar } from './controller/status_bar';
import { configDir, readAccessToken } from './engine/credentials';
import { UsageScheduler } from './engine/scheduler';
import { History, historyFile } from './engine/history';
import { accountId, cacheFile, SharedCache } from './engine/shared_cache';
import { fetchUsage } from './engine/usage_api';
import { Usage } from './shared/types';

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
      const show = crossing.level === 'critical' ? vscode.window.showErrorMessage : vscode.window.showWarningMessage;
      void show(`Claude Usage: ${crossing.message}`);
    }
  }
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
  let recordedAt: number | undefined;
  let forecasts: Forecasts = {};
  const tick = async (force = false) => {
    if (busy) {
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
      statusBar.update(state, forecasts);
    } finally {
      busy = false;
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
