import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Usage } from '../shared/types';
import { accountId } from './shared_cache';

const MINUTE = 60_000;
/** Samples closer than this to the previous one are skipped. */
export const MIN_GAP_MS = 5 * MINUTE;
export const RETENTION_MS = 30 * 24 * 60 * MINUTE;

/** Percent used at one moment; `resetsAt` (ms) tells which window cycle it belongs to. */
export interface Point {
  percent: number;
  resetsAt?: number;
}

export interface Sample {
  /** Time of the reading, ms since epoch. */
  t: number;
  session?: Point;
  weekly?: Point;
  /** Monthly spend: percent of the limit, with the amounts for the projection. */
  spend?: { percent: number; used: number; limit: number };
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function revivePoint(raw: unknown): Point | undefined {
  const point = raw as Partial<Point> | undefined;
  if (!point || !isNumber(point.percent)) {
    return undefined;
  }
  return { percent: point.percent, resetsAt: isNumber(point.resetsAt) ? point.resetsAt : undefined };
}

/** The file may come from another version or be corrupted, so only well-formed samples are kept. */
export function reviveSamples(raw: unknown): Sample[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((item): Sample[] => {
    if (!item || !isNumber(item.t)) {
      return [];
    }
    const { percent, used, limit } = item.spend ?? {};
    return [{
      t: item.t,
      session: revivePoint(item.session),
      weekly: revivePoint(item.weekly),
      spend: [percent, used, limit].every(isNumber) ? { percent, used, limit } : undefined,
    }];
  });
}

/** Adds a reading unless it is too close to the previous one, and drops what is older than the retention. */
export function appendSample(samples: Sample[], usage: Usage, t: number): Sample[] {
  const last = samples[samples.length - 1];
  if (last && t - last.t < MIN_GAP_MS) {
    return samples;
  }
  const point = (w: Usage['session']): Point | undefined => (w ? { percent: w.percent, resetsAt: w.resetsAt?.getTime() } : undefined);
  const sample: Sample = {
    t,
    session: point(usage.session),
    weekly: point(usage.weekly),
    spend: usage.spend && { percent: usage.spend.percent, used: usage.spend.used, limit: usage.spend.limit },
  };
  return [...samples.filter((s) => t - s.t <= RETENTION_MS), sample];
}

/** One history file per account, next to the shared cache. */
export function historyFile(storageDir: string, configDir: string): string {
  return join(storageDir, `history-${accountId(configDir)}.json`);
}

/** Usage readings kept locally for the projection and the history panel. */
export class History {
  constructor(private readonly path: string) {}

  read(): Sample[] {
    try {
      return reviveSamples(JSON.parse(readFileSync(this.path, 'utf8')));
    } catch {
      return [];
    }
  }

  /** Stores the reading and returns all the samples. */
  record(usage: Usage, t: number): Sample[] {
    const before = this.read();
    const after = appendSample(before, usage, t);
    if (after === before) {
      return before;
    }
    const temp = `${this.path}.${randomBytes(6).toString('hex')}.tmp`;
    try {
      mkdirSync(join(this.path, '..'), { recursive: true, mode: 0o700 });
      writeFileSync(temp, JSON.stringify(after), { flag: 'wx', mode: 0o600 });
      renameSync(temp, this.path);
    } catch {
      // The history is a convenience; a failed write must not break the extension.
      try {
        unlinkSync(temp);
      } catch {
        // The temporary file was never created.
      }
    }
    return after;
  }
}
