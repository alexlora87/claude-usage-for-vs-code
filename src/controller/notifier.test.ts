import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from './format';
import { claim, claimCrossing, claimUnlessMuted, crossings, markerName, pruneMarkers } from './notifier';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const now = new Date(2026, 9, 16, 12, 0).getTime();
const spend = { used: 600, limit: 800, currency: 'USD', percent: 75, limitReached: false };

describe('crossings', () => {
  it('lists nothing below the warning threshold', () => {
    expect(crossings({ session: { percent: 69 }, weekly: { percent: 10 } }, DEFAULT_THRESHOLDS, now)).toEqual([]);
  });

  it('reports only the highest level reached by each window', () => {
    const usage = {
      session: { percent: 95.4, resetsAt: new Date(now + 40 * MIN) },
      weekly: { percent: 72, resetsAt: new Date(now + 2 * DAY) },
    };
    const result = crossings(usage, DEFAULT_THRESHOLDS, now);
    expect(result.map((c) => [c.window, c.level])).toEqual([['session', 'critical'], ['weekly', 'warning']]);
    expect(result[0].message).toBe('Your 5-hour session is at 95%. Resets in 0h 40m.');
    expect(result[1].message).toBe('Your 7-day window is at 72%. Resets in 2d 0h.');
  });

  it('keys the monthly spend by UTC month, whatever the time zone', () => {
    const key = (t: number) => crossings({ spend }, DEFAULT_THRESHOLDS, t)[0].cycleKey;
    expect(key(Date.UTC(2026, 9, 31, 23, 30))).toBe('2026-10');
    expect(key(Date.UTC(2026, 10, 1, 0, 30))).toBe('2026-11');
  });

  it('skips a cycle that already ended', () => {
    expect(crossings({ session: { percent: 95, resetsAt: new Date(now - MIN) } }, DEFAULT_THRESHOLDS, now)).toEqual([]);
  });

  it('uses the custom thresholds', () => {
    expect(crossings({ session: { percent: 55 } }, { warning: 50, critical: 80 }, now)).toHaveLength(1);
  });

  it('gives the same cycle key for the same reset time and a new one after the reset', () => {
    const at = (offset: number) => crossings({ session: { percent: 80, resetsAt: new Date(now + offset) } }, DEFAULT_THRESHOLDS, now)[0].cycleKey;
    expect(at(40 * MIN + 400)).toBe(at(40 * MIN));
    expect(at(5 * 60 * MIN)).not.toBe(at(40 * MIN));
  });

  it('reports the monthly spend, and a reached limit as critical whatever the percent', () => {
    expect(crossings({ spend }, DEFAULT_THRESHOLDS, now)[0].message).toBe('Monthly credits at 75% ($600.00 of $800.00).');
    const reached = crossings({ spend: { ...spend, percent: 50, limitReached: true } }, DEFAULT_THRESHOLDS, now)[0];
    expect(reached.level).toBe('critical');
    expect(reached.message).toBe('Monthly credits limit reached ($600.00 of $800.00).');
  });
});

describe('markers', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'claude-usage-notified-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const [crossing] = crossings({ session: { percent: 80, resetsAt: new Date(now + MIN) } }, DEFAULT_THRESHOLDS, now);

  it('shows nothing and claims nothing while muted, then shows it once the mute is over', () => {
    expect(claimUnlessMuted(dir, 'abc', [crossing], true)).toEqual([]);
    expect(existsSync(join(dir, markerName('abc', crossing)))).toBe(false);
    expect(claimUnlessMuted(dir, 'abc', [crossing], false)).toEqual([crossing]);
    expect(claimUnlessMuted(dir, 'abc', [crossing], false)).toEqual([]);
  });

  it('lets only the first claim through', () => {
    const name = markerName('abc', crossing);
    expect(claim(dir, name)).toBe(true);
    expect(claim(dir, name)).toBe(false);
  });

  it('keeps one marker per level', () => {
    const critical = { ...crossing, level: 'critical' as const };
    expect(claim(dir, markerName('abc', crossing))).toBe(true);
    expect(claim(dir, markerName('abc', critical))).toBe(true);
  });

  it('treats reset times within 2 minutes as the same cycle', () => {
    const at = (ms: number) => crossings({ session: { percent: 80, resetsAt: new Date(now + ms) } }, DEFAULT_THRESHOLDS, now)[0];
    expect(claimCrossing(dir, 'abc', at(40 * MIN + 29_900))).toBe(true);
    expect(claimCrossing(dir, 'abc', at(40 * MIN + 30_100))).toBe(false);
    expect(claimCrossing(dir, 'abc', at(40 * MIN + 2 * MIN))).toBe(false);
    expect(claimCrossing(dir, 'abc', at(5 * 60 * MIN))).toBe(true);
    expect(claimCrossing(dir, 'other', at(40 * MIN))).toBe(true);
  });

  it('claims the monthly spend once, and keeps its marker for a whole month', () => {
    const [monthly] = crossings({ spend }, DEFAULT_THRESHOLDS, now);
    expect(claimCrossing(dir, 'abc', monthly)).toBe(true);
    expect(claimCrossing(dir, 'abc', monthly)).toBe(false);
    const marker = join(dir, markerName('abc', monthly));
    const old = new Date(now - 20 * DAY);
    utimesSync(marker, old, old);
    pruneMarkers(dir, now);
    expect(existsSync(marker)).toBe(true);
  });

  it('does not claim when the marker cannot be written', () => {
    writeFileSync(join(dir, 'file'), '');
    expect(claim(join(dir, 'file'), 'notified-x')).toBe(false);
  });

  it('removes only old markers', () => {
    claim(dir, 'notified-old');
    claim(dir, 'notified-new');
    writeFileSync(join(dir, 'cache-abc.json'), '{}');
    const old = new Date(now - 33 * DAY);
    utimesSync(join(dir, 'notified-old'), old, old);
    utimesSync(join(dir, 'cache-abc.json'), old, old);
    pruneMarkers(dir, now);
    expect(existsSync(join(dir, 'notified-old'))).toBe(false);
    expect(existsSync(join(dir, 'notified-new'))).toBe(true);
    expect(existsSync(join(dir, 'cache-abc.json'))).toBe(true);
  });
});
