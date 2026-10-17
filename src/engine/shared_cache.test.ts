import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SharedCache } from './shared_cache';

const spend = { used: 7.29, limit: 800, currency: 'USD', percent: 0.91, limitReached: false };

function cachePath(): string {
  return join(mkdtempSync(join(tmpdir(), 'cu-cache-')), 'cache.json');
}

describe('SharedCache', () => {
  it('keeps the spend and the window dates through the file', () => {
    const path = cachePath();
    new SharedCache(path).write({ usage: { session: { percent: 5, resetsAt: new Date('2026-10-16T23:40:00Z') }, spend } });
    const usage = new SharedCache(path).read().usage;
    expect(usage?.spend).toEqual(spend);
    expect(usage?.session?.resetsAt).toBeInstanceOf(Date);
  });

  it('drops a malformed spend instead of failing later', () => {
    const path = cachePath();
    writeFileSync(path, JSON.stringify({ usage: { spend: { used: 1, limit: 2 } } }));
    expect(new SharedCache(path).read().usage?.spend).toBeUndefined();
  });
});
