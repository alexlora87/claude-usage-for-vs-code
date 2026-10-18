import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendSample, History, historyFile, MIN_GAP_MS, RETENTION_MS, reviveSamples } from './history';

const usage = {
  session: { percent: 10, resetsAt: new Date(5_000_000) },
  weekly: { percent: 4 },
  spend: { used: 7.29, limit: 800, currency: 'USD', percent: 0.91, limitReached: false },
};

describe('appendSample', () => {
  it('stores the percentages, reset times and spend amounts', () => {
    expect(appendSample([], usage, 1000)).toEqual([
      {
        t: 1000,
        session: { percent: 10, resetsAt: 5_000_000 },
        weekly: { percent: 4, resetsAt: undefined },
        spend: { percent: 0.91, used: 7.29, limit: 800 },
      },
    ]);
  });

  it('skips readings closer than the minimum gap', () => {
    const first = appendSample([], usage, 1000);
    expect(appendSample(first, usage, 1000 + MIN_GAP_MS - 1)).toBe(first);
    expect(appendSample(first, usage, 1000 + MIN_GAP_MS)).toHaveLength(2);
  });

  it('drops samples older than the retention', () => {
    const old = appendSample([], usage, 0);
    const next = appendSample(old, usage, RETENTION_MS + 1);
    expect(next.map((s) => s.t)).toEqual([RETENTION_MS + 1]);
  });
});

describe('reviveSamples', () => {
  it('keeps well-formed samples and ignores the rest', () => {
    const raw = [
      { t: 1, session: { percent: 5, resetsAt: 9 } },
      { t: 'x', session: { percent: 5 } },
      null,
      { t: 2, session: { percent: 'a' }, spend: { percent: 1, used: 1 } },
    ];
    expect(reviveSamples(raw)).toEqual([
      { t: 1, session: { percent: 5, resetsAt: 9 }, weekly: undefined, spend: undefined },
      { t: 2, session: undefined, weekly: undefined, spend: undefined },
    ]);
    expect(reviveSamples('nope')).toEqual([]);
  });
});

describe('History', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'claude-usage-history-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('persists samples between instances', () => {
    const path = historyFile(dir, '/home/a/.claude');
    new History(path).record(usage, 1000);
    new History(path).record(usage, 1000 + MIN_GAP_MS);
    expect(new History(path).read().map((s) => s.t)).toEqual([1000, 1000 + MIN_GAP_MS]);
  });

  it('uses a different file per account', () => {
    expect(historyFile(dir, '/a')).not.toBe(historyFile(dir, '/b'));
  });

  it('reads an empty history when the file is missing or corrupted', () => {
    const path = historyFile(dir, '/a');
    expect(new History(path).read()).toEqual([]);
    writeFileSync(path, '{not json');
    expect(new History(path).read()).toEqual([]);
    new History(path).record(usage, 1);
    expect(new History(path).read()).toHaveLength(1);
  });
});
