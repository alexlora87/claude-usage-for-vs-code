import { describe, expect, it } from 'vitest';
import { Sample } from '../engine/history';
import { chartSizeFrom, cycles, escapeHtml, renderPanels, runsOf, spendRuns } from './history_charts';

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
    expect(html.match(/<rect class="bar(?: hot)?"/g)).toHaveLength(2);
    expect(html).toContain('peak 95%');
    expect(html).toContain('Session in progress · 30% so far');
  });

  it('marks the sessions that reached 90 % and counts them', () => {
    const html = renderPanels(samples, now, [...all]);
    expect(html.match(/<rect class="bar hot"/g)).toHaveLength(1);
    expect(html).toContain('2 sessions, 1 at 90% or more');
  });

  it('keeps every bar inside the plot, with some height', () => {
    const html = renderPanels([...samples, session(now - 6 * DAY, 0, now - 6 * DAY + 2 * HOUR), session(now - 7 * DAY - HOUR, 50, now - 7 * DAY + 2 * HOUR)], now, [...all]);
    const bars = [...html.matchAll(/<rect class="bar(?: hot)?" x="([\d.]+)" y="[\d.]+" width="([\d.]+)" height="([\d.]+)"/g)];
    // The two sessions above, one at 0 % and one that starts before the 7 days.
    expect(bars).toHaveLength(4);
    for (const [, x, width, height] of bars) {
      expect(Number(x)).toBeGreaterThanOrEqual(40);
      expect(Number(width)).toBeGreaterThan(0);
      expect(Number(height)).toBeGreaterThanOrEqual(2);
    }
  });

  it('draws the session in progress as wide as an ended one', () => {
    const widths = [...renderPanels(samples, now, ['session']).matchAll(/<rect class="bar(?: hot)?" x="[\d.]+" y="[\d.]+" width="([\d.]+)"/g)].map((m) => m[1]);
    expect(widths).toHaveLength(2);
    expect(widths[1]).toBe(widths[0]);
  });

  it('keeps the day labels inside the chart', () => {
    const late = new Date(2026, 9, 16, 23, 50).getTime();
    // The session resets just after midnight, so that day's line is at the right edge.
    const html = renderPanels([session(late - HOUR, 40, late + 20 * MIN)], late, ['session']);
    const xs = [...html.matchAll(/<text class="axis" x="([\d.]+)" y="[\d.]+" text-anchor="middle">/g)].map((m) => Number(m[1]));
    expect(xs).toHaveLength(8);
    expect(Math.max(...xs)).toBe(720 - 22);
  });

  it('does not duplicate a session when a stale reading comes back to an older reset time', () => {
    const stale = [...samples.slice(0, 2), samples[2], session(now - 4 * HOUR, 10, firstEnd), samples[3]];
    expect(renderPanels(stale, now, [...all]).match(/<rect class="bar(?: hot)?"/g)).toHaveLength(2);
    expect(cycles(stale, 'session')).toHaveLength(2);
  });

  it('says nothing without sessions in the last 7 days', () => {
    expect(renderPanels([session(now - 9 * DAY, 50, now - 9 * DAY + HOUR)], now, [...all])).toBe('');
  });
});

describe('accessibility of the panels', () => {
  const html = renderPanels([session(now - 2 * HOUR, 95, now + HOUR), session(now - 10 * MIN, 30, now + HOUR), weekly(now - HOUR, 40, now + DAY), spend(now - HOUR, 200)], now, [...all]);

  it('names and describes every chart with elements that exist', () => {
    for (const id of ['sessions', 'weekly', 'spend']) {
      expect(html).toContain(`<h2 id="${id}-title">`);
      expect(html).toContain(`aria-labelledby="${id}-title" aria-describedby="${id}-desc"><desc id="${id}-desc">`);
    }
    expect(html).not.toMatch(/<svg[^>]*><title>/);
  });

  it('summarizes the data in the description', () => {
    expect(html).toContain('<desc id="sessions-desc">Bar chart of the peak of each session in the last 7 days: 1 session, 1 reached 90% or more, the highest peak was 95%.</desc>');
    expect(html).toContain('Latest reading 40%.</desc>');
    expect(html).toContain('Latest reading 25% on ');
  });

  it('stripes the bars that reached 90 %, one overlay per bar', () => {
    expect(html.match(/<pattern id="hot-hatch"/g)).toHaveLength(1);
    expect(html.match(/<rect class="bar-hatch"/g)).toHaveLength(1);
    expect(html).toContain('fill="url(#hot-hatch)"');
  });

  it('draws no stripes when no session is hot, and never uses inline styles', () => {
    const calm = renderPanels([session(now - 10 * MIN, 30, now + HOUR)], now, ['session']);
    expect(calm).toContain('<rect class="bar"');
    expect(calm).not.toContain('hot-hatch');
    expect(html).not.toContain('style=');
  });
});

describe('weekly panel', () => {
  const end = now + 3 * DAY;
  // A reading every 20 minutes for 7 hours; `percentAt` gets the hours elapsed since the first one.
  const readings = (percentAt: (hours: number) => number) => [...Array(22).keys()].map((i) => weekly(now - (21 - i) * 20 * MIN, percentAt(i / 3), end));

  it('draws the cycle against an even pace and the projected end', () => {
    // 0.25 % per hour, 21.75 % now with 72 h left: on pace to end at ~40 %.
    const html = renderPanels(readings((hours) => 20 + hours * 0.25), now, [...all]);
    expect(html).toContain('<polyline class="weekly"');
    expect(html).toContain('<polyline class="pace"');
    expect(html).toContain('<polyline class="projection"');
    expect(html).toContain('on pace to end at ~40%');
  });

  it('says when the window would fill up before the reset', () => {
    const html = renderPanels(readings((hours) => 20 + hours * 5), now, [...all]);
    expect(html).toContain('<polyline class="projection full"');
    expect(html).toContain('it fills up before the reset');
  });

  it('draws no projection without enough readings', () => {
    const html = renderPanels([weekly(now - 10 * MIN, 20, end), weekly(now, 21, end)], now, [...all]);
    expect(html).toContain('<polyline class="weekly"');
    expect(html).not.toContain('<polyline class="projection');
  });

  it('joins the runs of readings across a gap with a dotted connector', () => {
    const samples = [weekly(now - 20 * HOUR, 10, end), weekly(now - 20 * HOUR + 10 * MIN, 11, end), weekly(now - 10 * MIN, 15, end), weekly(now, 16, end)];
    const html = renderPanels(samples, now, [...all]);
    expect(html.match(/<polyline class="weekly"/g)).toHaveLength(2);
    expect(html).toContain('<polyline class="connector"');
  });

  it('shows the last cycle, without a projection, once it has ended', () => {
    const ended = now - 2 * HOUR;
    const samples = [weekly(now - 9 * HOUR, 40, ended), weekly(now - 8 * HOUR, 42, ended), weekly(now - 7 * HOUR, 44, ended)];
    const html = renderPanels(samples, now, [...all]);
    expect(html).toContain('Last cycle, reset');
    expect(html).not.toContain('Current cycle');
    expect(html).not.toContain('on pace');
    expect(html).not.toContain('<polyline class="projection');
  });

  it('picks the cycle that resets last, even when a stale reading follows it', () => {
    // The older cycle shows up for the first time after the current one: the last cycle in order is not the right one.
    const samples = [weekly(now - 3 * HOUR, 5, end), weekly(now - 2 * HOUR, 6, now - 2 * DAY)];
    expect(renderPanels(samples, now, ['weekly'])).toContain('Current cycle');
  });

  it('draws a dot when a run has a single reading', () => {
    const html = renderPanels([weekly(now - 10 * MIN, 20, end)], now, ['weekly']);
    expect(html).toContain('<circle class="weekly point"');
    expect(html).not.toContain('<polyline class="weekly"');
  });

  it('marks now inside the current cycle', () => {
    expect(renderPanels([weekly(now - 10 * MIN, 20, end), weekly(now, 21, end)], now, ['weekly'])).toContain('<line class="now"');
  });

  it('says nothing without a weekly cycle', () => {
    expect(renderPanels([session(now, 10, now + HOUR)], now, ['weekly'])).toBe('');
  });
});

describe('previous weekly cycles', () => {
  const end = now + 3 * DAY;
  const start = end - 7 * DAY;
  const cycleEnd = (age: number) => end - age * 7 * DAY;
  const current = weekly(start + DAY, 30, end);
  const past = (age: number, percent: number) => weekly(cycleEnd(age) - 6 * DAY, percent, cycleEnd(age));
  const when = (t: number) => new Date(t).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  const day = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const options = (html: string) => [...html.matchAll(/<option value="(\d+)"( selected)?>([^<]*)</g)].map((m) => ({ value: Number(m[1]), selected: !!m[2], label: m[3] }));

  it('draws only the newest cycle, with a dropdown of all of them', () => {
    const html = renderPanels([past(2, 20), past(1, 50), current], now, ['weekly']);
    expect(html.match(/class="weekly point"/g)).toHaveLength(1);
    expect(html).toContain('</h2><select id="weekly-cycle" aria-label="Weekly cycle">');
    expect(options(html)).toEqual([
      { value: 0, selected: true, label: 'Current cycle' },
      { value: cycleEnd(1), selected: false, label: `${day(cycleEnd(2))} – ${day(cycleEnd(1))}` },
      { value: cycleEnd(2), selected: false, label: `${day(cycleEnd(3))} – ${day(cycleEnd(2))}` },
    ]);
  });

  it('draws the chosen cycle alone, on its own dates and without a projection', () => {
    const samples = [past(1, 50), ...[...Array(22).keys()].map((i) => weekly(now - (21 - i) * 20 * MIN, 20 + i, end))];
    const html = renderPanels(samples, now, ['weekly'], 'medium', cycleEnd(1));
    expect(options(html).map((o) => o.selected)).toEqual([false, true]);
    expect(html).toContain(`<p class="sub">Cycle that reset ${when(cycleEnd(1))} · peak 50%</p>`);
    expect(options(html)[1].label).not.toContain('Cycle that reset');
    expect(html).toContain('Latest reading 50%.</desc>');
    expect(html.match(/class="weekly point"/g)).toHaveLength(1);
    expect(html).not.toContain('<polyline class="weekly"');
    expect(html).not.toContain('class="projection');
    expect(html).not.toContain('projection-bg');
    expect(html).not.toContain('<line class="now"');
  });

  it('shows the real date of a reading of the chosen cycle in its tooltip', () => {
    const at = cycleEnd(1) - 6 * DAY;
    const html = renderPanels([weekly(at, 50, cycleEnd(1)), current], now, ['weekly'], 'medium', cycleEnd(1));
    expect(html).toContain(`Weekly (7 day): 50% · ${when(at)}`);
  });

  it('finds the chosen cycle despite a small jitter in its reset time', () => {
    const html = renderPanels([past(1, 50), current], now, ['weekly'], 'medium', cycleEnd(1) + 1000);
    expect(html).toContain('Latest reading 50%.</desc>');
  });

  it('goes back to the newest cycle when the chosen one is gone', () => {
    const html = renderPanels([past(1, 50), current], now, ['weekly'], 'medium', cycleEnd(3));
    expect(html).toContain('<p class="sub">Current cycle, resets');
    expect(options(html)[0].selected).toBe(true);
  });

  it('lists every stored cycle', () => {
    const olds = [1, 2, 3, 4, 5].map((age) => past(age, 10 * age));
    expect(options(renderPanels([...olds, current], now, ['weekly']))).toHaveLength(6);
  });

  it('has no dropdown with a single cycle, and does not repeat one for a jitter', () => {
    const html = renderPanels([current, weekly(start + 2 * DAY, 35, end + 1000)], now, ['weekly']);
    expect(html).toContain('Current cycle, resets');
    expect(html).not.toContain('<select');
  });

  it('does not list a cycle whose readings are all outside it', () => {
    const html = renderPanels([weekly(cycleEnd(1) + 3 * DAY, 90, cycleEnd(1)), current], now, ['weekly']);
    expect(html).toContain('Current cycle, resets');
    expect(html).not.toContain('<select');
  });

  it('leaves a reading outside its cycle out of the peak', () => {
    const html = renderPanels([past(1, 40), weekly(cycleEnd(1) + 3 * DAY, 90, cycleEnd(1)), current], now, ['weekly'], 'medium', cycleEnd(1));
    expect(html).toContain('peak 40%</p>');
  });

  it('names the newest cycle as the last one when it has ended', () => {
    const ended = weekly(now - 3 * DAY - HOUR, 60, now - HOUR);
    const html = renderPanels([weekly(now - 10 * DAY, 20, now - HOUR - 7 * DAY), ended], now, ['weekly']);
    expect(html).toContain('<p class="sub">Last cycle, reset');
    expect(options(html)[0].label).toBe('Last cycle');
  });
});

describe('spend panel and the allowed panels', () => {
  const samples: Sample[] = [spend(now - 20 * MIN, 100), spend(now - 10 * MIN, 101), session(now - 5 * MIN, 10, now + HOUR), weekly(now - 5 * MIN, 5, now + DAY)];

  it('draws a single spend reading as a dot', () => {
    expect(renderPanels([spend(now - 5 * MIN, 100)], now, ['spend'])).toContain('<circle class="spend point"');
  });

  it('draws the monthly spend as a line', () => {
    const html = renderPanels(samples, now, ['spend']);
    expect(html).toContain('<polyline class="spend"');
    expect(html).toContain('Monthly Credits');
  });

  it('lists the sessions first, then the weekly window and the spend', () => {
    const html = renderPanels(samples, now, [...all]);
    const titles = [...html.matchAll(/<h2 id="[a-z]+-title">([^<]+)<\/h2>/g)].map((m) => m[1]);
    expect(titles).toEqual(['Sessions (5hr)', 'Weekly (7 day)', 'Monthly Credits']);
  });

  it('labels the percent axis from 0 to 100 with the step of each size', () => {
    const labels = (size: 'small' | 'medium' | 'large') =>
      [...renderPanels([session(now - 5 * MIN, 10, now + HOUR)], now, ['session'], size).matchAll(/text-anchor="end">([^<]+)</g)].map((m) => m[1]);
    expect(labels('small')).toEqual(['0%', '25%', '50%', '75%', '100%']);
    expect(labels('medium')).toEqual(['0%', '20%', '40%', '60%', '80%', '100%']);
    expect(labels('large')).toEqual(['0%', '10%', '20%', '30%', '40%', '50%', '60%', '70%', '80%', '90%', '100%']);
  });

  it('makes the panels taller with the size, and medium is the default', () => {
    const viewBox = (size?: 'small' | 'medium' | 'large') => renderPanels([session(now - 5 * MIN, 10, now + HOUR)], now, ['session'], size).match(/viewBox="0 0 720 (\d+)"/)![1];
    expect([viewBox('small'), viewBox('medium'), viewBox('large')]).toEqual(['190', '260', '320']);
    expect(viewBox()).toBe('260');
  });

  it('scales the bars to the height of each size', () => {
    // A session at 100 % fills the plot: the height minus the 12 px above and the 28 px below.
    const bar = (size: 'small' | 'medium' | 'large') => {
      const html = renderPanels([session(now - 5 * MIN, 100, now + HOUR)], now, ['session'], size);
      const [, y, , height] = html.match(/<rect class="bar hot" x="[\d.]+" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/)!;
      return [y, height];
    };
    expect(bar('small')).toEqual(['12.0', '150.0']);
    expect(bar('medium')).toEqual(['12.0', '220.0']);
    expect(bar('large')).toEqual(['12.0', '280.0']);
  });

  it('marks the lines of 0, 50 and 100 % that the axis has', () => {
    const majors = (size: 'small' | 'medium' | 'large') =>
      renderPanels([session(now - 5 * MIN, 10, now + HOUR)], now, ['session'], size).match(/class="grid major"/g)!.length;
    expect([majors('small'), majors('medium'), majors('large')]).toEqual([3, 2, 3]);
  });

  it('draws only the allowed panels', () => {
    const html = renderPanels(samples, now, ['session']);
    expect(html).toContain('Sessions (5hr)');
    expect(html).not.toContain('Weekly (7 day)');
    expect(html).not.toContain('Monthly Credits');
  });
});

describe('chartSizeFrom', () => {
  it('knows the three sizes and falls back to medium', () => {
    expect(['small', 'medium', 'large'].map(chartSizeFrom)).toEqual(['small', 'medium', 'large']);
    expect(chartSizeFrom('huge')).toBe('medium');
    expect(chartSizeFrom('toString')).toBe('medium');
    expect(chartSizeFrom('')).toBe('medium');
  });
});

describe('escapeHtml', () => {
  it('escapes text', () => {
    expect(escapeHtml('<b>"x"&\'</b>')).toBe('&#60;b&#62;&#34;x&#34;&#38;&#39;&#60;/b&#62;');
  });
});
