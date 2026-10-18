import { Sample } from '../engine/history';

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

const WIDTH = 720;
const HEIGHT = 280;
const PLOT = { left: 40, right: 12, top: 12, bottom: 28 };

export type SeriesKey = 'session' | 'weekly' | 'spend';

interface SeriesPoint {
  t: number;
  percent: number;
  /** Cycle marker: reset time for the windows, month spend for the spend. */
  cycle?: number;
}

export interface Segment {
  points: SeriesPoint[];
}

const SERIES: Record<SeriesKey, { label: string; cssClass: string }> = {
  session: { label: 'Session (5hr)', cssClass: 'session' },
  weekly: { label: 'Weekly (7 day)', cssClass: 'weekly' },
  spend: { label: 'Monthly Credits', cssClass: 'spend' },
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function pointOf(sample: Sample, key: SeriesKey): SeriesPoint | undefined {
  const point = sample[key];
  return point ? { t: sample.t, percent: point.percent, cycle: 'used' in point ? point.used : point.resetsAt } : undefined;
}

function startsNewCycle(key: SeriesKey, previous: SeriesPoint, next: SeriesPoint): boolean {
  if (key === 'spend') {
    return (next.cycle ?? 0) < (previous.cycle ?? 0);
  }
  return previous.cycle !== undefined && next.cycle !== undefined && Math.abs(next.cycle - previous.cycle) > CYCLE_TOLERANCE_MS;
}

/** Splits a series into continuous lines: no line across a gap or a window reset. */
export function segments(samples: Sample[], key: SeriesKey, now: number): Segment[] {
  const result: Segment[] = [];
  let last: SeriesPoint | undefined;
  for (const sample of samples) {
    const point = pointOf(sample, key);
    if (!point || point.t < now - RANGE_MS) {
      continue;
    }
    if (!last || point.t - last.t > GAP_MS || startsNewCycle(key, last, point)) {
      result.push({ points: [] });
    }
    result[result.length - 1].points.push(point);
    last = point;
  }
  return result;
}

const formatTime = (t: number) =>
  new Date(t).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

export function renderHistoryHtml(samples: Sample[], now: number, nonce: string): string {
  const x = (t: number) => PLOT.left + ((t - (now - RANGE_MS)) / RANGE_MS) * (WIDTH - PLOT.left - PLOT.right);
  const y = (percent: number) => PLOT.top + (1 - Math.min(100, Math.max(0, percent)) / 100) * (HEIGHT - PLOT.top - PLOT.bottom);
  const shown = (Object.keys(SERIES) as SeriesKey[]).map((key) => ({ key, segments: segments(samples, key, now) })).filter((s) => s.segments.length);

  const grid = [0, 25, 50, 75, 100]
    .map((p) => `<line class="grid" x1="${PLOT.left}" x2="${WIDTH - PLOT.right}" y1="${y(p)}" y2="${y(p)}"/><text class="axis" x="${PLOT.left - 6}" y="${y(p) + 4}" text-anchor="end">${p}%</text>`)
    .join('');

  const firstDay = new Date(now - RANGE_MS);
  firstDay.setHours(24, 0, 0, 0);
  const days: string[] = [];
  for (let t = firstDay.getTime(); t <= now; t += DAY) {
    const label = new Date(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
    days.push(`<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="${PLOT.top}" y2="${HEIGHT - PLOT.bottom}"/><text class="axis" x="${x(t)}" y="${HEIGHT - 8}" text-anchor="middle">${escapeHtml(label)}</text>`);
  }

  const lines = shown
    .map(({ key, segments: parts }) => {
      const css = SERIES[key].cssClass;
      return parts
        .map((segment) => {
          const path = segment.points.map((p) => `${x(p.t).toFixed(1)},${y(p.percent).toFixed(1)}`).join(' ');
          let lastHover = -Infinity;
          const dots = segment.points
            .filter((p, i, all) => {
              const keep = p.t - lastHover >= HOVER_EVERY_MS || i === all.length - 1;
              lastHover = keep ? p.t : lastHover;
              return keep;
            })
            .map((p) => `<circle class="${css}-dot" cx="${x(p.t).toFixed(1)}" cy="${y(p.percent).toFixed(1)}" r="4"><title>${escapeHtml(`${SERIES[key].label}: ${Math.round(p.percent)}% · ${formatTime(p.t)}`)}</title></circle>`)
            .join('');
          return `<polyline class="${css}" points="${path}"/>${dots}`;
        })
        .join('');
    })
    .join('');

  const legend = shown.map(({ key }) => `<li><span class="swatch ${SERIES[key].cssClass}-bg"></span>${escapeHtml(SERIES[key].label)}</li>`).join('');
  const body = shown.length
    ? `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Usage history, last 7 days">${grid}${days.join('')}${lines}</svg><ul class="legend">${legend}</ul>`
    : '<p>No history yet. It fills up as the extension reads your usage.</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Claude Usage History</title>
<style nonce="${nonce}">
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px; }
h1 { font-size: 1.3em; font-weight: 600; margin: 0 0 4px; }
.sub { color: var(--vscode-descriptionForeground); margin: 0 0 16px; }
svg { width: 100%; max-width: 900px; height: auto; }
.grid { stroke: var(--vscode-editorWidget-border, #8884); stroke-width: 1; }
.axis { fill: var(--vscode-descriptionForeground); font-size: 11px; }
polyline { fill: none; stroke-width: 2; stroke-linejoin: round; }
circle { fill: transparent; }
circle:hover { fill: currentColor; }
.session { stroke: var(--vscode-charts-blue); color: var(--vscode-charts-blue); }
.weekly { stroke: var(--vscode-charts-orange); color: var(--vscode-charts-orange); }
.spend { stroke: var(--vscode-charts-green); color: var(--vscode-charts-green); }
.session-dot { color: var(--vscode-charts-blue); }
.weekly-dot { color: var(--vscode-charts-orange); }
.spend-dot { color: var(--vscode-charts-green); }
.legend { list-style: none; display: flex; gap: 16px; padding: 0; margin: 12px 0 0; }
.swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; }
.session-bg { background: var(--vscode-charts-blue); }
.weekly-bg { background: var(--vscode-charts-orange); }
.spend-bg { background: var(--vscode-charts-green); }
</style>
</head>
<body>
<h1>Claude Usage History</h1>
<p class="sub">Last 7 days, stored only on this computer.</p>
${body}
</body>
</html>`;
}
