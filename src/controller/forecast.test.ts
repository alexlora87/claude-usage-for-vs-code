import { describe, expect, it } from 'vitest';
import { Sample } from '../engine/history';
import { computeForecasts, WindowForecast } from './forecast';

const MIN = 60_000;
const HOUR = 60 * MIN;
const now = 100 * HOUR;
const resetsAt = now + 3 * HOUR;

const windowSample = (t: number, percent: number, reset = resetsAt): Sample => ({ t, session: { percent, resetsAt: reset } });
const usageAt = (percent: number, reset = resetsAt) => ({ session: { percent, resetsAt: new Date(reset) } });
const fullAt = (forecast?: WindowForecast) => (forecast && 'fullAt' in forecast ? forecast.fullAt : undefined);
const endPercent = (forecast?: WindowForecast) => (forecast && 'endPercent' in forecast ? forecast.endPercent : undefined);

describe('session forecast', () => {
  // 0.5 % per minute, from 20 % an hour ago to 40 % ten minutes ago, in the cycle that resets at `reset`.
  const steadyFor = (reset: number) => [0, 1, 2, 3, 4].map((i) => windowSample(now - 50 * MIN + i * 10 * MIN, 20 + i * 5, reset));
  const steady = steadyFor(resetsAt);

  it('projects when the 100 % is reached if it happens before the reset', () => {
    // 0.5 %/min and 45 % now: 55 % left -> 110 min.
    const { session } = computeForecasts(steady, usageAt(45), now);
    expect(Math.round((fullAt(session)! - now) / MIN)).toBe(110);
    expect(endPercent(session)).toBeUndefined();
  });

  it('projects the percent at the reset when the window does not fill up first', () => {
    // 45 % + 0.5 %/min x 60 min left = 75 %.
    const { session } = computeForecasts(steadyFor(now + HOUR), usageAt(45, now + HOUR), now);
    expect(endPercent(session)).toBeCloseTo(75, 5);
    expect(fullAt(session)).toBeUndefined();
  });

  it('ends below 100 % when it would fill up just after the reset', () => {
    // 45 % + 0.5 %/min x 109 min = 99.5 %, while it would fill up at 110 min.
    const { session } = computeForecasts(steadyFor(now + 109 * MIN), usageAt(45, now + 109 * MIN), now);
    expect(endPercent(session)).toBeCloseTo(99.5, 5);
  });

  it('says nothing without enough readings or span', () => {
    expect(computeForecasts(steady.slice(-1), usageAt(40), now).session).toBeUndefined();
    const short = [windowSample(now - 6 * MIN, 38), windowSample(now - 3 * MIN, 39)];
    expect(computeForecasts(short, usageAt(40), now).session).toBeUndefined();
  });

  it('keeps the current percent when usage is idle', () => {
    const flat = [0, 1, 2].map((i) => windowSample(now - 50 * MIN + i * 20 * MIN, 40));
    const { session } = computeForecasts(flat, usageAt(40), now);
    expect(endPercent(session)).toBe(40);
  });

  it('says nothing when usage is idle but the readings span too little', () => {
    const brief = [0, 1, 2].map((i) => windowSample(now - 10 * MIN + i * 4 * MIN, 40));
    expect(computeForecasts(brief, usageAt(40), now).session).toBeUndefined();
  });

  it('keeps the current percent when usage falls slightly', () => {
    const falling = [0, 1, 2, 3].map((i) => windowSample(now - 40 * MIN + i * 10 * MIN, 44 - i));
    expect(endPercent(computeForecasts(falling, usageAt(40), now).session)).toBe(40);
  });

  it('ignores readings of a previous cycle and what happened before a reset', () => {
    const previous = [windowSample(now - 55 * MIN, 99, resetsAt - 5 * HOUR), windowSample(now - 45 * MIN, 98, resetsAt - 5 * HOUR)];
    const { session } = computeForecasts([...previous, ...steady], usageAt(45), now);
    expect(Math.round((fullAt(session)! - now) / MIN)).toBe(110);
    const afterDrop = [windowSample(now - 50 * MIN, 90), ...steady.slice(1).map((s) => ({ ...s }))];
    // Only the readings after the drop count: 0.5 %/min from 20 %, so 110 min to fill up.
    expect(Math.round((fullAt(computeForecasts(afterDrop, usageAt(45), now).session)! - now) / MIN)).toBe(110);
  });

  it('tolerates small differences in the reset time of the same cycle', () => {
    const jitter = steady.map((s) => ({ ...s, session: { ...s.session!, resetsAt: resetsAt + 1000 } }));
    expect(computeForecasts(jitter, usageAt(45), now).session).toBeDefined();
  });

  it('says nothing when the window is full, has no reset time, or the reset has passed', () => {
    expect(computeForecasts(steady, usageAt(100), now).session).toBeUndefined();
    expect(computeForecasts(steady, { session: { percent: 40 } }, now).session).toBeUndefined();
    expect(computeForecasts(steadyFor(now - MIN), usageAt(45, now - MIN), now).session).toBeUndefined();
    expect(computeForecasts(steadyFor(now), usageAt(45, now), now).session).toBeUndefined();
  });
});

describe('weekly forecast', () => {
  const weekReset = now + 3 * 24 * HOUR;
  const weeklySample = (t: number, percent: number): Sample => ({ t, weekly: { percent, resetsAt: weekReset } });
  const weeklyUsage = (percent: number) => ({ weekly: { percent, resetsAt: new Date(weekReset) } });

  it('needs 6 hours of readings, even when usage is idle', () => {
    const idle = (hours: number) => [...Array(hours).keys()].map((i) => weeklySample(now - (hours - i) * HOUR, 20));
    expect(computeForecasts(idle(5), weeklyUsage(20), now).weekly).toBeUndefined();
    expect(endPercent(computeForecasts(idle(6), weeklyUsage(20), now).weekly)).toBe(20);
  });

  it('projects the percent at the reset from the pace of the last two days', () => {
    // 0.5 % per hour from 20 %: 23.5 % now after 7 hours, 72 h left -> 59.5 %.
    const samples = [...Array(7).keys()].map((i) => weeklySample(now - (7 - i) * HOUR, 20 + i * 0.5));
    expect(endPercent(computeForecasts(samples, weeklyUsage(23.5), now).weekly)).toBeCloseTo(59.5, 5);
  });
});

describe('spend forecast', () => {
  const day = 24 * HOUR;
  const spendSample = (t: number, used: number): Sample => ({ t, spend: { percent: used / 8, used, limit: 800 } });
  const usage = (used: number) => ({ spend: { used, limit: 800, currency: 'USD', percent: used / 8, limitReached: false } });

  it('projects when the monthly limit is reached', () => {
    // $30 per day, $220 now: $580 left -> 19 days.
    const samples = [0, 1, 2, 3].map((i) => spendSample(now - (4 - i) * day, 100 + i * 30));
    const { spend } = computeForecasts(samples, usage(220), now);
    expect(Math.round((spend! - now) / day)).toBe(19);
  });

  it('says nothing when the limit would be reached after the month ends', () => {
    // $10 per day, $140 now: 66 days.
    const samples = [0, 1, 2, 3].map((i) => spendSample(now - (4 - i) * day, 100 + i * 10));
    expect(computeForecasts(samples, usage(140), now).spend).toBeUndefined();
  });

  it('needs at least a day of history', () => {
    const samples = [spendSample(now - 4 * HOUR, 10), spendSample(now - 2 * HOUR, 12)];
    expect(computeForecasts(samples, usage(14), now).spend).toBeUndefined();
  });

  it('says nothing when the spend does not move', () => {
    const samples = [0, 1, 2, 3].map((i) => spendSample(now - (4 - i) * day, 100));
    expect(computeForecasts(samples, usage(100), now).spend).toBeUndefined();
  });

  it('starts counting after the spend dropped (new month)', () => {
    const samples = [spendSample(now - 5 * day, 700), spendSample(now - 3 * day, 2), spendSample(now - 2 * day, 4), spendSample(now - day, 6)];
    const { spend } = computeForecasts(samples, usage(8), now);
    // $2 per day from $8: $792 left -> 396 days, beyond the month.
    expect(spend).toBeUndefined();
    const fast = [spendSample(now - 5 * day, 700), spendSample(now - 3 * day, 20), spendSample(now - 2 * day, 60), spendSample(now - day, 100)];
    expect(computeForecasts(fast, usage(140), now).spend).toBeDefined();
  });

  it('says nothing once the limit is reached', () => {
    const samples = [spendSample(now - 3 * day, 700), spendSample(now - 2 * day, 750), spendSample(now - day, 790)];
    expect(computeForecasts(samples, { spend: { used: 800, limit: 800, currency: 'USD', percent: 100, limitReached: true } }, now).spend).toBeUndefined();
  });
});
