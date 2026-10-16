import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Usage, UsageErrorKind } from '../shared/types';

/** State shared by every VS Code window through a single file. */
export interface CacheData {
  usage?: Usage;
  fetchedAt?: number;
  error?: { kind: UsageErrorKind; message: string };
  /** Another window is fetching until this time. */
  inFlightUntil?: number;
  /** No requests are made until this time. */
  cooldownUntil?: number;
  failures?: number;
}

export const DEFAULT_CACHE_PATH = join(tmpdir(), 'claude-usage-vscode', 'cache.json');

type RawWindow = { percent: number; resetsAt?: string };

function reviveWindow(raw?: RawWindow) {
  return raw ? { percent: raw.percent, resetsAt: raw.resetsAt ? new Date(raw.resetsAt) : undefined } : undefined;
}

export function readCache(path = DEFAULT_CACHE_PATH): CacheData {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    if (raw.usage) {
      raw.usage = { session: reviveWindow(raw.usage.session), weekly: reviveWindow(raw.usage.weekly) };
    }
    return raw;
  } catch {
    return {};
  }
}

export function writeCache(patch: Partial<CacheData>, path = DEFAULT_CACHE_PATH): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const temp = `${path}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify({ ...readCache(path), ...patch }));
    renameSync(temp, path);
  } catch {
    // The cache is an optimization; a failed write must not break the extension.
  }
}
