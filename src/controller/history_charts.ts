import { Sample } from '../engine/history';
import { computeForecasts } from './forecast';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
export const RANGE_MS = 7 * DAY;
/** A line is cut where VS Code was closed for longer than this. */
const GAP_MS = 30 * MINUTE;
/** Same cycle when the reset times differ by less than this (the API may jitter). */
const CYCLE_TOLERANCE_MS = 2 * MINUTE;
/** One hover point per this much time, so a week stays light. */
const HOVER_EVERY_MS = 30 * MINUTE;
/** From this percent a session bar is drawn as a full one. */
const HOT_AT = 90;

const WIDTH = 720;
const HEIGHT = 190;
const PLOT = { left: 40, right: 12, top: 12, bottom: 28 };

export type SeriesKey = 'session' | 'weekly' | 'spend';

const WINDOW_LENGTH = { session: 5 * HOUR, weekly: 7 * DAY } as const;

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const formatTime = (t: number) =>
  new Date(t).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

interface Reading {
  t: number;
  percent: number;
}

/** The readings of one cycle of a window, from its start to its reset. */
export interface Cycle {
  start: number;
  end: number;
  peak: number;
  points: Reading[];
}

/** Groups the readings of a window by cycle (the reset time tells which one). */
export function cycles(samples: Sample[], key: 'session' | 'weekly'): Cycle[] {
  const result: Cycle[] = [];
  for (const sample of samples) {
    const point = sample[key];
    if (!point || point.resetsAt === undefined) {
      continue;
    }
    let cycle = result[result.length - 1];
    if (!cycle || Math.abs(point.resetsAt - cycle.end) > CYCLE_TOLERANCE_MS) {
      cycle = { start: point.resetsAt - WINDOW_LENGTH[key], end: point.resetsAt, peak: 0, points: [] };
      result.push(cycle);
    }
    cycle.peak = Math.max(cycle.peak, point.percent);
    cycle.points.push({ t: sample.t, percent: point.percent });
  }
  return result;
}

interface SpendPoint extends Reading {
  /** Spent so far: it drops when the month changes. */
  used: number;
}

/** Splits the spend into continuous lines: no line across a gap or a new month. */
export function spendRuns(samples: Sample[], now: number): SpendPoint[][] {
  const runs: SpendPoint[][] = [];
  let last: SpendPoint | undefined;
  for (const sample of samples) {
    if (!sample.spend || sample.t < now - RANGE_MS) {
      continue;
    }
    const point = { t: sample.t, percent: sample.spend.percent, used: sample.spend.used };
    if (!last || point.t - last.t > GAP_MS || point.used < last.used) {
      runs.push([]);
    }
    runs[runs.length - 1].push(point);
    last = point;
  }
  return runs;
}

/** Splits readings into continuous runs, cut where VS Code was closed for a while. */
export function runsOf<T extends Reading>(points: T[]): T[][] {
  const runs: T[][] = [];
  points.forEach((point, i) => {
    if (i === 0 || point.t - points[i - 1].t > GAP_MS) {
      runs.push([]);
    }
    runs[runs.length - 1].push(point);
  });
  return runs;
}

interface Scale {
  x(t: number): number;
  y(percent: number): number;
}

function scale(start: number, end: number): Scale {
  return {
    x: (t) => PLOT.left + ((t - start) / (end - start)) * (WIDTH - PLOT.left - PLOT.right),
    y: (percent) => PLOT.top + (1 - Math.min(100, Math.max(0, percent)) / 100) * (HEIGHT - PLOT.top - PLOT.bottom),
  };
}

const f = (n: number) => n.toFixed(1);

/** Percent grid, and one line per calendar day between `start` and `end`. */
function axes(s: Scale, start: number, end: number): string {
  const grid = [0, 25, 50, 75, 100]
    .map((p) => `<line class="grid" x1="${PLOT.left}" x2="${WIDTH - PLOT.right}" y1="${f(s.y(p))}" y2="${f(s.y(p))}"/><text class="axis" x="${PLOT.left - 6}" y="${f(s.y(p) + 4)}" text-anchor="end">${p}%</text>`)
    .join('');
  // Calendar days, not 24-hour steps: a daylight saving change would shift the labels by an hour.
  const midnight = new Date(start);
  midnight.setHours(24, 0, 0, 0);
  const days: string[] = [];
  for (; midnight.getTime() <= end; midnight.setDate(midnight.getDate() + 1)) {
    const t = midnight.getTime();
    const label = midnight.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
    days.push(`<line class="grid" x1="${f(s.x(t))}" x2="${f(s.x(t))}" y1="${PLOT.top}" y2="${HEIGHT - PLOT.bottom}"/><text class="axis" x="${f(s.x(t))}" y="${HEIGHT - 8}" text-anchor="middle">${escapeHtml(label)}</text>`);
  }
  return grid + days.join('');
}

const polyline = (css: string, points: Array<[number, number]>) =>
  `<polyline class="${css}" points="${points.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')}"/>`;

const segment = (css: string, from: [number, number], to: [number, number]) => polyline(css, [from, to]);

/** Invisible circles that show a tooltip on hover, one per half hour and always the last of a run. */
function hoverDots(css: string, run: Reading[], s: Scale, label: string): string {
  let lastHover = -Infinity;
  return run
    .filter((p, i) => {
      const keep = p.t - lastHover >= HOVER_EVERY_MS || i === run.length - 1;
      lastHover = keep ? p.t : lastHover;
      return keep;
    })
    .map((p) => `<circle class="${css}-dot" cx="${f(s.x(p.t))}" cy="${f(s.y(p.percent))}" r="4"><title>${escapeHtml(`${label}: ${Math.round(p.percent)}% · ${formatTime(p.t)}`)}</title></circle>`)
    .join('');
}

function panel(title: string, note: string, svg: string, legend: string): string {
  return `<section><h2>${escapeHtml(title)}</h2><p class="sub">${escapeHtml(note)}</p><svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeHtml(title)}">${svg}</svg><p class="legend">${legend}</p></section>`;
}

/** The current weekly cycle against an even pace, with where it is on pace to end. */
function weeklyPanel(samples: Sample[], now: number): string {
  const all = cycles(samples, 'weekly');
  const cycle = all[all.length - 1];
  if (!cycle || cycle.end < now - RANGE_MS) {
    return '';
  }
  const s = scale(cycle.start, cycle.end);
  const last = cycle.points[cycle.points.length - 1];
  const runs = runsOf(cycle.points);

  let drawn = '';
  runs.forEach((run, i) => {
    if (i > 0) {
      const previous = runs[i - 1][runs[i - 1].length - 1];
      drawn += segment('connector', [s.x(previous.t), s.y(previous.percent)], [s.x(run[0].t), s.y(run[0].percent)]);
    }
    drawn += polyline('weekly', run.map((p) => [s.x(p.t), s.y(p.percent)]));
    drawn += hoverDots('weekly', run, s, 'Weekly (7 day)');
  });

  let projection = '';
  let note = `Current cycle, resets ${formatTime(cycle.end)}`;
  const forecast = last.t < cycle.end ? computeForecasts(samples, { weekly: { percent: last.percent, resetsAt: new Date(cycle.end) } }, last.t).weekly : undefined;
  if (forecast && 'endPercent' in forecast) {
    projection = segment('projection', [s.x(last.t), s.y(last.percent)], [s.x(cycle.end), s.y(forecast.endPercent)]);
    note += ` · on pace to end at ~${Math.min(99, Math.round(forecast.endPercent))}%`;
  } else if (forecast) {
    projection = segment('projection full', [s.x(last.t), s.y(last.percent)], [s.x(Math.min(forecast.fullAt, cycle.end)), s.y(100)]);
    note += ' · at this pace it fills up before the reset';
  }

  const nowLine = now > cycle.start && now < cycle.end ? `<line class="now" x1="${f(s.x(now))}" x2="${f(s.x(now))}" y1="${PLOT.top}" y2="${HEIGHT - PLOT.bottom}"/>` : '';
  const pace = segment('pace', [s.x(cycle.start), s.y(0)], [s.x(cycle.end), s.y(100)]);
  const legend = '<span class="swatch weekly-bg"></span>Usage <span class="swatch pace-bg"></span>Even pace <span class="swatch projection-bg"></span>Projection';
  return panel('Weekly (7 day)', note, axes(s, cycle.start, cycle.end) + pace + nowLine + drawn + projection, legend);
}

/** One bar per session of the last 7 days: the most it reached. */
function sessionPanel(samples: Sample[], now: number): string {
  const sessions = cycles(samples, 'session').filter((c) => c.end >= now - RANGE_MS);
  if (!sessions.length) {
    return '';
  }
  const start = now - RANGE_MS;
  const s = scale(start, now);
  const bars = sessions
    .map((c) => {
      const x0 = s.x(Math.max(c.start, start)) + 1;
      const x1 = s.x(Math.min(c.end, now)) - 1;
      const top = s.y(c.peak);
      const text = c.end > now ? `Session in progress · ${Math.round(c.peak)}% so far` : `Session that ended ${formatTime(c.end)} · peak ${Math.round(c.peak)}%`;
      return `<rect class="bar${c.peak >= HOT_AT ? ' hot' : ''}" x="${f(x0)}" y="${f(top)}" width="${f(Math.max(x1 - x0, 2))}" height="${f(s.y(0) - top)}" rx="2"><title>${escapeHtml(text)}</title></rect>`;
    })
    .join('');
  const full = sessions.filter((c) => c.peak >= HOT_AT).length;
  const legend = `<span class="swatch session-bg"></span>Peak of each session <span class="swatch hot-bg"></span>Reached ${HOT_AT}%`;
  return panel('Sessions (5hr)', `Last 7 days · ${sessions.length} session${sessions.length === 1 ? '' : 's'}, ${full} at ${HOT_AT}% or more`, axes(s, start, now) + bars, legend);
}

/** The monthly spend over the last 7 days, cut at gaps and at a new month. */
function spendPanel(samples: Sample[], now: number): string {
  const runs = spendRuns(samples, now);
  if (!runs.length) {
    return '';
  }
  const start = now - RANGE_MS;
  const s = scale(start, now);
  const lines = runs.map((run) => polyline('spend', run.map((p) => [s.x(p.t), s.y(p.percent)])) + hoverDots('spend', run, s, 'Monthly Credits')).join('');
  return panel('Monthly Credits', 'Last 7 days', axes(s, start, now) + lines, '<span class="swatch spend-bg"></span>Share of the monthly limit');
}

export function renderPanels(samples: Sample[], now: number, allowed: SeriesKey[]): string {
  return [
    allowed.includes('session') ? sessionPanel(samples, now) : '',
    allowed.includes('weekly') ? weeklyPanel(samples, now) : '',
    allowed.includes('spend') ? spendPanel(samples, now) : '',
  ].join('');
}
