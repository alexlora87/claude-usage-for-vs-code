import * as vscode from 'vscode';
import { StatusBar } from './controller/status_bar';
import { configDir, readAccessToken } from './engine/credentials';
import { UsageScheduler } from './engine/scheduler';
import { History, historyFile } from './engine/history';
import { cacheFile, SharedCache } from './engine/shared_cache';
import { fetchUsage } from './engine/usage_api';

/** Windows poll the shared cache this often; network requests are still limited by refreshInterval. */
const POLL_MS = 10_000;

function refreshIntervalMs(): number {
  const seconds = vscode.workspace.getConfiguration('claudeUsage').get<number>('refreshInterval', 120);
  return Math.min(3600, Math.max(30, seconds)) * 1000;
}

export function activate(context: vscode.ExtensionContext): void {
  const statusBar = new StatusBar();
  const cache = new SharedCache(cacheFile(context.globalStorageUri.fsPath, configDir()));
  const history = new History(historyFile(context.globalStorageUri.fsPath, configDir()));
  const scheduler = new UsageScheduler({
    readCache: () => cache.read(),
    writeCache: (patch) => cache.write(patch),
    fetchUsage: async () => fetchUsage(await readAccessToken()),
    intervalMs: refreshIntervalMs,
    now: Date.now,
  });

  let busy = false;
  const tick = async (force = false) => {
    if (busy) {
      return;
    }
    busy = true;
    try {
      const state = await scheduler.tick(force);
      if (state.usage && state.fetchedAt !== undefined && !state.stale) {
        history.record(state.usage, state.fetchedAt);
      }
      statusBar.update(state);
    } finally {
      busy = false;
    }
  };

  const timer = setInterval(() => void tick(), POLL_MS);
  void tick();

  context.subscriptions.push(
    statusBar,
    { dispose: () => clearInterval(timer) },
    vscode.commands.registerCommand('claudeUsage.refresh', () => tick(true)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (['extendedView', 'showSpend', 'windows', 'warningThreshold', 'criticalThreshold'].some((key) => e.affectsConfiguration(`claudeUsage.${key}`))) {
        statusBar.render();
      }
    }),
  );
}

export function deactivate(): void {}
