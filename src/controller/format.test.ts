import { describe, expect, it } from 'vitest';
import { buildView, formatRemaining, formatResetTime, formatTooltip, formatWindow, levelFor, worstLevel } from './format';

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

  it('aligns both reset times in one column', () => {
    const reset = new Date(2026, 9, 16, 18, 45);
    const tooltip = formatTooltip({ session: { percent: 1, resetsAt: reset }, weekly: { percent: 2, resetsAt: reset } }, now)!;
    const [, session, weekly] = tooltip.split('\n');
    expect(session.indexOf('resets')).toBe(weekly.indexOf('resets'));
  });

  it('omits lines without a reset time, and the whole tooltip when none has one', () => {
    const session = { percent: 1, resetsAt: new Date(2026, 9, 16, 18, 45) };
    expect(formatTooltip({ session, weekly: { percent: 2 } }, now)).toBe(
      '```\nSession (5hr)   resets today at 18:45\n```',
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

  it('renders the default view', () => {
    expect(buildView({ ...base, usage }, false, icon, now).text).toBe('$(sparkle) Claude Usage 5h * 32% · 0h 7m | 7d * 4% · 6d 21h');
  });

  it('renders the extended view', () => {
    expect(buildView({ ...base, usage }, true, icon, now).text).toBe(
      '$(sparkle) Claude Usage Session (5hr) * 32% · Resets in 0h 7m | Weekly (7 day) * 4% · Resets in 6d 21h',
    );
  });

  it('marks stale data with ~ and explains why', () => {
    const view = buildView({ ...base, usage, stale: true, error: { kind: 'rate-limited', message: 'Rate limited by the API' }, retryAt: now + 90_000 }, false, icon, now);
    expect(view.text).toContain('Claude Usage ~5h');
    expect(view.tooltip).toContain('Retrying in 2m');
  });

  it('shows the error reason and retry time without data', () => {
    const view = buildView({ ...base, error: { kind: 'no-credentials', message: 'Credentials not found' }, retryAt: now + 30_000 }, false, icon, now);
    expect(view.text).toBe('$(sparkle) Claude Usage: Sign in to Claude Code');
    expect(view.tooltip).toBe('Credentials not found  \nRetrying in 30s');
  });

  it('uses the warning level of the worst window', () => {
    expect(buildView({ ...base, usage: { session: { percent: 95 } } }, false, icon, now).level).toBe('critical');
  });
});
