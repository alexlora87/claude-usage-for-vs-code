import { describe, expect, it } from 'vitest';
import { Sample } from '../engine/history';
import { computeForecasts } from './forecast';

const MIN = 60_000;
const HOUR = 60 * MIN;
const now = 100 * HOUR;
const resetsAt = now + 3 * HOUR;

const windowSample = (t: number, percent: number, reset = resetsAt): Sample => ({ t, session: { percent, resetsAt: reset } });
const usageAt = (percent: number, reset = resetsAt) => ({ session: { percent, resetsAt: new Date(reset) } });

describe('session forecast', () => {
  const steady = [0, 1, 2, 3, 4].map((i) => windowSample(now - 50 * MIN + i * 10 * MIN, 20 + i * 5));

  it('projects when the 100 % is reached if it happens before the reset', () => {
    // 0.5 %/min and 45 % now: 55 % left -> 110 min.
    const { session } = computeForecasts(steady, usageAt(45), now);
    expect(Math.round((session! - now) / MIN)).toBe(110);
  });

  it('says nothing when the reset comes first', () => {
    expect(computeForecasts(steady, usageAt(45, now + HOUR), now).session).toBeUndefined();
  });

  it('says nothing without enough readings, span or movement', () => {
    expect(computeForecasts(steady.slice(-1), usageAt(40), now).session).toBeUndefined();
    const flat = [0, 1, 2].map((i) => windowSample(now - 50 * MIN + i * 20 * MIN, 40));
    expect(computeForecasts(flat, usageAt(40), now).session).toBeUndefined();
    const short = [windowSample(now - 6 * MIN, 38), windowSample(now - 3 * MIN, 39)];
    expect(computeForecasts(short, usageAt(40), now).session).toBeUndefined();
  });

  it('ignores readings of a previous cycle and what happened before a reset', () => {
    const previous = [windowSample(now - 55 * MIN, 99, resetsAt - 5 * HOUR), windowSample(now - 45 * MIN, 98, resetsAt - 5 * HOUR)];
    const { session } = computeForecasts([...previous, ...steady], usageAt(45), now);
    expect(Math.round((session! - now) / MIN)).toBe(110);
    const afterDrop = [windowSample(now - 50 * MIN, 90), ...steady.slice(1).map((s) => ({ ...s }))];
    expect(computeForecasts(afterDrop, usageAt(45), now).session).toBeDefined();
  });

  it('tolerates small differences in the reset time of the same cycle', () => {
    const jitter = steady.map((s) => ({ ...s, session: { ...s.session!, resetsAt: resetsAt + 1000 } }));
    expect(computeForecasts(jitter, usageAt(45), now).session).toBeDefined();
  });

  it('says nothing when usage is not growing, is full, or has no reset time', () => {
    const falling = [0, 1, 2, 3].map((i) => windowSample(now - 40 * MIN + i * 10 * MIN, 44 - i));
    expect(computeForecasts(falling, usageAt(40), now).session).toBeUndefined();
    expect(computeForecasts(steady, usageAt(100), now).session).toBeUndefined();
    expect(computeForecasts(steady, { session: { percent: 40 } }, now).session).toBeUndefined();
  });
});

describe('spend forecast', () => {
  const day = 24 * HOUR;
  const spendSample = (t: number, used: number): Sample => ({ t, spend: { percent: used / 8, used, limit: 800 } });
  const usage = (used: number) => ({ spend: { used, limit: 800, currency: 'USD', percent: used / 8, limitReached: false } });

  it('projects when the monthly limit is reached', () => {
    // $10 per day, $140 now: $660 left -> 66 days.
    const samples = [0, 1, 2, 3].map((i) => spendSample(now - (4 - i) * day, 100 + i * 10));
    const { spend } = computeForecasts(samples, usage(140), now);
    expect(Math.round((spend! - now) / day)).toBe(66);
  });

  it('needs at least a day of history', () => {
    const samples = [spendSample(now - 4 * HOUR, 10), spendSample(now - 2 * HOUR, 12)];
    expect(computeForecasts(samples, usage(14), now).spend).toBeUndefined();
  });

  it('starts counting after the spend dropped (new month)', () => {
    const samples = [spendSample(now - 5 * day, 700), spendSample(now - 3 * day, 2), spendSample(now - 2 * day, 4), spendSample(now - day, 6)];
    const { spend } = computeForecasts(samples, usage(8), now);
    // $2 per day from $8: $792 left -> 396 days, beyond the 90-day cap.
    expect(spend).toBeUndefined();
    const fast = [spendSample(now - 5 * day, 700), spendSample(now - 3 * day, 20), spendSample(now - 2 * day, 60), spendSample(now - day, 100)];
    expect(computeForecasts(fast, usage(140), now).spend).toBeDefined();
  });

  it('says nothing once the limit is reached', () => {
    const samples = [spendSample(now - 3 * day, 700), spendSample(now - 2 * day, 750), spendSample(now - day, 790)];
    expect(computeForecasts(samples, { spend: { used: 800, limit: 800, currency: 'USD', percent: 100, limitReached: true } }, now).spend).toBeUndefined();
  });
});
