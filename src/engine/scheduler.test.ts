import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Usage, UsageError } from '../shared/types';
import { backoffMs, deriveState, UsageScheduler } from './scheduler';
import { CacheData, SharedCache } from './shared_cache';

const usage: Usage = { session: { percent: 10, resetsAt: new Date('2026-10-16T23:40:00Z') } };
const MIN = 60_000;

function setup(fetchUsage: () => Promise<Usage>, start = 1_000_000) {
  const path = join(mkdtempSync(join(tmpdir(), 'cu-test-')), 'cache.json');
  const cache = new SharedCache(path);
  const clock = { now: start };
  const scheduler = new UsageScheduler({
    readCache: () => cache.read(),
    writeCache: (patch) => cache.write(patch),
    fetchUsage,
    intervalMs: () => 120_000,
    now: () => clock.now,
  });
  return { scheduler, clock, cache, path };
}

describe('deriveState', () => {
  it('reports when the shown usage was fetched, also while it is stale', () => {
    expect(deriveState({ usage, fetchedAt: 5 * MIN }, 6 * MIN).fetchedAt).toBe(5 * MIN);
    const stale = deriveState({ usage, fetchedAt: 5 * MIN, error: { kind: 'offline', message: 'x' } }, 6 * MIN);
    expect(stale).toMatchObject({ stale: true, fetchedAt: 5 * MIN });
  });
});

describe('backoffMs', () => {
  it('doubles from 60s up to 15 minutes', () => {
    expect([1, 2, 3, 4, 5, 6].map(backoffMs)).toEqual([60_000, 120_000, 240_000, 480_000, 900_000, 900_000]);
  });
});

describe('deriveState', () => {
  it('keeps the last good data as stale for 30 minutes after a failure', () => {
    const cache: CacheData = { usage, fetchedAt: 0, error: { kind: 'rate-limited', message: 'x' }, cooldownUntil: 5 * MIN };
    expect(deriveState(cache, 10 * MIN)).toMatchObject({ usage, stale: true });
    const expired = deriveState(cache, 31 * MIN);
    expect(expired.usage).toBeUndefined();
    expect(expired.error?.kind).toBe('rate-limited');
  });

  it('reports loading when there is no data yet', () => {
    expect(deriveState({}, 0)).toMatchObject({ loading: true, stale: false });
  });
});

describe('UsageScheduler', () => {
  it('fetches once, then reuses fresh shared data', async () => {
    const fetchUsage = vi.fn().mockResolvedValue(usage);
    const { scheduler, clock } = setup(fetchUsage);
    await scheduler.tick();
    clock.now += 60_000;
    const state = await scheduler.tick();
    expect(fetchUsage).toHaveBeenCalledTimes(1);
    expect(state.usage?.session?.percent).toBe(10);
  });

  it('fetches again when the data is older than the interval', async () => {
    const fetchUsage = vi.fn().mockResolvedValue(usage);
    const { scheduler, clock } = setup(fetchUsage);
    await scheduler.tick();
    clock.now += 115_000;
    await scheduler.tick();
    expect(fetchUsage).toHaveBeenCalledTimes(2);
  });

  it('does not fetch while another window has a request in flight', async () => {
    const fetchUsage = vi.fn().mockResolvedValue(usage);
    const { scheduler, clock, cache } = setup(fetchUsage);
    cache.write({ inFlightUntil: clock.now + 10_000 });
    await scheduler.tick();
    expect(fetchUsage).not.toHaveBeenCalled();
  });

  it('backs off after a 429, honoring Retry-After, and keeps stale data', async () => {
    const fetchUsage = vi.fn().mockResolvedValueOnce(usage).mockRejectedValue(new UsageError('rate-limited', 'limited', 5 * MIN));
    const { scheduler, clock } = setup(fetchUsage);
    await scheduler.tick();
    clock.now += 130_000;
    const state = await scheduler.tick();
    expect(state).toMatchObject({ stale: true, error: { kind: 'rate-limited' }, retryAt: clock.now + 5 * MIN });

    clock.now += 4 * MIN;
    await scheduler.tick(true);
    expect(fetchUsage).toHaveBeenCalledTimes(2);

    clock.now += 2 * MIN;
    await scheduler.tick(true);
    expect(fetchUsage).toHaveBeenCalledTimes(3);
  });

  it('clears the error after a successful fetch', async () => {
    const fetchUsage = vi.fn().mockRejectedValueOnce(new UsageError('offline', 'down')).mockResolvedValue(usage);
    const { scheduler, clock } = setup(fetchUsage);
    expect((await scheduler.tick()).error?.kind).toBe('offline');
    clock.now += 10 * MIN;
    const state = await scheduler.tick();
    expect(state.error).toBeUndefined();
    expect(state.usage).toBeDefined();
  });

  it('revives dates read from the cache file', async () => {
    const { scheduler, path } = setup(vi.fn().mockResolvedValue(usage));
    await scheduler.tick();
    expect(new SharedCache(path).read().usage?.session?.resetsAt).toBeInstanceOf(Date);
  });

  it('lets a manual refresh skip the cooldown after a sign-in error, but not after a 429', async () => {
    const fetchUsage = vi.fn()
      .mockRejectedValueOnce(new UsageError('no-credentials', 'none'))
      .mockRejectedValueOnce(new UsageError('rate-limited', 'limited'))
      .mockResolvedValue(usage);
    const { scheduler, clock } = setup(fetchUsage);
    await scheduler.tick();
    clock.now += 1000;
    await scheduler.tick(true);
    expect(fetchUsage).toHaveBeenCalledTimes(2);
    clock.now += 1000;
    await scheduler.tick(true);
    expect(fetchUsage).toHaveBeenCalledTimes(2);
  });

  it('keeps throttling in memory when the cache file cannot be written', async () => {
    const fetchUsage = vi.fn().mockResolvedValue(usage);
    const dir = mkdtempSync(join(tmpdir(), 'cu-test-'));
    const blocker = join(dir, 'file');
    writeFileSync(blocker, '');
    const cache = new SharedCache(join(blocker, 'cache.json'));
    const scheduler = new UsageScheduler({
      readCache: () => cache.read(),
      writeCache: (patch) => cache.write(patch),
      fetchUsage,
      intervalMs: () => 120_000,
      now: () => 1_000_000,
    });
    await scheduler.tick();
    await scheduler.tick();
    expect(fetchUsage).toHaveBeenCalledTimes(1);
  });
});
