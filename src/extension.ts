import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import * as vscode from 'vscode';
import { t } from '@vscode/l10n';
import { computeForecasts, Forecasts } from './controller/forecast';
import { formatSummary, visibleUsage } from './controller/format';
import { claimUnlessMuted, crossings, pruneMarkers } from './controller/notifier';
import { clearMute, muteChoices, muteFile, readMutedUntil, writeMute } from './controller/mute';
import { criticalModalEnabled, notificationsEnabled, readOptions, SETTINGS_KEYS } from './controller/settings';
import { exportFileName, forExport, toCsv, toJson } from './controller/history_export';
import { HistoryView } from './controller/history_view';
import { openSettings, showMenu, toggleExtendedView } from './controller/menu';
import { StatusBar } from './controller/status_bar';
import { configDir, readAccessToken } from './engine/credentials';
import { UsageScheduler } from './engine/scheduler';
import { History, historyFile } from './engine/history';
import { accountId, cacheFile, SharedCache } from './engine/shared_cache';
import { fetchUsage } from './engine/usage_api';
import { dateLocale, setLanguage } from './shared/l10n';
import { Usage } from './shared/types';
import type { ViewState } from './engine/scheduler';

/** Windows poll the shared cache this often; network requests are still limited by refreshInterval. */
const POLL_MS = 10_000;

function refreshIntervalMs(): number {
  const seconds = vscode.workspace.getConfiguration('claudeUsage').get<number>('refreshInterval', 120);
  return Math.min(3600, Math.max(30, seconds)) * 1000;
}

/**
 * Tells once per window cycle and level; windows of VS Code share the markers, so only one of them shows it.
 * While muted nothing is claimed, so what still holds after the mute is told at the next refresh.
 */
function notify(storageDir: string, account: string, usage: Usage, now: number): void {
  if (!notificationsEnabled()) {
    return;
  }
  const options = readOptions();
  const muted = readMutedUntil(muteFile(storageDir, account), now) !== undefined;
  for (const crossing of claimUnlessMuted(storageDir, account, crossings(visibleUsage(usage, options), options.thresholds, now), muted)) {
    const text = `Claude Usage: ${crossing.message}`;
    if (crossing.level !== 'critical') {
      void vscode.window.showWarningMessage(text);
    } else if (criticalModalEnabled()) {
      void showCriticalModal(text);
    } else {
      void vscode.window.showErrorMessage(text);
    }
  }
}

async function showCriticalModal(text: string): Promise<void> {
  const mute: vscode.MessageItem = { title: t('Mute notifications') };
  const close: vscode.MessageItem = { title: t('Close'), isCloseAffordance: true };
  const pick = await vscode.window.showErrorMessage(text, { modal: true }, mute, close);
  if (pick === mute) {
    void vscode.commands.executeCommand('claudeUsage.muteNotifications');
  }
}

async function copySummary(state: ViewState): Promise<void> {
  const summary = state.usage && formatSummary(state.usage, readOptions(), Date.now());
  if (!summary) {
    void vscode.window.showInformationMessage(`Claude Usage: ${t('no current usage to copy.')}`);
    return;
  }
  const asOf = state.stale && state.fetchedAt !== undefined ? ` ${t('(as of {0})', new Date(state.fetchedAt).toLocaleString(dateLocale('en-GB'), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }))}` : '';
  await vscode.env.clipboard.writeText(summary + asOf);
  vscode.window.setStatusBarMessage(`Claude Usage: ${t('summary copied')}`, 3000);
}

/** Saves the readings as CSV or JSON, whichever the chosen file name ends with. */
async function exportHistory(history: History): Promise<void> {
  const options = readOptions();
  const samples = forExport(history.read(), options.showSpend);
  if (!samples.length) {
    void vscode.window.showInformationMessage(`Claude Usage: ${t('no history to export yet.')}`);
    return;
  }
  const now = Date.now();
  const name = `${exportFileName(now)}.csv`;
  // The home folder, so the file is not left inside a repository by accident (in a remote window, that of the remote host).
  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(join(homedir(), name)),
    filters: { CSV: ['csv'], JSON: ['json'] },
    title: t('Export Claude Usage history'),
  });
  if (!uri) {
    return;
  }
  const text = uri.path.toLowerCase().endsWith('.json') ? toJson(samples, now) : toCsv(samples);
  try {
    await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'));
  } catch {
    void vscode.window.showErrorMessage(`Claude Usage: ${t('could not export the history to {0}.', basename(uri.path))}`);
    return;
  }
  const exported = samples.length === 1 ? t('exported 1 reading to {0}.', basename(uri.path)) : t('exported {0} readings to {1}.', samples.length, basename(uri.path));
  void vscode.window.showInformationMessage(`Claude Usage: ${exported}`);
}

export function activate(context: vscode.ExtensionContext): void {
  // VS Code reloads the window when the display language changes, so reading it once is enough.
  setLanguage(vscode.env.language, vscode.l10n.bundle);
  const storageDir = context.globalStorageUri.fsPath;
  const account = accountId(configDir());
  pruneMarkers(storageDir, Date.now());
  const mutePath = muteFile(storageDir, account);
  const mutedUntil = () => (notificationsEnabled() ? readMutedUntil(mutePath, Date.now()) : undefined);
  const statusBar = new StatusBar(mutedUntil);
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
    vscode.commands.registerCommand('claudeUsage.showMenu', () => showMenu(mutedUntil)),
    vscode.commands.registerCommand('claudeUsage.muteNotifications', async () => {
      if (!notificationsEnabled()) {
        void vscode.window.showInformationMessage(`Claude Usage: ${t('notifications are turned off in the settings.')}`);
        return;
      }
      const pick = await vscode.window.showQuickPick(muteChoices(lastState.usage, readOptions(), Date.now()), { title: t('Mute notifications') });
      if (pick && !writeMute(mutePath, pick.until)) {
        void vscode.window.showErrorMessage(`Claude Usage: ${t('could not save the mute.')}`);
      }
      statusBar.render();
    }),
    vscode.commands.registerCommand('claudeUsage.unmuteNotifications', () => {
      if (mutedUntil() === undefined) {
        void vscode.window.showInformationMessage(`Claude Usage: ${t('notifications are not muted.')}`);
        return;
      }
      clearMute(mutePath);
      statusBar.render();
      // What crossed a threshold while muted and still holds is told now.
      if (lastState.usage && !lastState.stale) {
        notify(storageDir, account, lastState.usage, Date.now());
      }
    }),
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
