import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { t } from '@vscode/l10n';
import { Usage } from '../shared/types';
import { formatMoney, formatRemaining, levelFor, Thresholds } from './format';

const DAY = 24 * 60 * 60_000;
/** Markers outlive the longest cycle (the calendar month of the spend), so a cycle is never notified twice. */
const MARKER_TTL_MS = 32 * DAY;
/** The API may return slightly different reset times for the same cycle. */
const CYCLE_TOLERANCE_MINUTES = 2;
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
  const add = (window: NotifiedWindow, percent: number, cycleKey: string, message: string, reached = false, resetsAt?: Date) => {
    const level = reached ? 'critical' : levelFor(percent, thresholds);
    // A cycle that already ended is an old reading, not news.
    if (level !== 'ok' && !(resetsAt && resetsAt.getTime() <= now)) {
      result.push({ window, level, cycleKey, message });
    }
  };
  const { session, weekly, spend } = usage;
  const resets = (date: Date | undefined, longWindow: boolean) => (date ? ` ${t('Resets in {0}.', formatRemaining(date.getTime() - now, longWindow))}` : '');
  if (session) {
    add('session', session.percent, session.resetsAt ? minuteOf(session.resetsAt) : 'unknown',
      `${t('Your 5-hour session is at {0}%.', Math.round(session.percent))}${resets(session.resetsAt, false)}`, false, session.resetsAt);
  }
  if (weekly) {
    add('weekly', weekly.percent, weekly.resetsAt ? minuteOf(weekly.resetsAt) : 'unknown',
      `${t('Your 7-day window is at {0}%.', Math.round(weekly.percent))}${resets(weekly.resetsAt, true)}`, false, weekly.resetsAt);
  }
  if (spend) {
    // The API gives no reset date for the spend: the UTC calendar month only deduplicates, it is never shown.
    const month = new Date(now);
    const amounts = t('{0} of {1}', formatMoney(spend.used, spend.currency), formatMoney(spend.limit, spend.currency));
    add('spend', spend.percent, `${month.getUTCFullYear()}-${month.getUTCMonth() + 1}`,
      spend.limitReached ? t('Monthly credits limit reached ({0}).', amounts) : t('Monthly credits at {0}% ({1}).', Math.round(spend.percent), amounts),
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

/** Claims a crossing unless a marker of the same window and level exists for the same cycle (reset times within 2 minutes). */
export function claimCrossing(dir: string, account: string, crossing: Crossing): boolean {
  const minute = Number(crossing.cycleKey);
  if (Number.isFinite(minute)) {
    const prefix = `${MARKER_PREFIX}${account}-${crossing.window}-`;
    const suffix = `-${crossing.level}`;
    try {
      for (const name of readdirSync(dir)) {
        const other = name.startsWith(prefix) && name.endsWith(suffix) ? Number(name.slice(prefix.length, -suffix.length)) : NaN;
        if (Math.abs(other - minute) <= CYCLE_TOLERANCE_MINUTES) {
          return false;
        }
      }
    } catch {
      // No directory yet: nothing was claimed.
    }
  }
  return claim(dir, markerName(account, crossing));
}

/** The crossings this window has to show: none while muted, and then nothing is claimed either. */
export function claimUnlessMuted(dir: string, account: string, list: Crossing[], muted: boolean): Crossing[] {
  return muted ? [] : list.filter((crossing) => claimCrossing(dir, account, crossing));
}

/** Removes the markers of cycles that are over. */
export function pruneMarkers(dir: string, now: number): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return; // No directory yet: nothing to clean.
  }
  for (const name of names.filter((n) => n.startsWith(MARKER_PREFIX))) {
    try {
      if (now - statSync(join(dir, name)).mtimeMs > MARKER_TTL_MS) {
        unlinkSync(join(dir, name));
      }
    } catch {
      // Removed by another window meanwhile: carry on with the rest.
    }
  }
}
