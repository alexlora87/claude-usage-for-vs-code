import { Sample } from '../engine/history';
import { computeForecasts } from './forecast';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const RANGE_MS = 7 * DAY;
/** A line is cut where VS Code was closed for longer than this. */
const GAP_MS = 30 * MINUTE;
/** Same cycle when the reset times differ by less than this (the API may jitter). */
const CYCLE_TOLERANCE_MS = 2 * MINUTE;
/** One hover point per this much time, so a week stays light. */
const HOVER_EVERY_MS = 30 * MINUTE;
/** From this percent a session bar is drawn as a full one. */
const HOT_AT = 90;

const WIDTH = 720;
const PLOT = { left: 40, right: 12, top: 12, bottom: 28 };

export type ChartSize = 'small' | 'medium' | 'large';

/** Height of a panel, and every how many points the percent axis has a line and a label. */
interface Layout {
  height: number;
  step: number;
}

const LAYOUTS: Record<ChartSize, Layout> = {
  small: { height: 190, step: 25 },
  medium: { height: 260, step: 20 },
  large: { height: 320, step: 10 },
};

/** The size a setting value asks for; anything unknown gets the medium one. */
export function chartSizeFrom(value: string): ChartSize {
  return (['small', 'medium', 'large'] as const).find((size) => size === value) ?? 'medium';
}

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
    const resetsAt = point.resetsAt;
    // Any earlier cycle matches too: a stale reading must not start a duplicate one.
    let cycle = result.find((c) => Math.abs(resetsAt - c.end) <= CYCLE_TOLERANCE_MS);
    if (!cycle) {
      cycle = { start: resetsAt - WINDOW_LENGTH[key], end: resetsAt, peak: 0, points: [] };
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
  layout: Layout;
}

function scale(start: number, end: number, layout: Layout): Scale {
  return {
    x: (t) => PLOT.left + ((t - start) / (end - start)) * (WIDTH - PLOT.left - PLOT.right),
    y: (percent) => PLOT.top + (1 - Math.min(100, Math.max(0, percent)) / 100) * (layout.height - PLOT.top - PLOT.bottom),
    layout,
  };
}

const f = (n: number) => n.toFixed(1);

/** Percent grid, and one line per calendar day between `start` and `end`. */
function axes(s: Scale, start: number, end: number): string {
  const { height, step } = s.layout;
  const grid = Array.from({ length: Math.floor(100 / step) + 1 }, (_, i) => i * step)
    .map((p) => `<line class="grid${p % 50 === 0 ? ' major' : ''}" x1="${PLOT.left}" x2="${WIDTH - PLOT.right}" y1="${f(s.y(p))}" y2="${f(s.y(p))}"/><text class="axis" x="${PLOT.left - 6}" y="${f(s.y(p) + 4)}" text-anchor="end">${p}%</text>`)
    .join('');
  // Calendar days, not 24-hour steps: a daylight saving change would shift the labels by an hour.
  const midnight = new Date(start);
  midnight.setHours(24, 0, 0, 0);
  const days: string[] = [];
  for (; midnight.getTime() <= end; midnight.setDate(midnight.getDate() + 1)) {
    const t = midnight.getTime();
    const label = midnight.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
    days.push(`<line class="grid" x1="${f(s.x(t))}" x2="${f(s.x(t))}" y1="${PLOT.top}" y2="${height - PLOT.bottom}"/><text class="axis" x="${f(s.x(t))}" y="${height - 8}" text-anchor="middle">${escapeHtml(label)}</text>`);
  }
  return grid + days.join('');
}

const polyline = (css: string, points: Array<[number, number]>) =>
  `<polyline class="${css}" points="${points.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')}"/>`;

const segment = (css: string, from: [number, number], to: [number, number]) => polyline(css, [from, to]);

/** A run of one reading has no line to draw: it is a dot. */
const lonePoint = (css: string, p: Reading, s: Scale) => `<circle class="${css} point" cx="${f(s.x(p.t))}" cy="${f(s.y(p.percent))}" r="2.5"/>`;

const runShape = (css: string, run: Reading[], s: Scale) =>
  run.length === 1 ? lonePoint(css, run[0], s) : polyline(css, run.map((p) => [s.x(p.t), s.y(p.percent)]));

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

function panel(title: string, note: string, svg: string, legend: string, height: number): string {
  return `<section><h2>${escapeHtml(title)}</h2><p class="sub">${escapeHtml(note)}</p><svg viewBox="0 0 ${WIDTH} ${height}" role="img" aria-label="${escapeHtml(title)}">${svg}</svg><p class="legend">${legend}</p></section>`;
}

/** The current weekly cycle against an even pace, with where it is on pace to end. */
function weeklyPanel(samples: Sample[], now: number, layout: Layout): string {
  const cycle = cycles(samples, 'weekly').reduce<Cycle | undefined>((latest, c) => (!latest || c.end > latest.end ? c : latest), undefined);
  if (!cycle || cycle.end < now - RANGE_MS) {
    return '';
  }
  // A stale reading may carry a time after the reset: it is outside the chart.
  const points = cycle.points.filter((p) => p.t <= cycle.end);
  if (!points.length) {
    return '';
  }
  const s = scale(cycle.start, cycle.end, layout);
  const last = points[points.length - 1];
  const runs = runsOf(points);

  let drawn = '';
  runs.forEach((run, i) => {
    if (i > 0) {
      const previous = runs[i - 1][runs[i - 1].length - 1];
      drawn += segment('connector', [s.x(previous.t), s.y(previous.percent)], [s.x(run[0].t), s.y(run[0].percent)]);
    }
    drawn += runShape('weekly', run, s);
    drawn += hoverDots('weekly', run, s, 'Weekly (7 day)');
  });

  let projection = '';
  // Once the cycle is over there is no pace to project: it is the last one that was read.
  const ended = cycle.end <= now;
  let note = `${ended ? 'Last cycle, reset' : 'Current cycle, resets'} ${formatTime(cycle.end)}`;
  const forecast = !ended ? computeForecasts(samples, { weekly: { percent: last.percent, resetsAt: new Date(cycle.end) } }, last.t).weekly : undefined;
  if (forecast && 'endPercent' in forecast) {
    projection = segment('projection', [s.x(last.t), s.y(last.percent)], [s.x(cycle.end), s.y(forecast.endPercent)]);
    note += ` · on pace to end at ~${Math.min(99, Math.round(forecast.endPercent))}%`;
  } else if (forecast) {
    projection = segment('projection full', [s.x(last.t), s.y(last.percent)], [s.x(forecast.fullAt), s.y(100)]);
    note += ' · at this pace it fills up before the reset';
  }

  const nowLine = now > cycle.start && now < cycle.end ? `<line class="now" x1="${f(s.x(now))}" x2="${f(s.x(now))}" y1="${PLOT.top}" y2="${layout.height - PLOT.bottom}"/>` : '';
  const pace = segment('pace', [s.x(cycle.start), s.y(0)], [s.x(cycle.end), s.y(100)]);
  const legend = '<span class="swatch weekly-bg"></span>Usage <span class="swatch pace-bg"></span>Even pace <span class="swatch projection-bg"></span>Projection';
  return panel('Weekly (7 day)', note, axes(s, cycle.start, cycle.end) + pace + nowLine + drawn + projection, legend, layout.height);
}

/** One bar per session of the last 7 days: the most it reached. */
function sessionPanel(samples: Sample[], now: number, layout: Layout): string {
  const sessions = cycles(samples, 'session').filter((c) => c.end >= now - RANGE_MS);
  if (!sessions.length) {
    return '';
  }
  const start = now - RANGE_MS;
  const s = scale(start, now, layout);
  const bars = sessions
    .map((c) => {
      const x0 = s.x(Math.max(c.start, start)) + 1;
      const x1 = s.x(Math.min(c.end, now)) - 1;
      // At least 2 px, so a session that stayed at 0 % is still a bar with its tooltip.
      const height = Math.max(s.y(0) - s.y(c.peak), 2);
      const text = c.end > now ? `Session in progress · ${Math.round(c.peak)}% so far` : `Session that ended ${formatTime(c.end)} · peak ${Math.round(c.peak)}%`;
      return `<rect class="bar${c.peak >= HOT_AT ? ' hot' : ''}" x="${f(x0)}" y="${f(s.y(0) - height)}" width="${f(Math.max(x1 - x0, 2))}" height="${f(height)}" rx="2"><title>${escapeHtml(text)}</title></rect>`;
    })
    .join('');
  const full = sessions.filter((c) => c.peak >= HOT_AT).length;
  const legend = `<span class="swatch session-bg"></span>Peak of each session <span class="swatch hot-bg"></span>Reached ${HOT_AT}%`;
  return panel('Sessions (5hr)', `Last 7 days · ${sessions.length} session${sessions.length === 1 ? '' : 's'}, ${full} at ${HOT_AT}% or more`, axes(s, start, now) + bars, legend, layout.height);
}

/** The monthly spend over the last 7 days, cut at gaps and at a new month. */
function spendPanel(samples: Sample[], now: number, layout: Layout): string {
  const runs = spendRuns(samples, now);
  if (!runs.length) {
    return '';
  }
  const start = now - RANGE_MS;
  const s = scale(start, now, layout);
  const lines = runs.map((run) => runShape('spend', run, s) + hoverDots('spend', run, s, 'Monthly Credits')).join('');
  return panel('Monthly Credits', 'Last 7 days', axes(s, start, now) + lines, '<span class="swatch spend-bg"></span>Share of the monthly limit', layout.height);
}

export function renderPanels(samples: Sample[], now: number, allowed: SeriesKey[], size: ChartSize = 'medium'): string {
  const layout = LAYOUTS[size];
  return [
    allowed.includes('session') ? sessionPanel(samples, now, layout) : '',
    allowed.includes('weekly') ? weeklyPanel(samples, now, layout) : '',
    allowed.includes('spend') ? spendPanel(samples, now, layout) : '',
  ].join('');
}
