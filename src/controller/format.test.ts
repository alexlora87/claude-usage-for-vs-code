import { describe, expect, it } from 'vitest';
import { buildView, DEFAULT_THRESHOLDS, formatMoney, formatRemaining, formatResetTime, formatTooltip, formatWindow, levelFor, thresholdsFrom, worstLevel } from './format';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('levelFor', () => {
  it('applies the 70 and 90 thresholds', () => {
    expect(levelFor(69.9)).toBe('ok');
    expect(levelFor(70)).toBe('warning');
    expect(levelFor(89)).toBe('warning');
    expect(levelFor(90)).toBe('critical');
  });

  it('applies custom thresholds', () => {
    const thresholds = { warning: 50, critical: 80 };
    expect(levelFor(49, thresholds)).toBe('ok');
    expect(levelFor(50, thresholds)).toBe('warning');
    expect(levelFor(80, thresholds)).toBe('critical');
    expect(worstLevel({ session: { percent: 60 } }, thresholds)).toBe('warning');
  });

  it('falls back to the defaults when the thresholds are not ordered', () => {
    expect(thresholdsFrom(50, 80)).toEqual({ warning: 50, critical: 80 });
    expect(thresholdsFrom(90, 70)).toEqual(DEFAULT_THRESHOLDS);
    expect(thresholdsFrom(70, 70)).toEqual(DEFAULT_THRESHOLDS);
    expect(thresholdsFrom(0, 90)).toEqual(DEFAULT_THRESHOLDS);
    expect(thresholdsFrom(70, 101)).toEqual(DEFAULT_THRESHOLDS);
  });

  it('uses the worst available window', () => {
    expect(worstLevel({ session: { percent: 10 }, weekly: { percent: 95 } })).toBe('critical');
    expect(worstLevel({})).toBe('ok');
  });
});

describe('formatRemaining', () => {
  it('formats the short window as hours and minutes', () => {
    expect(formatRemaining(7 * MIN)).toBe('0h 7m');
    expect(formatRemaining(2 * HOUR + 30 * MIN)).toBe('2h 30m');
  });

  it('formats the long window as days and hours', () => {
    expect(formatRemaining(6 * DAY + 21 * HOUR + 5 * MIN, true)).toBe('6d 21h');
  });

  it('shows only minutes under one hour in the long window', () => {
    expect(formatRemaining(42 * MIN, true)).toBe('42m');
  });

  it('shows hours and minutes between one hour and one day in the long window', () => {
    expect(formatRemaining(5 * HOUR + 10 * MIN, true)).toBe('5h 10m');
  });

  it('clamps negative values to zero', () => {
    expect(formatRemaining(-5 * MIN)).toBe('0h 0m');
  });
});

describe('formatWindow', () => {
  const now = 0;
  const style = { label: '5h', icon: '◔', resetsPrefix: '', longWindow: false };

  it('includes the reset time when present', () => {
    expect(formatWindow({ percent: 32.4, resetsAt: new Date(7 * MIN) }, style, now)).toBe('5h ◔ 32% · 0h 7m');
  });

  it('omits the reset text when the API gives none', () => {
    expect(formatWindow({ percent: 32 }, style, now)).toBe('5h ◔ 32%');
  });

  it('uses the extended prefix', () => {
    const extended = { ...style, label: 'Session (5hr)', resetsPrefix: 'Resets in ' };
    expect(formatWindow({ percent: 32, resetsAt: new Date(7 * MIN) }, extended, now)).toBe(
      'Session (5hr) ◔ 32% · Resets in 0h 7m',
    );
  });
});

describe('reset time', () => {
  const now = new Date(2026, 9, 16, 12, 0).getTime();

  it('says today when less than 24 hours remain', () => {
    expect(formatResetTime(new Date(2026, 9, 16, 18, 45), now)).toBe('today at 18:45');
  });

  it('says tomorrow when the reset crosses midnight within 24 hours', () => {
    const lateNight = new Date(2026, 9, 16, 23, 0).getTime();
    expect(formatResetTime(new Date(2026, 9, 17, 3, 0), lateNight)).toBe('tomorrow at 03:00');
  });

  it('adds weekday and date beyond 24 hours, in 24-hour format', () => {
    expect(formatResetTime(new Date(2026, 9, 23, 22, 10), now)).toBe('Fri, Oct 23 at 22:10');
  });

  it('renders one line per window with a middle dot', () => {
    const reset = new Date(2026, 9, 16, 18, 45);
    const tooltip = formatTooltip({ session: { percent: 1, resetsAt: reset }, weekly: { percent: 2, resetsAt: reset } }, now);
    expect(tooltip).toBe(
      'Session (5hr) · resets today at 18:45  \nWeekly (7 day) · resets today at 18:45',
    );
  });

  it('adds the pace lines only when a window would fill up before it resets', () => {
    const reset = new Date(2026, 9, 16, 18, 45);
    const usage = { session: { percent: 50, resetsAt: reset }, weekly: { percent: 2, resetsAt: reset } };
    const tooltip = formatTooltip(usage, now, { session: now + 80 * MIN, weekly: now - 1 });
    expect(tooltip).toBe(
      'Session (5hr) · resets today at 18:45  \nSession (5hr) · at this pace, 100% in ~1h 20m  \nWeekly (7 day) · resets today at 18:45',
    );
  });

  it('adds when the monthly limit is reached at this pace', () => {
    const spend = { used: 100, limit: 800, currency: 'USD', percent: 12.5, limitReached: false };
    expect(formatTooltip({ spend }, now, { spend: now + 30 * DAY })).toContain('At this pace, the limit is reached in ~30d 0h');
    expect(formatTooltip({ spend }, now)).not.toContain('At this pace');
  });

  it('omits lines without a reset time, and the whole tooltip when none has one', () => {
    const session = { percent: 1, resetsAt: new Date(2026, 9, 16, 18, 45) };
    expect(formatTooltip({ session, weekly: { percent: 2 } }, now)).toBe(
      'Session (5hr) · resets today at 18:45',
    );
    expect(formatTooltip({ session: { percent: 1 } }, now)).toBeUndefined();
  });
});

describe('buildView', () => {
  const now = new Date(2026, 9, 16, 12, 0).getTime();
  const usage = {
    session: { percent: 32, resetsAt: new Date(now + 7 * MIN) },
    weekly: { percent: 4, resetsAt: new Date(now + 6 * DAY + 21 * HOUR) },
  };
  const icon = () => '*';
  const base = { stale: false, loading: false };
  const compact = { extended: false, showSpend: true, windows: 'both' as const, thresholds: DEFAULT_THRESHOLDS };
  const extendedView = { ...compact, extended: true };
  const spend = { used: 7.29, limit: 800, currency: 'USD', percent: 0.91, limitReached: false };

  it('renders the default view', () => {
    expect(buildView({ ...base, usage }, compact, icon, now).text).toBe('$(sparkle) Claude Usage · 5h * 32% · 0h 7m | 7d * 4% · 6d 21h');
  });

  it('renders the extended view', () => {
    expect(buildView({ ...base, usage }, extendedView, icon, now).text).toBe(
      '$(sparkle) Claude Usage · Session (5hr) * 32% · Resets in 0h 7m | Weekly (7 day) * 4% · Resets in 6d 21h',
    );
  });

  it('marks stale data with ~ and explains why', () => {
    const view = buildView({ ...base, usage, stale: true, error: { kind: 'rate-limited', message: 'Rate limited by the API' }, retryAt: now + 90_000 }, compact, icon, now);
    expect(view.text).toContain('Claude Usage · ~5h');
    expect(view.tooltip).toContain('Retrying in 2m');
  });

  it('shows the error reason and retry time without data', () => {
    const view = buildView({ ...base, error: { kind: 'no-credentials', message: 'Credentials not found' }, retryAt: now + 30_000 }, compact, icon, now);
    expect(view.text).toBe('$(sparkle) Claude Usage: Sign in to Claude Code');
    expect(view.tooltip).toBe('Credentials not found  \nRetrying in 30s');
  });

  it('uses the warning level of the worst window', () => {
    expect(buildView({ ...base, usage: { session: { percent: 95 } } }, compact, icon, now).level).toBe('critical');
  });

  it('shows only the spend when the account has no windows', () => {
    const view = buildView({ ...base, usage: { spend } }, compact, icon, now);
    expect(view.text).toBe('$(sparkle) Claude Usage · Credits $7.29 / $800.00 * 1%');
    expect(view.tooltip).toBe('Monthly Credits · $7.29 of $800.00  \n$792.71 remaining · 0.9% used');
    expect(view.level).toBe('ok');
  });

  it('uses full wording for the spend in the extended view', () => {
    expect(buildView({ ...base, usage: { spend } }, extendedView, icon, now).text).toBe(
      '$(sparkle) Claude Usage · Monthly Credits $7.29 of $800.00 * 1%',
    );
  });

  it('appends the spend after the windows', () => {
    const text = buildView({ ...base, usage: { ...usage, spend } }, compact, icon, now).text;
    expect(text).toBe('$(sparkle) Claude Usage · 5h * 32% · 0h 7m | 7d * 4% · 6d 21h | Credits $7.29 / $800.00 * 1%');
  });

  it('shows only the selected window', () => {
    expect(buildView({ ...base, usage }, { ...compact, windows: 'session' }, icon, now).text).toBe('$(sparkle) Claude Usage · 5h * 32% · 0h 7m');
    expect(buildView({ ...base, usage }, { ...compact, windows: 'weekly' }, icon, now).text).toBe('$(sparkle) Claude Usage · 7d * 4% · 6d 21h');
  });

  it('ignores hidden windows for the warning level and the hover', () => {
    const high = { session: { percent: 95, resetsAt: new Date(now + 7 * MIN) }, weekly: { percent: 4, resetsAt: new Date(now + DAY) } };
    const view = buildView({ ...base, usage: high }, { ...compact, windows: 'weekly' }, icon, now);
    expect(view.level).toBe('ok');
    expect(view.tooltip).not.toContain('Session');
  });

  it('colors with custom thresholds', () => {
    const view = buildView({ ...base, usage }, { ...compact, thresholds: { warning: 20, critical: 30 } }, icon, now);
    expect(view.level).toBe('critical');
  });

  it('hides the spend when showSpend is off', () => {
    const view = buildView({ ...base, usage: { ...usage, spend } }, { ...compact, showSpend: false }, icon, now);
    expect(view.text).not.toContain('Credits');
    expect(view.tooltip).not.toContain('Monthly Credits');
  });

  it('does not look like an error when only the spend exists and it is hidden', () => {
    const view = buildView({ ...base, usage: { spend } }, { ...compact, showSpend: false }, icon, now);
    expect(view.text).toBe('$(sparkle) Claude Usage · spend hidden');
  });

  it('warns from 70 % of the monthly limit and flags a reached limit', () => {
    const high = { ...spend, used: 600, percent: 75 };
    expect(buildView({ ...base, usage: { spend: high } }, compact, icon, now).level).toBe('warning');
    const reached = buildView({ ...base, usage: { spend: { ...spend, limitReached: true } } }, compact, icon, now);
    expect(reached.level).toBe('critical');
    expect(reached.text).toContain('· limit reached');
  });
});

describe('formatMoney', () => {
  it('formats known currencies and falls back for unknown codes', () => {
    expect(formatMoney(7.29, 'USD')).toBe('$7.29');
    expect(formatMoney(800, 'USD')).toBe('$800.00');
    expect(formatMoney(7.5, 'XXXX')).toBe('7.50 XXXX');
  });
});
