import { Usage, UsageError, UsageErrorKind } from '../shared/types';
import { CacheData } from './shared_cache';

const BACKOFF_BASE_MS = 60_000;
const BACKOFF_MAX_MS = 15 * 60_000;
const MAX_STALE_MS = 30 * 60_000;
const IN_FLIGHT_MS = 30_000;
const FRESH_RATIO = 0.9;

export interface ViewState {
  usage?: Usage;
  /** When `usage` was fetched. */
  fetchedAt?: number;
  /** The shown usage is older than expected because the last request failed. */
  stale: boolean;
  error?: { kind: UsageErrorKind; message: string };
  /** When the next request is allowed, if known. */
  retryAt?: number;
  loading: boolean;
}

export function backoffMs(failures: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, failures - 1));
}

/** Decides what to show: last good data stays visible (stale) for up to 30 minutes after a failure. */
export function deriveState(cache: CacheData, now: number): ViewState {
  const age = cache.fetchedAt === undefined ? Infinity : now - cache.fetchedAt;
  const retryAt = cache.cooldownUntil && cache.cooldownUntil > now ? cache.cooldownUntil : undefined;
  if (!cache.error) {
    return { usage: cache.usage, fetchedAt: cache.fetchedAt, stale: false, loading: !cache.usage };
  }
  if (cache.usage && age <= MAX_STALE_MS) {
    return { usage: cache.usage, fetchedAt: cache.fetchedAt, stale: true, error: cache.error, retryAt, loading: false };
  }
  return { stale: false, error: cache.error, retryAt, loading: false };
}

export function isFresh(cache: CacheData, intervalMs: number, now: number): boolean {
  return !cache.error && cache.fetchedAt !== undefined && now - cache.fetchedAt < intervalMs * FRESH_RATIO;
}

export interface SchedulerDeps {
  readCache(): CacheData;
  writeCache(patch: Partial<CacheData>): void;
  fetchUsage(): Promise<Usage>;
  intervalMs(): number;
  now(): number;
}

/** Fetches at most once per interval across all windows, backing off on errors. */
export class UsageScheduler {
  constructor(private readonly deps: SchedulerDeps) {}

  /** Returns the state to display, fetching first when the shared data is due. */
  async tick(force = false): Promise<ViewState> {
    const { deps } = this;
    const now = deps.now();
    const cache = deps.readCache();
    // A manual refresh may skip the cooldown unless the API asked us to slow down.
    const coolingDown = (cache.cooldownUntil ?? 0) > now && !(force && cache.error?.kind !== 'rate-limited');
    const blocked = coolingDown || (cache.inFlightUntil ?? 0) > now;
    if (blocked || (!force && isFresh(cache, deps.intervalMs(), now))) {
      return deriveState(cache, now);
    }

    deps.writeCache({ inFlightUntil: now + IN_FLIGHT_MS });
    try {
      const usage = await deps.fetchUsage();
      deps.writeCache({ usage, fetchedAt: deps.now(), error: undefined, failures: 0, inFlightUntil: 0, cooldownUntil: 0 });
    } catch (e) {
      const error = e instanceof UsageError ? e : new UsageError('unknown', 'Unexpected error');
      const failures = (cache.failures ?? 0) + 1;
      const wait = error.kind === 'rate-limited' ? Math.max(error.retryAfterMs ?? 0, backoffMs(failures)) : Math.max(deps.intervalMs(), backoffMs(failures));
      deps.writeCache({
        error: { kind: error.kind, message: error.message },
        failures,
        inFlightUntil: 0,
        cooldownUntil: deps.now() + wait,
      });
    }
    return deriveState(deps.readCache(), deps.now());
  }
}
