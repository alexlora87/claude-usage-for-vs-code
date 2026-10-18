import { Sample } from '../engine/history';
import { Usage } from '../shared/types';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** The API may return slightly different reset times for the same cycle. */
const CYCLE_TOLERANCE_MS = 2 * MINUTE;
/** A drop bigger than this between two readings means the window was reset. */
const RESET_DROP = 5;
const MIN_SAMPLES = 3;
const SPEND_MIN_SPAN_MS = 24 * HOUR;
/** The monthly limit resets, so a projection beyond a month never happens. */
const MAX_SPEND_ETA_MS = 31 * 24 * HOUR;

/** What the pace of a window says: when it fills up (ms since epoch), or the percent it ends at when it does not. */
export type WindowForecast = { fullAt: number } | { endPercent: number };

/** The windows say when they fill up or how far they get; the monthly spend, the moment (ms since epoch) its limit is reached. */
export interface Forecasts {
  session?: WindowForecast;
  weekly?: WindowForecast;
  spend?: number;
}

interface Point {
  t: number;
  value: number;
}

const WINDOWS = {
  session: { lookbackMs: HOUR, minSpanMs: 20 * MINUTE },
  weekly: { lookbackMs: 48 * HOUR, minSpanMs: 6 * HOUR },
} as const;

/** Least-squares slope in value per ms (zero or negative when idle), or undefined when the points are too few or span too little. */
function regression(points: Point[], minSpanMs: number): number | undefined {
  if (points.length < MIN_SAMPLES) {
    return undefined;
  }
  const span = points[points.length - 1].t - points[0].t;
  if (span < minSpanMs) {
    return undefined;
  }
  const n = points.length;
  const meanT = points.reduce((sum, p) => sum + p.t, 0) / n;
  const meanV = points.reduce((sum, p) => sum + p.value, 0) / n;
  const covariance = points.reduce((sum, p) => sum + (p.t - meanT) * (p.value - meanV), 0);
  const variance = points.reduce((sum, p) => sum + (p.t - meanT) ** 2, 0);
  return covariance / variance;
}

/** Slope of a value that is growing; the monthly spend only projects when it moves. */
function growth(points: Point[], minSpanMs: number): number | undefined {
  const result = new Set(points.map((p) => p.value)).size < 2 ? undefined : regression(points, minSpanMs);
  return result !== undefined && result > 0 ? result : undefined;
}

/** Points after the last reset detected by `isReset`, i.e. since the window or the month last reset. */
function sinceLastReset(points: Point[], isReset: (previous: number, next: number) => boolean): Point[] {
  for (let i = points.length - 1; i > 0; i--) {
    if (isReset(points[i - 1].value, points[i].value)) {
      return points.slice(i);
    }
  }
  return points;
}

function forecastWindow(samples: Sample[], key: 'session' | 'weekly', usage: Usage, now: number): WindowForecast | undefined {
  const current = usage[key];
  const resetsAt = current?.resetsAt?.getTime();
  if (!current || resetsAt === undefined || resetsAt <= now || current.percent >= 100) {
    return undefined;
  }
  const { lookbackMs, minSpanMs } = WINDOWS[key];
  const points: Point[] = samples.flatMap((s) => {
    const point = s[key];
    const sameCycle = point?.resetsAt !== undefined && Math.abs(point.resetsAt - resetsAt) <= CYCLE_TOLERANCE_MS;
    return point && sameCycle && s.t >= now - lookbackMs && s.t < now ? [{ t: s.t, value: point.percent }] : [];
  });
  points.push({ t: now, value: current.percent });
  const pace = regression(sinceLastReset(points, (previous, next) => previous - next > RESET_DROP), minSpanMs);
  if (pace === undefined) {
    return undefined;
  }
  // An idle window (zero or slightly negative slope) stays where it is. Everything is
  // anchored to the current value: steadier than the regression intercept with integer-like steps.
  const perMs = Math.max(0, pace);
  const fullAt = perMs > 0 ? now + (100 - current.percent) / perMs : Infinity;
  return fullAt < resetsAt ? { fullAt } : { endPercent: current.percent + perMs * (resetsAt - now) };
}

function forecastSpend(samples: Sample[], usage: Usage, now: number): number | undefined {
  const current = usage.spend;
  if (!current || current.limitReached || current.used >= current.limit) {
    return undefined;
  }
  const points: Point[] = samples.flatMap((s) => (s.spend && s.t < now ? [{ t: s.t, value: s.spend.used }] : []));
  points.push({ t: now, value: current.used });
  const perMs = growth(sinceLastReset(points, (previous, next) => next < previous), SPEND_MIN_SPAN_MS);
  if (perMs === undefined) {
    return undefined;
  }
  const eta = (current.limit - current.used) / perMs;
  return eta <= MAX_SPEND_ETA_MS ? now + eta : undefined;
}

export function computeForecasts(samples: Sample[], usage: Usage, now: number): Forecasts {
  return {
    session: forecastWindow(samples, 'session', usage, now),
    weekly: forecastWindow(samples, 'weekly', usage, now),
    spend: forecastSpend(samples, usage, now),
  };
}
