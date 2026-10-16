import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Usage, UsageErrorKind } from '../shared/types';

/** State shared by every VS Code window of the same user and account. */
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

type RawWindow = { percent: number; resetsAt?: string };

function reviveWindow(raw?: RawWindow) {
  return raw ? { percent: raw.percent, resetsAt: raw.resetsAt ? new Date(raw.resetsAt) : undefined } : undefined;
}

/** One cache file per account, so different CLAUDE_CONFIG_DIRs never mix. */
export function cacheFile(storageDir: string, configDir: string): string {
  const id = createHash('sha256').update(configDir).digest('hex').slice(0, 12);
  return join(storageDir, `cache-${id}.json`);
}

/**
 * Cache file shared between windows. The last known state is also kept in memory,
 * so throttling and backoff still work when the file cannot be written.
 */
export class SharedCache {
  private memory: CacheData = {};

  constructor(private readonly path: string) {}

  read(): CacheData {
    try {
      const raw = JSON.parse(readFileSync(this.path, 'utf8'));
      if (raw.usage) {
        raw.usage = { session: reviveWindow(raw.usage.session), weekly: reviveWindow(raw.usage.weekly) };
      }
      this.memory = raw;
    } catch {
      // Missing or unreadable file: fall back to the in-memory copy.
    }
    return this.memory;
  }

  write(patch: Partial<CacheData>): void {
    this.memory = { ...this.read(), ...patch };
    try {
      mkdirSync(join(this.path, '..'), { recursive: true, mode: 0o700 });
      const temp = `${this.path}.${randomBytes(6).toString('hex')}.tmp`;
      writeFileSync(temp, JSON.stringify(this.memory), { flag: 'wx', mode: 0o600 });
      renameSync(temp, this.path);
    } catch {
      // Sharing is an optimization; a failed write must not break the extension.
    }
  }
}
