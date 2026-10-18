import { describe, expect, it } from 'vitest';
import { Sample } from '../engine/history';
import { cycles, escapeHtml, renderPanels, runsOf, spendRuns } from './history_charts';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const now = new Date(2026, 9, 16, 12, 0).getTime();
const all = ['session', 'weekly', 'spend'] as const;

const session = (t: number, percent: number, resetsAt: number): Sample => ({ t, session: { percent, resetsAt } });
const weekly = (t: number, percent: number, resetsAt: number): Sample => ({ t, weekly: { percent, resetsAt } });
const spend = (t: number, used: number): Sample => ({ t, spend: { percent: used / 8, used, limit: 800 } });

describe('cycles', () => {
  it('groups the readings by reset time and keeps the peak', () => {
    const end = now + 2 * HOUR;
    const result = cycles([session(now - 30 * MIN, 10, end), session(now - 20 * MIN, 40, end), session(now - 10 * MIN, 35, end)], 'session');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ start: end - 5 * HOUR, end, peak: 40 });
    expect(result[0].points).toHaveLength(3);
  });

  it('starts a new cycle when the reset time changes, but not for a small jitter', () => {
    const end = now + 2 * HOUR;
    expect(cycles([session(now - 20 * MIN, 90, end), session(now - 10 * MIN, 2, end + 5 * HOUR)], 'session')).toHaveLength(2);
    expect(cycles([session(now - 20 * MIN, 10, end), session(now - 10 * MIN, 12, end + 1000)], 'session')).toHaveLength(1);
  });

  it('uses the length of each window and ignores readings without a reset time', () => {
    const end = now + DAY;
    expect(cycles([weekly(now, 10, end)], 'weekly')[0].start).toBe(end - 7 * DAY);
    expect(cycles([{ t: now, session: { percent: 10 } }], 'session')).toEqual([]);
  });
});

describe('runsOf and spendRuns', () => {
  it('splits readings where VS Code was closed for a while', () => {
    const points = [{ t: 0, percent: 1 }, { t: 10 * MIN, percent: 2 }, { t: 3 * HOUR, percent: 3 }];
    expect(runsOf(points).map((run) => run.length)).toEqual([2, 1]);
  });

  it('cuts the spend at a gap and when it drops, and ignores readings older than 7 days', () => {
    const runs = spendRuns([spend(now - 8 * DAY, 5), spend(now - 20 * MIN, 700), spend(now - 10 * MIN, 3), spend(now - 5 * MIN, 4)], now);
    expect(runs.map((run) => run.length)).toEqual([1, 2]);
  });
});

describe('session panel', () => {
  const firstEnd = now - 9 * HOUR;
  const secondEnd = now + 2 * HOUR;
  const samples = [
    session(now - 13 * HOUR, 20, firstEnd),
    session(now - 10 * HOUR - 10 * MIN, 95, firstEnd),
    session(now - 2 * HOUR, 10, secondEnd),
    session(now - 5 * MIN, 30, secondEnd),
  ];

  it('draws one bar per session with the most it reached', () => {
    const html = renderPanels(samples, now, [...all]);
    expect(html.match(/<rect class="bar/g)).toHaveLength(2);
    expect(html).toContain('peak 95%');
    expect(html).toContain('Session in progress · 30% so far');
  });

  it('marks the sessions that reached 90 % and counts them', () => {
    const html = renderPanels(samples, now, [...all]);
    expect(html.match(/<rect class="bar hot"/g)).toHaveLength(1);
    expect(html).toContain('2 sessions, 1 at 90% or more');
  });

  it('does not join sessions: a missing session is just a missing bar', () => {
    expect(renderPanels(samples, now, [...all])).not.toContain('<polyline');
  });

  it('says nothing without sessions in the last 7 days', () => {
    expect(renderPanels([session(now - 9 * DAY, 50, now - 9 * DAY + HOUR)], now, [...all])).toBe('');
  });
});

describe('weekly panel', () => {
  const end = now + 3 * DAY;
  const hourly = (percentAt: (i: number) => number) => [...Array(8).keys()].map((i) => weekly(now - (7 - i) * HOUR, percentAt(i), end));

  it('draws the cycle against an even pace and the projected end', () => {
    // 0.25 % per hour, 21.75 % now with 72 h left: on pace to end at ~40 %.
    const html = renderPanels(hourly((i) => 20 + i * 0.25), now, [...all]);
    expect(html).toContain('<polyline class="weekly"');
    expect(html).toContain('<polyline class="pace"');
    expect(html).toContain('<polyline class="projection"');
    expect(html).toContain('on pace to end at ~40%');
  });

  it('says when the window would fill up before the reset', () => {
    const html = renderPanels(hourly((i) => 20 + i * 5), now, [...all]);
    expect(html).toContain('<polyline class="projection full"');
    expect(html).toContain('it fills up before the reset');
  });

  it('draws no projection without enough readings', () => {
    const html = renderPanels([weekly(now - 10 * MIN, 20, end), weekly(now, 21, end)], now, [...all]);
    expect(html).toContain('<polyline class="weekly"');
    expect(html).not.toContain('<polyline class="projection');
  });

  it('joins the runs of readings across a gap with a dashed connector', () => {
    const samples = [weekly(now - 20 * HOUR, 10, end), weekly(now - 20 * HOUR + 10 * MIN, 11, end), weekly(now - 10 * MIN, 15, end), weekly(now, 16, end)];
    const html = renderPanels(samples, now, [...all]);
    expect(html.match(/<polyline class="weekly"/g)).toHaveLength(2);
    expect(html).toContain('<polyline class="connector"');
  });

  it('says nothing without a weekly cycle', () => {
    expect(renderPanels([session(now, 10, now + HOUR)], now, ['weekly'])).toBe('');
  });
});

describe('spend panel and the allowed panels', () => {
  const samples: Sample[] = [spend(now - 20 * MIN, 100), spend(now - 10 * MIN, 101), session(now - 5 * MIN, 10, now + HOUR), weekly(now - 5 * MIN, 5, now + DAY)];

  it('draws the monthly spend as a line', () => {
    const html = renderPanels(samples, now, ['spend']);
    expect(html).toContain('<polyline class="spend"');
    expect(html).toContain('Monthly Credits');
  });

  it('draws only the allowed panels', () => {
    const html = renderPanels(samples, now, ['session']);
    expect(html).toContain('Sessions (5hr)');
    expect(html).not.toContain('Weekly (7 day)');
    expect(html).not.toContain('Monthly Credits');
  });
});

describe('escapeHtml', () => {
  it('escapes text', () => {
    expect(escapeHtml('<b>"x"&\'</b>')).toBe('&#60;b&#62;&#34;x&#34;&#38;&#39;&#60;/b&#62;');
  });
});
