import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Usage } from '../shared/types';
import { formatMoney, formatRemaining, levelFor, Thresholds } from './format';

const DAY = 24 * 60 * 60_000;
/** Markers outlive the longest window (7 days), so a cycle is never notified twice. */
const MARKER_TTL_MS = 8 * DAY;
const MARKER_PREFIX = 'notified-';

export type NotifiedWindow = 'session' | 'weekly' | 'spend';

export interface Crossing {
  window: NotifiedWindow;
  level: 'warning' | 'critical';
  /** Identifies the cycle of the window, so each cycle notifies once per level. */
  cycleKey: string;
  message: string;
}

const minuteOf = (date: Date) => String(Math.round(date.getTime() / 60_000));

/** The windows (and the monthly spend) that are at or above a threshold, with the text to show. */
export function crossings(usage: Usage, thresholds: Thresholds, now: number): Crossing[] {
  const result: Crossing[] = [];
  const add = (window: NotifiedWindow, percent: number, cycleKey: string, message: string, reached = false) => {
    const level = reached ? 'critical' : levelFor(percent, thresholds);
    if (level !== 'ok') {
      result.push({ window, level, cycleKey, message });
    }
  };
  const { session, weekly, spend } = usage;
  const resets = (date: Date | undefined, longWindow: boolean) => (date ? ` Resets in ${formatRemaining(date.getTime() - now, longWindow)}.` : '');
  if (session) {
    add('session', session.percent, session.resetsAt ? minuteOf(session.resetsAt) : 'unknown',
      `Your 5-hour session is at ${Math.round(session.percent)}%.${resets(session.resetsAt, false)}`);
  }
  if (weekly) {
    add('weekly', weekly.percent, weekly.resetsAt ? minuteOf(weekly.resetsAt) : 'unknown',
      `Your 7-day window is at ${Math.round(weekly.percent)}%.${resets(weekly.resetsAt, true)}`);
  }
  if (spend) {
    // The API gives no reset date for the spend: the calendar month only deduplicates, it is never shown.
    const month = new Date(now);
    const amounts = `${formatMoney(spend.used, spend.currency)} of ${formatMoney(spend.limit, spend.currency)}`;
    add('spend', spend.percent, `${month.getFullYear()}-${month.getMonth() + 1}`,
      spend.limitReached ? `Monthly credits limit reached (${amounts}).` : `Monthly credits at ${Math.round(spend.percent)}% (${amounts}).`,
      spend.limitReached);
  }
  return result;
}

/** Marker file name for one notification: unique per account, window, cycle and level. */
export function markerName(accountId: string, crossing: Crossing): string {
  return `${MARKER_PREFIX}${accountId}-${crossing.window}-${crossing.cycleKey}-${crossing.level}`;
}

/**
 * Creates the marker atomically. Only the VS Code window that creates it may notify; the others
 * (or any I/O failure) get false, so a failure never turns into duplicate notifications.
 */
export function claim(dir: string, name: string): boolean {
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(join(dir, name), '', { flag: 'wx', mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

/** Removes the markers of cycles that are over. */
export function pruneMarkers(dir: string, now: number): void {
  try {
    for (const name of readdirSync(dir)) {
      if (name.startsWith(MARKER_PREFIX) && now - statSync(join(dir, name)).mtimeMs > MARKER_TTL_MS) {
        unlinkSync(join(dir, name));
      }
    }
  } catch {
    // Missing directory or a marker removed by another window: nothing to clean.
  }
}
